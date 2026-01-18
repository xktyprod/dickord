/**
 * WebRTC Voice Chat Service
 * 
 * Uses "Perfect Negotiation" pattern to handle simultaneous connections.
 * Firebase Firestore for signaling.
 * Mesh topology with proper ICE candidate buffering.
 */

import { db, auth } from '../firebase';
import { 
  doc, 
  collection, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where,
  serverTimestamp,
  getDocs,
  writeBatch
} from 'firebase/firestore';

// ============================================================================
// CONFIGURATION
// ============================================================================

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // Free TURN servers for NAT traversal (important for VPN users)
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

const VOLUME_CHECK_INTERVAL = 100; // ms
const ICE_CANDIDATE_BATCH_DELAY = 100; // ms - delay before sending batched ICE candidates

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const state = {
  channelId: null,
  myUserId: null,
  myUserName: null,
  localStream: null,
  processedStream: null, // Processed audio stream with input gain applied
  silentStream: null, // Silent audio stream for noise gate
  screenStream: null,
  audioContext: null,
  localAnalyser: null,
  localGainNode: null, // For input volume control
  volumeInterval: null,
  peers: new Map(), // oderId -> PeerState
  unsubscribers: [],
  processedMessages: new Set(), // Track processed message IDs to avoid duplicates
  micManuallyMuted: false,
  noiseGateOpen: true,
  noiseGateTimeout: null,
  noiseGateOpenTimeout: null,
  iceCandidateBatches: new Map(), // peerId -> { candidates: [], timeout: null }
  inputVolume: 100, // Global input volume 0-100%
  outputVolume: 100, // Global output volume 0-100%
  outputDevice: 'default', // Selected output device ID
  
  // Callbacks
  onUserJoined: null,
  onUserLeft: null,
  onVolumeIndicator: null,
  onScreenShare: null,
  onScreenShareEnded: null,
  appSettings: null
};

// Per-peer connection state
class PeerState {
  constructor(oderId, userName) {
    this.oderId = oderId;
    this.userName = userName;
    this.pc = null;
    this.iceCandidateBuffer = [];
    this.remoteDescriptionSet = false;
    this.makingOffer = false;
    this.ignoreOffer = false;
    this.audioElement = null;
    this.gainNode = null;
    this.analyser = null;
    this.sourceNode = null;
    this.volume = 100; // 0-200%
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Determine if we are the "polite" peer (for perfect negotiation)
 * Polite peer will rollback their offer if collision occurs
 */
const isPolite = (otherUserId) => {
  return state.myUserId < otherUserId;
};

/**
 * Generate unique document ID for signaling
 */
const genSignalingId = () => {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
};

/**
 * Clean up old signaling messages from this user in this channel
 */
const cleanupMySignaling = async () => {
  if (!state.channelId || !state.myUserId) return;
  
  try {
    // Clean up messages FROM us
    const fromQuery = query(
      collection(db, 'voiceSignaling'),
      where('channelId', '==', state.channelId),
      where('fromId', '==', state.myUserId)
    );
    const fromDocs = await getDocs(fromQuery);
    
    // Clean up messages TO us
    const toQuery = query(
      collection(db, 'voiceSignaling'),
      where('channelId', '==', state.channelId),
      where('toId', '==', state.myUserId)
    );
    const toDocs = await getDocs(toQuery);
    
    const batch = writeBatch(db);
    fromDocs.forEach(d => batch.delete(d.ref));
    toDocs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    
    console.log(`Cleaned up ${fromDocs.size + toDocs.size} signaling messages`);
  } catch (err) {
    console.warn('Cleanup signaling error:', err);
  }
};


// ============================================================================
// PEER CONNECTION MANAGEMENT
// ============================================================================

/**
 * Create a new RTCPeerConnection for a peer
 */
const createPeerConnection = (peerState) => {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  peerState.pc = pc;
  
  // Add local audio tracks to the connection
  // Use processed stream (with input gain applied) or silent track
  // Priority: processedStream (has gain) > localStream (raw) > silentStream
  if (state.localStream) {
    const useRealTrack = state.noiseGateOpen && !state.micManuallyMuted;
    
    // Use processed stream if available (has input volume applied)
    // Otherwise fall back to raw local stream
    const realStream = state.processedStream || state.localStream;
    const realTrack = realStream.getAudioTracks()[0];
    const silentTrack = state.silentStream?.getAudioTracks()[0];
    
    const trackToUse = useRealTrack ? realTrack : silentTrack;
    
    if (trackToUse) {
      const streamToSend = useRealTrack ? realStream : state.silentStream;
      pc.addTrack(trackToUse, streamToSend);
      console.log(`Added ${useRealTrack ? 'processed' : 'silent'} audio track to peer connection for ${peerState.userName}`);
    } else if (useRealTrack) {
      // Fallback to raw local stream
      state.localStream.getTracks().forEach(track => {
        pc.addTrack(track, state.localStream);
      });
      console.log(`Fallback: Added raw audio track to peer connection for ${peerState.userName}`);
    } else {
      // Silent stream not ready - add real track temporarily
      console.warn(`Silent stream not ready for ${peerState.userName}, adding real track temporarily`);
      state.localStream.getTracks().forEach(track => {
        pc.addTrack(track, state.localStream);
      });
    }
  }
  
  // Add screen share track if we're currently sharing
  if (state.screenStream) {
    const videoTrack = state.screenStream.getVideoTracks()[0];
    if (videoTrack && videoTrack.readyState === 'live') {
      console.log(`Adding existing screen share track to new peer: ${peerState.userName}`);
      pc.addTrack(videoTrack, state.screenStream);
    }
  }
  
  // Handle ICE candidates with batching to reduce Firestore writes
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      batchIceCandidate(peerState.oderId, event.candidate.toJSON());
    }
  };
  
  // Handle connection state changes
  pc.onconnectionstatechange = () => {
    console.log(`Connection state with ${peerState.userName}: ${pc.connectionState}`);
    
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
      console.log(`Peer ${peerState.userName} connection ${pc.connectionState}`);
      // Notify that user left
      if (state.onUserLeft) {
        state.onUserLeft(peerState.oderId, peerState.userName);
      }
    }
  };
  
  // Handle incoming tracks (remote audio)
  pc.ontrack = (event) => {
    console.log(`Received track from ${peerState.userName}:`, event.track.kind);
    console.log(`Track state: enabled=${event.track.enabled}, muted=${event.track.muted}, readyState=${event.track.readyState}`);
    console.log(`Streams count:`, event.streams.length);
    
    if (event.track.kind === 'audio') {
      const track = event.track;
      const stream = event.streams[0] || new MediaStream([track]);
      
      // If track is muted, wait for it to unmute before setting up audio
      if (track.muted) {
        console.log(`Track is muted, waiting for unmute...`);
        track.onunmute = () => {
          console.log(`Track unmuted for ${peerState.userName}`);
          track.onunmute = null; // Remove handler to prevent double setup
          setupRemoteAudio(peerState, stream);
        };
      } else {
        setupRemoteAudio(peerState, stream);
      }
    } else if (event.track.kind === 'video') {
      // Screen share track - notify via callback
      console.log(`Received screen share from ${peerState.userName}`);
      const stream = event.streams[0] || new MediaStream([event.track]);
      const track = event.track;
      
      // Store reference to track for cleanup
      peerState.screenShareTrack = track;
      
      // Helper to notify screen share ended
      const notifyScreenShareEnded = () => {
        console.log(`Screen share ended from ${peerState.userName}`);
        peerState.screenShareTrack = null;
        if (state.onScreenShareEnded) {
          state.onScreenShareEnded(peerState.oderId, peerState.userName);
        }
      };
      
      // Listen for track ending (when sharer stops)
      track.onended = notifyScreenShareEnded;
      
      // Also listen for mute - some browsers fire mute instead of ended
      track.onmute = () => {
        console.log(`Screen share track muted from ${peerState.userName}, readyState: ${track.readyState}`);
        // If track is ended or muted permanently, notify
        if (track.readyState === 'ended') {
          notifyScreenShareEnded();
        }
      };
      
      if (state.onScreenShare) {
        state.onScreenShare(peerState.oderId, peerState.userName, stream);
      }
    }
  };
  
  // Perfect Negotiation: handle negotiationneeded
  pc.onnegotiationneeded = async () => {
    // Skip if we're already making an offer
    if (peerState.makingOffer) {
      console.log(`Skipping negotiation for ${peerState.userName} - already making offer`);
      return;
    }
    
    try {
      console.log(`Negotiation needed for ${peerState.userName}, creating offer...`);
      peerState.makingOffer = true;
      const offer = await pc.createOffer();
      
      // Check if state changed while creating offer
      if (pc.signalingState !== 'stable') {
        console.log(`Signaling state changed to ${pc.signalingState}, aborting offer`);
        return;
      }
      
      await pc.setLocalDescription(offer);
      
      sendSignalingMessage({
        type: 'offer',
        sdp: pc.localDescription.sdp,
        toId: peerState.oderId
      });
    } catch (err) {
      console.error('Error creating offer:', err);
    } finally {
      peerState.makingOffer = false;
    }
  };
  
  return pc;
};

/**
 * Set up audio playback for a remote peer with volume control
 */
const setupRemoteAudio = async (peerState, stream) => {
  console.log('Setting up remote audio for ' + peerState.userName);
  console.log('Stream tracks:', stream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, muted: t.muted })));
  
  // Clean up previous audio setup
  if (peerState.audioElement) {
    peerState.audioElement.pause();
    peerState.audioElement.srcObject = null;
    peerState.audioElement.remove();
  }
  if (peerState.sourceNode) {
    try {
      peerState.sourceNode.disconnect();
    } catch (e) {}
  }
  
  // Method 1: Simple Audio Element (most reliable)
  const audio = document.createElement('audio');
  audio.autoplay = true;
  audio.playsInline = true;
  audio.srcObject = stream;
  
  // Apply selected output device
  const outputDevice = state.outputDevice || 'default';
  if (audio.setSinkId && outputDevice && outputDevice !== 'default') {
    try {
      await audio.setSinkId(outputDevice);
    } catch (err) {
      console.error('Failed to set audio output device:', err);
    }
  }
  
  // Apply both per-user volume and global output volume
  const userVolume = peerState.volume || 100;
  const globalVolume = state.outputVolume || 100;
  const combinedVolume = (userVolume / 100) * (globalVolume / 100);
  audio.volume = Math.min(1, combinedVolume);
  
  document.body.appendChild(audio);
  audio.style.display = 'none';
  peerState.audioElement = audio;
  
  // Try to play
  const playPromise = audio.play();
  if (playPromise) {
    playPromise.then(() => {
      console.log('Audio element playing for ' + peerState.userName);
    }).catch(err => {
      console.error('Error playing audio element for ' + peerState.userName + ':', err);
    });
  }
  
  // Method 2: Also set up AudioContext for volume control above 100% and analysis
  try {
    if (!state.audioContext) {
      state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // Resume audio context
    if (state.audioContext.state === 'suspended') {
      state.audioContext.resume().then(() => {
        console.log('AudioContext resumed');
      });
    }
    
    // For volume above 100%, we need to use Web Audio API
    // But for now, just set up analyser for speaking detection
    const source = state.audioContext.createMediaStreamSource(stream);
    const analyser = state.audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    // Don't connect to destination - audio element handles playback
    
    peerState.sourceNode = source;
    peerState.analyser = analyser;
    
    // For volume > 100%, we need GainNode connected to destination
    if (peerState.volume > 100) {
      const gainNode = state.audioContext.createGain();
      gainNode.gain.value = peerState.volume / 100;
      source.connect(gainNode);
      gainNode.connect(state.audioContext.destination);
      peerState.gainNode = gainNode;
      // Mute the audio element since we're using AudioContext
      audio.volume = 0;
      console.log(`Using AudioContext for ${peerState.userName} with gain=${gainNode.gain.value}`);
    }
    
    console.log(`Audio analysis set up for ${peerState.userName}`);
    
  } catch (err) {
    console.warn('Could not set up audio analysis:', err);
  }
};


// ============================================================================
// SIGNALING
// ============================================================================

/**
 * Send a signaling message via Firebase
 */
const sendSignalingMessage = async (message) => {
  if (!state.channelId || !state.myUserId) return;
  
  try {
    const docId = genSignalingId();
    await setDoc(doc(db, 'voiceSignaling', docId), {
      ...message,
      channelId: state.channelId,
      fromId: state.myUserId,
      fromName: state.myUserName,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error('Error sending signaling message:', err);
  }
};

/**
 * Batch ICE candidates to reduce Firestore writes
 * Instead of sending each candidate immediately, collect them and send as a batch
 */
const batchIceCandidate = (peerId, candidate) => {
  let batch = state.iceCandidateBatches.get(peerId);
  
  if (!batch) {
    batch = { candidates: [], timeout: null };
    state.iceCandidateBatches.set(peerId, batch);
  }
  
  batch.candidates.push(candidate);
  
  // Clear existing timeout
  if (batch.timeout) {
    clearTimeout(batch.timeout);
  }
  
  // Set new timeout to send batch
  batch.timeout = setTimeout(() => {
    const candidates = batch.candidates;
    batch.candidates = [];
    batch.timeout = null;
    
    if (candidates.length > 0) {
      // Send all candidates in one message
      sendSignalingMessage({
        type: 'ice-candidates-batch',
        candidates: candidates,
        toId: peerId
      });
      console.log(`Sent ${candidates.length} ICE candidates to ${peerId} in batch`);
    }
  }, ICE_CANDIDATE_BATCH_DELAY);
};

/**
 * Handle incoming signaling message (Perfect Negotiation pattern)
 */
const handleSignalingMessage = async (data) => {
  const { type, fromId, fromName, sdp, candidate, candidates } = data;
  
  // Ignore messages from self
  if (fromId === state.myUserId) return;
  
  console.log(`Received signaling message: ${type} from ${fromName} (${fromId})`);
  
  // Get or create peer state
  let peerState = state.peers.get(fromId);
  let isNewPeer = false;
  
  if (!peerState) {
    console.log(`Creating new peer connection for ${fromName}`);
    peerState = new PeerState(fromId, fromName);
    state.peers.set(fromId, peerState);
    createPeerConnection(peerState);
    isNewPeer = true;
    
    if (state.onUserJoined) {
      state.onUserJoined(fromId, fromName, null);
    }
  }
  
  const pc = peerState.pc;
  if (!pc) return;
  
  try {
    // Handle "join" message - someone joined, we need to initiate connection
    if (type === 'join') {
      // If peer already exists and connection is active, ignore duplicate join
      if (!isNewPeer && pc.connectionState !== 'failed' && pc.connectionState !== 'closed') {
        console.log(`Ignoring duplicate join from ${fromName} - connection already exists (${pc.connectionState})`);
        return;
      }
      console.log(`${fromName} joined the channel`);
      // The onnegotiationneeded event will fire automatically when tracks are added
      // and will create the offer. We just need to make sure the peer connection exists.
      return;
    }
    
    if (type === 'offer') {
      // Perfect Negotiation: handle offer collision
      const offerCollision = peerState.makingOffer || pc.signalingState !== 'stable';
      const polite = isPolite(fromId);
      
      peerState.ignoreOffer = !polite && offerCollision;
      
      if (peerState.ignoreOffer) {
        console.log(`Ignoring offer from ${fromName} (collision, we are impolite)`);
        return;
      }
      
      // If we're polite and there's a collision, rollback our offer
      if (offerCollision && polite) {
        console.log(`Rolling back our offer due to collision with ${fromName}`);
      }
      
      await pc.setRemoteDescription({ type: 'offer', sdp });
      peerState.remoteDescriptionSet = true;
      
      // Flush buffered ICE candidates
      await flushIceCandidates(peerState);
      
      // Create and send answer
      await pc.setLocalDescription();
      
      sendSignalingMessage({
        type: 'answer',
        sdp: pc.localDescription.sdp,
        toId: fromId
      });
      
    } else if (type === 'answer') {
      // Only accept answer if we're expecting one
      if (pc.signalingState !== 'have-local-offer') {
        console.log(`Ignoring answer from ${fromName} - wrong state: ${pc.signalingState}`);
        return;
      }
      
      await pc.setRemoteDescription({ type: 'answer', sdp });
      peerState.remoteDescriptionSet = true;
      
      // Flush buffered ICE candidates
      await flushIceCandidates(peerState);
      
    } else if (type === 'ice-candidate') {
      // Single ICE candidate (legacy support)
      if (candidate) {
        if (peerState.remoteDescriptionSet && pc.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            if (!peerState.ignoreOffer) {
              console.warn('Error adding ICE candidate:', err);
            }
          }
        } else {
          // Buffer the candidate until remote description is set
          peerState.iceCandidateBuffer.push(candidate);
        }
      }
    } else if (type === 'ice-candidates-batch') {
      // Batched ICE candidates (optimized)
      if (candidates && Array.isArray(candidates)) {
        console.log(`Received ${candidates.length} batched ICE candidates from ${fromName}`);
        for (const cand of candidates) {
          if (peerState.remoteDescriptionSet && pc.remoteDescription) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch (err) {
              if (!peerState.ignoreOffer) {
                console.warn('Error adding batched ICE candidate:', err);
              }
            }
          } else {
            // Buffer the candidate until remote description is set
            peerState.iceCandidateBuffer.push(cand);
          }
        }
      }
    } else if (type === 'screen-share-ended') {
      // Remote user stopped screen sharing
      console.log(`Screen share ended signal from ${fromName}`);
      peerState.screenShareTrack = null;
      if (state.onScreenShareEnded) {
        state.onScreenShareEnded(fromId, fromName);
      }
    }
  } catch (err) {
    console.error('Error handling signaling message:', err);
  }
};

/**
 * Flush buffered ICE candidates after remote description is set
 */
const flushIceCandidates = async (peerState) => {
  const pc = peerState.pc;
  if (!pc || !pc.remoteDescription) return;
  
  const candidates = peerState.iceCandidateBuffer;
  peerState.iceCandidateBuffer = [];
  
  for (const candidate of candidates) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn('Error adding buffered ICE candidate:', err);
    }
  }
};

/**
 * Start listening for signaling messages
 */
const startSignalingListener = () => {
  if (!state.channelId) return;
  
  // Track when we started listening to ignore old messages
  const listenerStartTime = Date.now();
  
  const signalingQuery = query(
    collection(db, 'voiceSignaling'),
    where('channelId', '==', state.channelId)
  );
  
  const unsubscribe = onSnapshot(signalingQuery, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const docId = change.doc.id;
        const data = change.doc.data();
        const timestamp = data.timestamp?.toMillis?.() || 0;
        
        // Skip if we already processed this message
        if (state.processedMessages.has(docId)) {
          return;
        }
        
        // Ignore messages older than 5 seconds (stale from previous sessions)
        if (timestamp > 0 && Date.now() - timestamp > 5000) {
          deleteDoc(change.doc.ref).catch(() => {});
          return;
        }
        
        // Ignore messages that were created before we started listening
        // (these are stale from previous sessions)
        if (timestamp > 0 && timestamp < listenerStartTime - 2000) {
          deleteDoc(change.doc.ref).catch(() => {});
          return;
        }
        
        // Mark as processed
        state.processedMessages.add(docId);
        
        // Clean up old processed message IDs (keep last 1000)
        if (state.processedMessages.size > 1000) {
          const iterator = state.processedMessages.values();
          for (let i = 0; i < 500; i++) {
            state.processedMessages.delete(iterator.next().value);
          }
        }
        
        // Only process messages meant for us or broadcast
        if (!data.toId || data.toId === state.myUserId) {
          handleSignalingMessage(data);
        }
        
        // Delete the message after processing
        deleteDoc(change.doc.ref).catch(() => {});
      }
    });
  });
  
  state.unsubscribers.push(unsubscribe);
};


// ============================================================================
// VOLUME DETECTION
// ============================================================================

/**
 * Start monitoring audio levels for speaking indicators
 * Also applies noise gate based on mic threshold
 */
const startVolumeMonitoring = () => {
  if (state.volumeInterval) {
    clearInterval(state.volumeInterval);
  }
  
  console.log('Starting volume monitoring, localAnalyser:', !!state.localAnalyser, 'audioContext:', !!state.audioContext);
  
  state.volumeInterval = setInterval(() => {
    const volumes = [];
    const thresholdPercent = state.appSettings?.micThreshold ?? 15;
    // Convert threshold from 0-100 to 0-255 scale (frequency data range)
    const threshold = (thresholdPercent / 100) * 255;
    
    // Get input volume multiplier
    const inputVolumeMultiplier = (state.inputVolume ?? 100) / 100;
    
    // Check local audio level
    if (state.localAnalyser) {
      const dataArray = new Uint8Array(state.localAnalyser.frequencyBinCount);
      state.localAnalyser.getByteFrequencyData(dataArray);
      // Use max value instead of average for better voice detection
      const rawMaxLevel = Math.max(...dataArray);
      
      // Apply input volume to the level for threshold comparison
      // This simulates what the level would be after gain is applied
      const adjustedLevel = rawMaxLevel * inputVolumeMultiplier;
      
      // Normalize level to 0-100 for UI (using adjusted level)
      const normalizedLevel = (adjustedLevel / 255) * 100;
      
      // Apply noise gate with debouncing (only if not manually muted)
      // Compare adjusted level (after input volume) with threshold
      if (state.localStream && state.silentStream && !state.micManuallyMuted) {
        const shouldBeOpen = adjustedLevel >= threshold;
        
        if (shouldBeOpen && !state.noiseGateOpen) {
          // Open gate with small delay to avoid false triggers
          if (!state.noiseGateOpenTimeout) {
            state.noiseGateOpenTimeout = setTimeout(() => {
              if (!state.micManuallyMuted && state.localStream) {
                console.log(`Opening noise gate (adjustedLevel=${adjustedLevel.toFixed(0)} >= threshold=${threshold.toFixed(0)})`);
                state.noiseGateOpen = true;
                // Switch to processed audio track (has input gain applied)
                const processedTrack = state.processedStream?.getAudioTracks()[0];
                const realTrack = processedTrack || state.localStream.getAudioTracks()[0];
                if (realTrack) {
                  replaceAudioTrack(realTrack);
                }
              }
              state.noiseGateOpenTimeout = null;
            }, 10); // 10ms delay before opening (reduced from 50ms)
          }
          // Cancel close timeout if pending
          if (state.noiseGateTimeout) {
            clearTimeout(state.noiseGateTimeout);
            state.noiseGateTimeout = null;
          }
        } else if (!shouldBeOpen && state.noiseGateOpen) {
          // Cancel open timeout if pending
          if (state.noiseGateOpenTimeout) {
            clearTimeout(state.noiseGateOpenTimeout);
            state.noiseGateOpenTimeout = null;
          }
          // Close gate with delay to avoid cutting off speech
          if (!state.noiseGateTimeout) {
            state.noiseGateTimeout = setTimeout(() => {
              if (!state.micManuallyMuted && state.silentStream) {
                console.log(`Closing noise gate (adjustedLevel=${adjustedLevel.toFixed(0)} < threshold=${threshold.toFixed(0)})`);
                state.noiseGateOpen = false;
                // Switch to silent track
                const silentTrack = state.silentStream.getAudioTracks()[0];
                if (silentTrack) {
                  replaceAudioTrack(silentTrack);
                }
              }
              state.noiseGateTimeout = null;
            }, 500); // 500ms delay before closing gate
          }
        } else if (shouldBeOpen && state.noiseGateOpen) {
          // Still speaking - cancel any pending close
          if (state.noiseGateTimeout) {
            clearTimeout(state.noiseGateTimeout);
            state.noiseGateTimeout = null;
          }
        }
      }
      
      volumes.push({
        oderId: state.myUserId,
        name: state.myUserName,
        level: normalizedLevel // Send adjusted level for UI
      });
    }
    
    // Check remote audio levels
    state.peers.forEach((peerState, oderId) => {
      if (peerState.analyser) {
        const dataArray = new Uint8Array(peerState.analyser.frequencyBinCount);
        peerState.analyser.getByteFrequencyData(dataArray);
        const maxLevel = Math.max(...dataArray);
        const normalizedLevel = (maxLevel / 255) * 100;
        
        volumes.push({
          oderId: oderId,
          name: peerState.userName,
          level: normalizedLevel
        });
      }
    });
    
    if (state.onVolumeIndicator && volumes.length > 0) {
      state.onVolumeIndicator(volumes);
    }
  }, VOLUME_CHECK_INTERVAL);
};

/**
 * Set up local audio analysis for speaking indicator
 * Signal chain: Microphone → Input GainNode → Analyser → (level analysis)
 * The processed stream (with gain applied) is sent to peers
 */
const setupLocalAudioAnalysis = () => {
  if (!state.localStream || !state.audioContext) {
    console.warn('Cannot setup local audio analysis: localStream=', !!state.localStream, 'audioContext=', !!state.audioContext);
    return;
  }
  
  console.log('Setting up local audio analysis, audioContext state:', state.audioContext.state);
  
  // Ensure AudioContext is running
  if (state.audioContext.state === 'suspended') {
    state.audioContext.resume().then(() => {
      console.log('AudioContext resumed in setupLocalAudioAnalysis');
    });
  }
  
  try {
    const source = state.audioContext.createMediaStreamSource(state.localStream);
    
    // Create input gain node for volume control
    // This affects both the level analysis AND what peers hear
    const inputGainNode = state.audioContext.createGain();
    inputGainNode.gain.value = (state.inputVolume ?? 100) / 100;
    state.localGainNode = inputGainNode;
    
    // Create analyser for level detection
    const analyser = state.audioContext.createAnalyser();
    analyser.fftSize = 256;
    
    // Create destination for processed audio stream
    const processedDestination = state.audioContext.createMediaStreamDestination();
    
    // Signal chain: source → inputGainNode → analyser
    //                                      → processedDestination (for sending to peers)
    source.connect(inputGainNode);
    inputGainNode.connect(analyser);
    inputGainNode.connect(processedDestination);
    
    state.localAnalyser = analyser;
    
    // Store the processed stream - this is what we'll send to peers
    // It has the input volume applied
    state.processedStream = processedDestination.stream;
    
    // Create silent audio stream for noise gate
    const oscillator = state.audioContext.createOscillator();
    const silentGainNode = state.audioContext.createGain();
    silentGainNode.gain.value = 0; // Silent
    const silentDestination = state.audioContext.createMediaStreamDestination();
    oscillator.connect(silentGainNode);
    silentGainNode.connect(silentDestination);
    oscillator.start();
    state.silentStream = silentDestination.stream;
    
    console.log(`Local audio analysis set up with input gain: ${inputGainNode.gain.value}`);
    
  } catch (err) {
    console.warn('Could not set up local audio analysis:', err);
  }
};

/**
 * Replace audio track on all peer connections (for noise gate)
 * Uses processed stream (with input gain) when switching to real audio
 */
const replaceAudioTrack = async (track) => {
  // If switching to real audio, use processed stream track instead
  let trackToUse = track;
  if (track && state.localStream && track === state.localStream.getAudioTracks()[0]) {
    // Caller wants real audio - use processed stream if available
    const processedTrack = state.processedStream?.getAudioTracks()[0];
    if (processedTrack) {
      trackToUse = processedTrack;
      console.log(`Using processed track instead of raw track`);
    }
  }
  
  console.log(`Replacing audio track: ${trackToUse?.label || 'unknown'}, enabled=${trackToUse?.enabled}, kind=${trackToUse?.kind}`);
  const promises = [];
  let foundSenders = 0;
  state.peers.forEach((peerState) => {
    if (peerState.pc) {
      const senders = peerState.pc.getSenders();
      console.log(`Peer ${peerState.userName} has ${senders.length} senders:`, senders.map(s => ({ kind: s.track?.kind, label: s.track?.label })));
      const audioSender = senders.find(s => s.track?.kind === 'audio');
      if (audioSender) {
        foundSenders++;
        console.log(`Found audio sender for ${peerState.userName}, current track: ${audioSender.track?.label}, replacing...`);
        promises.push(audioSender.replaceTrack(trackToUse).then(() => {
          console.log(`Successfully replaced track for ${peerState.userName}`);
        }).catch(err => {
          console.warn(`Error replacing track for ${peerState.userName}:`, err);
        }));
      } else {
        console.log(`No audio sender found for ${peerState.userName}`);
      }
    }
  });
  console.log(`Total audio senders found: ${foundSenders}`);
  await Promise.all(promises);
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Join a voice channel
 */
export const joinVoiceChannel = async (
  channelId,
  userName,
  onUserJoined,
  onUserLeft,
  onVolumeIndicator,
  appSettings,
  onScreenShare = null,
  onScreenShareEnded = null
) => {
  // Clean up any existing connection
  await leaveVoiceChannel();
  
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Not authenticated');
  }
  
  // Initialize state
  state.channelId = channelId;
  state.myUserId = currentUser.uid;
  state.myUserName = userName;
  state.onUserJoined = onUserJoined;
  state.onUserLeft = onUserLeft;
  state.onVolumeIndicator = onVolumeIndicator;
  state.appSettings = appSettings;
  state.onScreenShare = onScreenShare;
  state.onScreenShareEnded = onScreenShareEnded;
  
  // Initialize volume settings from appSettings
  state.inputVolume = appSettings?.inputVolume ?? 100;
  state.outputVolume = appSettings?.outputVolume ?? 100;
  
  // Create audio context
  state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  
  // Resume audio context if suspended (required for user gesture in some browsers)
  if (state.audioContext.state === 'suspended') {
    await state.audioContext.resume();
    console.log('AudioContext resumed');
  }
  
  // Get local audio stream with settings to prevent volume fluctuation
  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false, // Disable to prevent volume fluctuation
        channelCount: 1,
        sampleRate: 48000
      },
      video: false
    });
    
    // Set up local audio analysis for speaking indicator
    setupLocalAudioAnalysis();
    
    // Initialize noise gate state based on threshold
    // If threshold > 0, start with gate closed (silent)
    const thresholdPercent = appSettings?.micThreshold ?? 15;
    if (thresholdPercent > 0) {
      state.noiseGateOpen = false;
      console.log(`Noise gate initialized as CLOSED (threshold=${thresholdPercent}%)`);
    } else {
      state.noiseGateOpen = true;
      console.log(`Noise gate initialized as OPEN (threshold=0)`);
    }
    
  } catch (err) {
    console.error('Error getting microphone:', err);
    throw err;
  }
  
  // Clean up old signaling messages
  await cleanupMySignaling();
  
  // Start listening for signaling messages
  startSignalingListener();
  
  // Start volume monitoring
  startVolumeMonitoring();
  
  // Announce presence by sending a "join" message
  await sendSignalingMessage({
    type: 'join',
    toId: null // Broadcast to all
  });
  
  console.log(`Joined voice channel: ${channelId}`);
};

/**
 * Leave the current voice channel
 */
export const leaveVoiceChannel = async () => {
  // Stop volume monitoring
  if (state.volumeInterval) {
    clearInterval(state.volumeInterval);
    state.volumeInterval = null;
  }
  
  // Unsubscribe from Firebase listeners
  state.unsubscribers.forEach(unsub => unsub());
  state.unsubscribers = [];
  
  // Close all peer connections
  state.peers.forEach((peerState, oderId) => {
    if (peerState.pc) {
      peerState.pc.close();
    }
    if (peerState.audioElement) {
      peerState.audioElement.srcObject = null;
      peerState.audioElement.remove();
    }
    if (peerState.sourceNode) {
      peerState.sourceNode.disconnect();
    }
  });
  state.peers.clear();
  
  // Stop local stream
  if (state.localStream) {
    state.localStream.getTracks().forEach(track => track.stop());
    state.localStream = null;
  }
  
  // Stop processed stream
  if (state.processedStream) {
    state.processedStream.getTracks().forEach(track => track.stop());
    state.processedStream = null;
  }
  
  // Stop screen share
  if (state.screenStream) {
    state.screenStream.getTracks().forEach(track => track.stop());
    state.screenStream = null;
  }
  
  // Close audio context
  if (state.audioContext) {
    state.audioContext.close().catch(() => {});
    state.audioContext = null;
  }
  state.localAnalyser = null;
  state.localGainNode = null;
  
  // Stop silent stream
  if (state.silentStream) {
    state.silentStream.getTracks().forEach(track => track.stop());
    state.silentStream = null;
  }
  
  // Clear noise gate timeouts
  if (state.noiseGateTimeout) {
    clearTimeout(state.noiseGateTimeout);
    state.noiseGateTimeout = null;
  }
  if (state.noiseGateOpenTimeout) {
    clearTimeout(state.noiseGateOpenTimeout);
    state.noiseGateOpenTimeout = null;
  }
  
  // Clear ICE candidate batches
  state.iceCandidateBatches.forEach((batch) => {
    if (batch.timeout) {
      clearTimeout(batch.timeout);
    }
  });
  state.iceCandidateBatches.clear();
  
  // Clean up signaling messages
  await cleanupMySignaling();
  
  // Reset state
  state.channelId = null;
  state.myUserId = null;
  state.myUserName = null;
  state.onUserJoined = null;
  state.onUserLeft = null;
  state.onVolumeIndicator = null;
  state.micManuallyMuted = false;
  state.noiseGateOpen = true;
  state.processedMessages.clear();
  
  console.log('Left voice channel');
};


/**
 * Toggle microphone mute state
 */
export const toggleMicrophone = async (enabled) => {
  state.micManuallyMuted = !enabled;
  
  // Clear any pending noise gate timeouts
  if (state.noiseGateTimeout) {
    clearTimeout(state.noiseGateTimeout);
    state.noiseGateTimeout = null;
  }
  if (state.noiseGateOpenTimeout) {
    clearTimeout(state.noiseGateOpenTimeout);
    state.noiseGateOpenTimeout = null;
  }
  
  if (enabled) {
    // Unmute - switch to processed audio track (has input gain applied)
    state.noiseGateOpen = true;
    const processedTrack = state.processedStream?.getAudioTracks()[0];
    const realTrack = processedTrack || state.localStream?.getAudioTracks()[0];
    if (realTrack) {
      await replaceAudioTrack(realTrack);
    }
  } else {
    // Mute - switch to silent track
    state.noiseGateOpen = false;
    const silentTrack = state.silentStream?.getAudioTracks()[0];
    if (silentTrack) {
      await replaceAudioTrack(silentTrack);
    }
  }
};

/**
 * Set volume for a remote user (0-200%)
 */
export const setRemoteUserVolume = (oderId, volume) => {
  console.log(`setRemoteUserVolume called: oderId=${oderId}, volume=${volume}`);
  console.log(`Current peers:`, Array.from(state.peers.keys()));
  
  let peerState = state.peers.get(oderId);
  
  // Try to find by oderId if not found directly
  if (!peerState) {
    for (const [id, peer] of state.peers) {
      console.log(`Checking peer: id=${id}, peer.oderId=${peer.oderId}`);
      if (peer.oderId === oderId || id === oderId) {
        peerState = peer;
        break;
      }
    }
  }
  
  if (!peerState) {
    console.warn(`Peer not found for volume control: ${oderId}`);
    return;
  }
  
  console.log(`Found peer, setting volume to ${volume}%`);
  peerState.volume = volume;
  
  // For volume <= 100%, use audio element
  // For volume > 100%, use AudioContext with GainNode
  if (volume <= 100) {
    // Use audio element
    if (peerState.audioElement) {
      peerState.audioElement.volume = volume / 100;
      console.log(`Audio element volume set to ${volume / 100}`);
    }
    // Disconnect gainNode from destination if it exists
    if (peerState.gainNode) {
      try {
        peerState.gainNode.disconnect(state.audioContext.destination);
      } catch (e) {}
    }
  } else {
    // Use AudioContext for volume > 100%
    if (peerState.audioElement) {
      peerState.audioElement.volume = 0; // Mute audio element
    }
    
    if (peerState.gainNode) {
      peerState.gainNode.gain.value = volume / 100;
      // Make sure it's connected to destination
      try {
        peerState.gainNode.connect(state.audioContext.destination);
      } catch (e) {} // Already connected
      console.log(`GainNode value set to ${volume / 100}`);
    } else if (peerState.sourceNode && state.audioContext) {
      // Create gainNode if it doesn't exist
      const gainNode = state.audioContext.createGain();
      gainNode.gain.value = volume / 100;
      peerState.sourceNode.connect(gainNode);
      gainNode.connect(state.audioContext.destination);
      peerState.gainNode = gainNode;
      console.log(`Created GainNode with value ${volume / 100}`);
    }
  }
};

/**
 * Set deafened state - mute/unmute all incoming audio
 */
export const setDeafened = (deafened) => {
  state.peers.forEach((peerState) => {
    if (peerState.audioElement) {
      peerState.audioElement.muted = deafened;
    }
    if (peerState.gainNode) {
      peerState.gainNode.gain.value = deafened ? 0 : (peerState.volume || 100) / 100;
    }
  });
  console.log(`Deafened: ${deafened}`);
};

/**
 * Start screen sharing from an existing stream
 */
export const startScreenShareFromStream = async (stream) => {
  if (!state.channelId) {
    console.warn('Not in a voice channel');
    return null;
  }
  
  state.screenStream = stream;
  
  // Add video track to all peer connections and trigger renegotiation
  const videoTrack = stream.getVideoTracks()[0];
  if (videoTrack) {
    for (const [peerId, peerState] of state.peers.entries()) {
      if (peerState.pc) {
        // Add track
        const sender = peerState.pc.addTrack(videoTrack, stream);
        console.log(`Added screen share track to peer ${peerState.userName}, sender:`, sender);
        
        // Trigger renegotiation by creating a new offer
        try {
          peerState.makingOffer = true;
          const offer = await peerState.pc.createOffer();
          await peerState.pc.setLocalDescription(offer);
          
          await sendSignalingMessage({
            type: 'offer',
            sdp: peerState.pc.localDescription.sdp,
            toId: peerId
          });
          
          peerState.makingOffer = false;
        } catch (err) {
          console.error(`Failed to renegotiate with ${peerState.userName}:`, err);
          peerState.makingOffer = false;
        }
      }
    }
  }
  
  return {
    play: (container) => {
      if (container && videoTrack) {
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.muted = true;
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'contain';
        container.innerHTML = '';
        container.appendChild(video);
      }
    },
    stop: () => {
      stream.getTracks().forEach(track => track.stop());
    }
  };
};

/**
 * Stop screen sharing
 */
export const stopScreenShare = async () => {
  if (state.screenStream) {
    state.screenStream.getTracks().forEach(track => track.stop());
    state.screenStream = null;
    
    // Send signaling message to notify others that screen share ended
    await sendSignalingMessage({
      type: 'screen-share-ended',
      toId: null // Broadcast to all
    });
  }
};

// ============================================================================
// COMPATIBILITY FUNCTIONS (for components that expect Agora-like API)
// ============================================================================

/**
 * Get client (compatibility function)
 */
export const getClient = () => {
  return {
    remoteUsers: Array.from(state.peers.values()).map(p => ({
      uid: p.oderId,
      audioTrack: p.audioElement ? { 
        setVolume: (vol) => setRemoteUserVolume(p.oderId, vol) 
      } : null
    }))
  };
};

/**
 * Get local audio track (compatibility function)
 */
export const getLocalAudioTrack = () => {
  return state.localStream ? {
    setEnabled: (enabled) => toggleMicrophone(enabled),
    setVolume: () => {} // Local volume not applicable
  } : null;
};

/**
 * Set global input volume (microphone gain) 0-100%
 */
export const setInputVolume = (volume) => {
  state.inputVolume = volume;
  
  // If we have a local gain node, update it
  if (state.localGainNode) {
    state.localGainNode.gain.value = volume / 100;
    console.log(`Input volume set to ${volume}%`);
  }
};

/**
 * Set global output volume (all incoming audio) 0-100%
 */
export const setOutputVolume = (volume) => {
  state.outputVolume = volume;
  
  // Update all peer audio elements
  state.peers.forEach((peerState) => {
    if (peerState.audioElement) {
      // Combine global output volume with per-user volume
      const userVolume = peerState.volume || 100;
      const combinedVolume = (volume / 100) * (userVolume / 100);
      peerState.audioElement.volume = Math.min(1, combinedVolume);
      
      // For volumes > 100%, use gain node
      if (combinedVolume > 1 && peerState.gainNode) {
        peerState.gainNode.gain.value = combinedVolume;
        peerState.audioElement.volume = 0; // Mute element, use gain node
      }
    }
  });
  
  console.log('Output volume set to ' + volume + '%');
};

/**
 * Set output device for all audio elements
 */
export const setOutputDevice = async (deviceId) => {
  state.outputDevice = deviceId || 'default';
  
  // Update all existing peer audio elements
  for (const [peerId, peerState] of state.peers) {
    if (peerState.audioElement && peerState.audioElement.setSinkId) {
      try {
        if (deviceId && deviceId !== 'default') {
          await peerState.audioElement.setSinkId(deviceId);
          console.log('Set output device for ' + peerState.userName + ' to ' + deviceId);
        }
      } catch (err) {
        console.error('Failed to set output device for ' + peerState.userName + ':', err);
      }
    }
  }
  
  console.log('Output device set to ' + (deviceId || 'default'));
};

/**
 * Update app settings (for threshold changes etc.)
 */
export const updateAppSettings = (newSettings) => {
  state.appSettings = { ...state.appSettings, ...newSettings };
  console.log(`App settings updated, micThreshold=${state.appSettings?.micThreshold}`);
};

// Export for debugging
export const getState = () => state;
