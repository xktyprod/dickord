import { useState, useEffect, useRef } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { 
  createServer, 
  deleteServer,
  leaveServer,
  joinServerByInvite,
  getServerInviteCode,
  subscribeToServers,
  createChannel,
  deleteChannel,
  renameChannel,
  subscribeToChannels
} from './services/serverService';
import {
  sendMessage,
  editMessage,
  deleteMessage,
  addReaction,
  subscribeToMessages
} from './services/messageService';
import {
  joinVoiceChannelDB,
  leaveVoiceChannelDB,
  updateVoiceStatus,
  updateScreenShareStatus,
  updateVoiceChannelAvatar,
  subscribeToVoiceChannelUsers
} from './services/voiceChannelService';
import {
  joinVoiceChannel as joinWebRTCChannel,
  leaveVoiceChannel as leaveWebRTCChannel,
  toggleMicrophone,
  stopScreenShare,
  setDeafened as setWebRTCDeafened
} from './services/webrtcService';
import {
  subscribeToIncomingCalls,
  acceptCall,
  declineCall,
  endCall
} from './services/callService';
import { subscribeToRecentContacts } from './services/recentContactsService';
import { subscribeToUnreadDMs } from './services/dmService';
import { subscribeToNotifications, subscribeToUnreadCount } from './services/notificationsService';
import { getSoundManager } from './services/soundManager';
import { initializePresence, cleanupPresence, sendPresenceHeartbeat } from './services/presenceService';
import { setUserActivity, clearUserActivity } from './services/userActivityService';
import { startConnectionQualityMonitoring, stopConnectionQualityMonitoring } from './services/connectionQualityService';
import { startActiveCall, endActiveCall, subscribeToUserCall } from './services/activeCallsService';
import { useVoiceChannelTracking } from './hooks/useVoiceChannelTracking';
import TitleBar from './components/TitleBar';
import ServerList from './components/ServerList';
import ChannelSidebar from './components/ChannelSidebar';
import ChatArea from './components/ChatArea';
import SettingsMenu from './components/SettingsMenu';
import AccountSettings from './components/AccountSettings';
import AppSettings from './components/AppSettings';
import FriendsPage from './components/FriendsPage';
import ScreenPicker from './components/ScreenPicker';
import NotificationPanel from './components/NotificationPanel';
import AuthPage from './components/AuthPage';
import DMCallView from './components/DMCallView';

function App() {
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState('main');
  const [settingsSection, setSettingsSection] = useState('account');
  
  // Firebase data
  const [servers, setServers] = useState([]);
  const [channels, setChannels] = useState([]);
  const [messages, setMessages] = useState([]);
  
  const [activeServer, setActiveServer] = useState(null);
  const [activeChannel, setActiveChannel] = useState(null);
  const [user, setUser] = useState({ name: 'Guest', tag: '0000', email: '', avatar: null });
  const [voiceChannel, setVoiceChannel] = useState(null);
  const [dmCall, setDmCall] = useState(null); // { oderId, oderId, name }
  const [incomingCall, setIncomingCall] = useState(null);
  const [recentContacts, setRecentContacts] = useState([]);
  const [activeDMContact, setActiveDMContact] = useState(null); // Для открытия DM из бокового меню
  const [unreadDMs, setUnreadDMs] = useState({}); // { oderId: count }
  const [notifications, setNotifications] = useState([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [speakingUsers, setSpeakingUsers] = useState({}); // { userId: volume }
  const [screenShare, setScreenShare] = useState(null); // Currently viewed screen share
  const [availableScreenShares, setAvailableScreenShares] = useState({}); // { oderId: { userName, stream } }
  const [myScreenShareStream, setMyScreenShareStream] = useState(null); // My own screen share stream (to re-show)
  const [pendingScreenShare, setPendingScreenShare] = useState(null); // { oderId, userName } - to watch after joining
  const [showScreenPicker, setShowScreenPicker] = useState(false);
  const [fullscreenShare, setFullscreenShare] = useState(null); // { oderId, userName, isRemote } - tracks which share is in fullscreen
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showCreateServerModal, setShowCreateServerModal] = useState(false);
  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState('text');
  const [inviteCode, setInviteCode] = useState('');
  const [joinCode, setJoinCode] = useState('');

  // Автоматическое отслеживание активности и качества соединения в голосовом канале
  useVoiceChannelTracking(voiceChannel);
  const [joinError, setJoinError] = useState('');
  
  const [appSettings, setAppSettings] = useState(() => {
    const saved = localStorage.getItem('appSettings');
    return saved ? JSON.parse(saved) : {
      theme: 'dark',
      fontSize: 14,
      compactMode: false,
      desktopNotifications: true,
      messageSound: true,
      mentionSound: true,
      callSound: true,
      highlightMentions: true,
      inputVolume: 100,
      outputVolume: 100,
      outputDevice: 'default',
      voiceMode: 'voice',
      allowDMs: true,
      showActivity: true,
      zoomLevel: 1.1
    };
  });

  const unsubServersRef = useRef(null);
  const unsubChannelsRef = useRef(null);
  const unsubMessagesRef = useRef(null);
  const unsubIncomingCallsRef = useRef(null);
  const unsubRecentContactsRef = useRef(null);
  const unsubUnreadDMsRef = useRef(null);
  const unsubNotificationsRef = useRef(null);
  const unsubUnreadCountRef = useRef(null);
  const incomingCallSoundRef = useRef(null);
  const lastMessageCountRef = useRef(0);
  const heartbeatIntervalRef = useRef(null);

  // Firebase auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setAuthUser(firebaseUser);
        
        // Load user profile from Firestore to get avatar
        const { createUserProfile, getUserProfile } = await import('./services/friendsService');
        await createUserProfile(firebaseUser);
        
        const profile = await getUserProfile(firebaseUser.uid);
        
        const avatarUrl = profile?.photoURL || firebaseUser.photoURL;
        
        setUser({
          name: firebaseUser.displayName || 'User',
          tag: firebaseUser.uid.slice(-4).toUpperCase(),
          email: firebaseUser.email,
          avatar: avatarUrl
        });
        
        // Cleanup stale voice channel entries from previous sessions
        const { cleanupUserVoiceChannels } = await import('./services/voiceChannelService');
        await cleanupUserVoiceChannels();
        
        // Initialize presence system
        await initializePresence();
        
        // Start heartbeat to keep presence alive (every 30 seconds)
        heartbeatIntervalRef.current = setInterval(() => {
          sendPresenceHeartbeat();
        }, 30000);
      } else {
        setAuthUser(null);
        setServers([]);
        setChannels([]);
        setMessages([]);
        setActiveServer(null);
        setActiveChannel(null);
        
        // Clear heartbeat interval
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
      }
      setAuthLoading(false);
    });
    return () => {
      unsubscribe();
      // Clear heartbeat on unmount
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, []);

  // Subscribe to servers
  useEffect(() => {
    if (!authUser) return;
    
    unsubServersRef.current = subscribeToServers((serverList) => {
      setServers(serverList);
      
      if (!activeServer && serverList.length > 0) {
        setActiveServer(serverList[0].id);
      }
    });
    
    return () => unsubServersRef.current?.();
  }, [authUser]);

  // Subscribe to channels when server changes
  useEffect(() => {
    if (!activeServer) {
      setChannels([]);
      return;
    }
    
    unsubChannelsRef.current?.();
    unsubChannelsRef.current = subscribeToChannels(activeServer, (channelList) => {
      setChannels(channelList);
      
      if (channelList.length > 0) {
        const textChannel = channelList.find(c => c.type === 'text') || channelList[0];
        if (!activeChannel || !channelList.find(c => c.id === activeChannel)) {
          setActiveChannel(textChannel.id);
        }
      }
    });
    
    return () => unsubChannelsRef.current?.();
  }, [activeServer]);

  // Subscribe to messages when channel changes
  useEffect(() => {
    if (!activeServer || !activeChannel) {
      setMessages([]);
      lastMessageCountRef.current = 0;
      return;
    }
    
    unsubMessagesRef.current?.();
    unsubMessagesRef.current = subscribeToMessages(activeServer, activeChannel, (newMessages) => {
      // Check if there's a new message from someone else
      if (newMessages.length > lastMessageCountRef.current && lastMessageCountRef.current > 0) {
        const latestMessage = newMessages[newMessages.length - 1];
        if (latestMessage && latestMessage.authorId !== authUser?.uid) {
          // Play message sound
          const soundManager = getSoundManager();
          soundManager.updateSettings(appSettings);
          soundManager.play('message');
        }
      }
      lastMessageCountRef.current = newMessages.length;
      setMessages(newMessages);
    });
    
    return () => unsubMessagesRef.current?.();
  }, [activeServer, activeChannel, authUser, appSettings]);

  // Subscribe to incoming calls
  useEffect(() => {
    if (!authUser) return;
    
    unsubIncomingCallsRef.current = subscribeToIncomingCalls((call) => {
      setIncomingCall(call);
    });
    
    return () => unsubIncomingCallsRef.current?.();
  }, [authUser]);

  // Monitor active DM call - if it's removed from Firebase, end call locally
  useEffect(() => {
    if (!authUser || !dmCall) return;
    
    const unsubscribe = subscribeToUserCall(authUser.uid, (callData) => {
      // If we're in a call but the call no longer exists in Firebase, end it
      if (dmCall && !callData) {
        console.log('Active call removed from Firebase, ending call locally');
        leaveWebRTCChannel();
        setDmCall(null);
        setMicMuted(false);
        setDeafened(false);
        setScreenShare(null);
      }
    });
    
    return () => unsubscribe();
  }, [authUser, dmCall]);

  // Play incoming call sound
  useEffect(() => {
    if (incomingCall) {
      // Start playing incoming call sound
      const soundManager = getSoundManager();
      soundManager.updateSettings(appSettings);
      incomingCallSoundRef.current = soundManager.playIncomingCall();
    } else {
      // Stop incoming call sound
      if (incomingCallSoundRef.current) {
        incomingCallSoundRef.current.pause();
        incomingCallSoundRef.current = null;
      }
    }
    
    return () => {
      if (incomingCallSoundRef.current) {
        incomingCallSoundRef.current.pause();
        incomingCallSoundRef.current = null;
      }
    };
  }, [incomingCall]);

  // Subscribe to recent contacts
  useEffect(() => {
    if (!authUser) return;
    
    unsubRecentContactsRef.current = subscribeToRecentContacts((contacts) => {
      setRecentContacts(contacts);
    });
    
    return () => unsubRecentContactsRef.current?.();
  }, [authUser]);

  // Subscribe to unread DMs
  useEffect(() => {
    if (!authUser) return;
    
    unsubUnreadDMsRef.current = subscribeToUnreadDMs((unread) => {
      setUnreadDMs(unread);
    });
    
    return () => unsubUnreadDMsRef.current?.();
  }, [authUser]);

  // Subscribe to notifications
  useEffect(() => {
    if (!authUser) return;
    
    unsubNotificationsRef.current = subscribeToNotifications((notifs) => {
      setNotifications(notifs);
    });
    
    unsubUnreadCountRef.current = subscribeToUnreadCount((count) => {
      setUnreadNotifications(count);
    });
    
    return () => {
      unsubNotificationsRef.current?.();
      unsubUnreadCountRef.current?.();
    };
  }, [authUser]);

  // Manage voice channel connection (centralized)
  useEffect(() => {
    if (!voiceChannel) {
      // Disconnect if no voice channel
      if (voiceConnected) {
        disconnectFromVoice();
      }
      return;
    }
    
    // Connect to voice channel
    connectToVoice(voiceChannel.serverId, voiceChannel.channelId);
    
  }, [voiceChannel]);

  // Track voice channel users and detect when they leave
  useEffect(() => {
    if (!voiceChannel) return;
    
    const previousUsers = new Set();
    
    const unsubscribe = subscribeToVoiceChannelUsers(
      voiceChannel.serverId,
      voiceChannel.channelId,
      (users) => {
        const currentUsers = new Set(users.map(u => u.oderId));
        
        // Detect users who left
        for (const userId of previousUsers) {
          if (!currentUsers.has(userId)) {
            // Clean up their screen share if they had one
            setAvailableScreenShares(prev => {
              const newShares = { ...prev };
              delete newShares[userId];
              return newShares;
            });
            
            // Clear current view if it was their share
            setScreenShare(prev => {
              if (prev && prev.oderId === userId) {
                return null;
              }
              return prev;
            });
          }
        }
        
        // Update previous users
        previousUsers.clear();
        currentUsers.forEach(id => previousUsers.add(id));
      }
    );
    
    return () => {
      unsubscribe();
    };
  }, [voiceChannel]);

  // Cleanup voice channel on app close/unmount
  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (voiceChannel) {
        await leaveVoiceChannelDB(voiceChannel.serverId, voiceChannel.channelId);
      }
      // Cleanup presence
      await cleanupPresence();
    };
    
    // Handle Electron app closing signal
    const handleAppClosing = async () => {
      if (voiceChannel) {
        await leaveVoiceChannelDB(voiceChannel.serverId, voiceChannel.channelId);
        await leaveWebRTCChannel();
      }
      // Cleanup presence
      await cleanupPresence();
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Listen for Electron close signal
    if (window.electronAPI?.onAppClosing) {
      window.electronAPI.onAppClosing(handleAppClosing);
    }
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Also cleanup on unmount
      if (voiceChannel) {
        leaveVoiceChannelDB(voiceChannel.serverId, voiceChannel.channelId);
      }
      cleanupPresence();
    };
  }, [voiceChannel]);

  const connectToVoice = async (serverId, channelId) => {
    try {
      const channelName = `${serverId}_${channelId}`;
      
      // Record in Firebase with user's avatar
      await joinVoiceChannelDB(serverId, channelId, user.avatar);
      
      await joinWebRTCChannel(
        channelName,
        user.name,
        // onUserJoined
        (oderId, userName, stream) => {
          // User joined voice
        },
        // onUserLeft
        (oderId) => {
          // Clean up their screen share if they had one
          setAvailableScreenShares(prev => {
            const newShares = { ...prev };
            delete newShares[oderId];
            return newShares;
          });
          // Clear current view if it was their share
          setScreenShare(prev => {
            if (prev && prev.oderId === oderId) {
              return null;
            }
            return prev;
          });
        },
        // onVolumeIndicator
        (volumes) => {
          const threshold = appSettings.micThreshold ?? 15;
          const newSpeakingUsers = {};
          volumes.forEach(vol => {
            if (vol.level > threshold) {
              // Set both oderId and name as keys for compatibility
              newSpeakingUsers[vol.oderId] = vol.level;
              if (vol.name) {
                newSpeakingUsers[vol.name] = vol.level;
              }
            }
          });
          setSpeakingUsers(newSpeakingUsers);
        },
        appSettings,
        // onScreenShare - when receiving screen share from another user
        (oderId, userName, stream) => {
          // Play screen share sound
          const soundManager = getSoundManager();
          soundManager.updateSettings(appSettings);
          soundManager.play('screenShareStart');
          
          // Save to available screen shares
          setAvailableScreenShares(prev => ({
            ...prev,
            [oderId]: { userName, stream, oderId }
          }));
          
          // Check if this is the pending screen share we wanted to watch
          setPendingScreenShare(pending => {
            if (pending && pending.oderId === oderId) {
              // This is the one we wanted - show it (only if we don't have our own screen share)
              setScreenShare(prev => {
                // Don't replace our own screen share
                if (prev && !prev.isRemote) {
                  return prev;
                }
                return {
                  oderId: oderId,
                  userName: userName,
                  stream: stream,
                  isRemote: true
                };
              });
              return null; // Clear pending
            }
            return pending;
          });
          
          // Auto-show if no current screen share and no pending
          setScreenShare(prev => {
            // Don't replace our own screen share
            if (prev && !prev.isRemote) {
              return prev;
            }
            // Only show if no screen share at all
            if (!prev) {
              return {
                oderId: oderId,
                userName: userName,
                stream: stream,
                isRemote: true
              };
            }
            return prev;
          });
        },
        // onScreenShareEnded - when screen share stops
        (oderId, userName) => {
          // Play screen share end sound
          const soundManager = getSoundManager();
          soundManager.updateSettings(appSettings);
          soundManager.play('screenShareEnd');
          
          // Remove from available
          setAvailableScreenShares(prev => {
            const newShares = { ...prev };
            delete newShares[oderId];
            return newShares;
          });
          // Clear current view if it was this share
          setScreenShare(prev => {
            if (prev && prev.oderId === oderId) {
              return null;
            }
            return prev;
          });
          // Close fullscreen if this was the fullscreen share
          setFullscreenShare(prev => {
            if (prev && prev.oderId === oderId) {
              return null;
            }
            return prev;
          });
        }
      );
      
      setVoiceConnected(true);
      
      // Play voice join sound
      const soundManager = getSoundManager();
      soundManager.updateSettings(appSettings);
      soundManager.play('voiceJoin');
    } catch (err) {
      console.error('Voice connection error:', err);
    }
  };

  const disconnectFromVoice = async () => {
    try {
      // Update screen share status before leaving
      if (voiceChannel && screenShare && !screenShare.isRemote) {
        await updateScreenShareStatus(voiceChannel.serverId, voiceChannel.channelId, false);
      }
      
      if (voiceChannel) {
        await leaveVoiceChannelDB(voiceChannel.serverId, voiceChannel.channelId);
      }
      
      await leaveWebRTCChannel();
      setVoiceConnected(false);
      setMicMuted(false);
      setDeafened(false);
      
      if (screenShare && !screenShare.isRemote) {
        await stopScreenShare();
      }
      setScreenShare(null);
      setAvailableScreenShares({});
      setMyScreenShareStream(null);
      
      // Play voice leave sound
      const soundManager = getSoundManager();
      soundManager.updateSettings(appSettings);
      soundManager.play('voiceLeave');
    } catch (err) {
      console.error('Disconnect error:', err);
    }
  };

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('appSettings', JSON.stringify(appSettings));
  }, [appSettings]);

  // Play screen share in fullscreen mode
  useEffect(() => {
    if (fullscreenShare) {
      const container = document.getElementById('fullscreen-share-video');
      if (container) {
        // Находим правильный stream на основе oderId
        let targetStream = null;
        
        if (fullscreenShare.isRemote) {
          // Чужая демонстрация - берем из availableScreenShares
          const share = availableScreenShares[fullscreenShare.oderId];
          if (share) {
            targetStream = share.stream;
          }
        } else {
          // Своя демонстрация - берем из myScreenShareStream
          targetStream = myScreenShareStream;
        }
        
        if (targetStream) {
          // Create video element for fullscreen
          const video = document.createElement('video');
          video.srcObject = targetStream;
          video.autoplay = true;
          video.playsInline = true;
          video.muted = true;
          video.style.width = '100%';
          video.style.height = '100%';
          video.style.objectFit = 'contain';
          container.innerHTML = '';
          container.appendChild(video);
        }
      }
    }
  }, [fullscreenShare, availableScreenShares, myScreenShareStream]);

  // Apply theme settings
  useEffect(() => {
    const root = document.documentElement;
    
    if (appSettings.theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', appSettings.theme);
    }
    
    root.style.setProperty('--font-size', `${appSettings.fontSize}px`);
    root.setAttribute('data-compact', appSettings.compactMode.toString());
  }, [appSettings.theme, appSettings.fontSize, appSettings.compactMode]);

  // Apply zoom level
  useEffect(() => {
    if (window.electronAPI?.setZoomLevel) {
      window.electronAPI.setZoomLevel(appSettings.zoomLevel);
    }
  }, [appSettings.zoomLevel]);

  const currentServer = servers.find(s => s.id === activeServer);
  const currentChannel = channels.find(c => c.id === activeChannel);
  const isServerOwner = currentServer?.ownerId === authUser?.uid;

  const handleServerChange = (serverId) => {
    setActiveServer(serverId);
    setActiveChannel(null);
  };

  const handleAddServer = () => {
    setNewServerName('');
    setShowCreateServerModal(true);
  };

  const handleCreateServer = async () => {
    if (!newServerName.trim()) return;
    const newServer = await createServer(newServerName);
    if (newServer) {
      setActiveServer(newServer.id);
    }
    setShowCreateServerModal(false);
    setNewServerName('');
  };

  const handleDeleteServer = async (serverId) => {
    const server = servers.find(s => s.id === serverId);
    if (!server) return;
    
    if (server.ownerId === authUser?.uid) {
      if (!confirm('Удалить сервер? Это действие нельзя отменить.')) return;
      await deleteServer(serverId);
    } else {
      if (!confirm('Покинуть сервер?')) return;
      await leaveServer(serverId);
    }
    
    if (activeServer === serverId) {
      const remaining = servers.filter(s => s.id !== serverId);
      if (remaining.length > 0) {
        setActiveServer(remaining[0].id);
      } else {
        setActiveServer(null);
      }
    }
  };

  const handleShowInvite = async () => {
    if (!activeServer) return;
    const code = await getServerInviteCode(activeServer);
    setInviteCode(code || '');
    setShowInviteModal(true);
  };

  const handleJoinServer = async () => {
    if (!joinCode.trim()) return;
    setJoinError('');
    
    try {
      const server = await joinServerByInvite(joinCode);
      setShowJoinModal(false);
      setJoinCode('');
      if (server) {
        setActiveServer(server.id);
      }
    } catch (err) {
      setJoinError(err.message);
    }
  };

  const handleAddChannel = (type = 'text') => {
    setNewChannelName('');
    setNewChannelType(type);
    setShowCreateChannelModal(true);
  };

  const handleCreateChannel = async () => {
    if (!newChannelName.trim() || !activeServer) return;
    const newChannel = await createChannel(activeServer, newChannelName, newChannelType);
    if (newChannelType === 'text' && newChannel) {
      setActiveChannel(newChannel.id);
    }
    setShowCreateChannelModal(false);
    setNewChannelName('');
  };

  const handleDeleteChannel = async (channelId) => {
    if (channels.length <= 1) return;
    
    if (voiceChannel?.serverId === activeServer && voiceChannel?.channelId === channelId) {
      setVoiceChannel(null);
    }
    
    await deleteChannel(channelId);
    
    if (activeChannel === channelId) {
      const remaining = channels.filter(c => c.id !== channelId);
      if (remaining.length > 0) {
        setActiveChannel(remaining[0].id);
      }
    }
  };

  const handleJoinVoice = async (channelId) => {
    // Если в личном звонке - отключиться
    if (dmCall) {
      setDmCall(null);
    }
    
    // Если уже в голосовом канале - очистить screen share перед переключением
    if (voiceChannel) {
      // Stop own screen share if active
      if (screenShare && !screenShare.isRemote) {
        await stopScreenShare();
        if (voiceChannel) {
          await updateScreenShareStatus(voiceChannel.serverId, voiceChannel.channelId, false);
        }
      }
      // Clear all screen share state
      setScreenShare(null);
      setAvailableScreenShares({});
      setMyScreenShareStream(null);
      setPendingScreenShare(null);
      // Reset voice connected to show "Connecting..." state
      setVoiceConnected(false);
    }
    
    // Установить активный канал на голосовой канал
    setActiveChannel(channelId);
    setVoiceChannel({ serverId: activeServer, channelId });
  };

  const handleLeaveVoice = async () => {
    await disconnectFromVoice();
    setVoiceChannel(null);
  };

  const handleToggleMic = async () => {
    const newMuted = !micMuted;
    setMicMuted(newMuted);
    await toggleMicrophone(!newMuted);
    
    // Update voice status in Firebase
    if (voiceChannel) {
      await updateVoiceStatus(voiceChannel.serverId, voiceChannel.channelId, newMuted, deafened);
    }
    
    // Play mic mute/unmute sound
    const soundManager = getSoundManager();
    soundManager.updateSettings(appSettings);
    soundManager.play(newMuted ? 'micMute' : 'micUnmute');
  };

  const handleToggleDeafen = async () => {
    const newDeafened = !deafened;
    setDeafened(newDeafened);
    
    // Play sound
    const soundManager = getSoundManager();
    soundManager.updateSettings(appSettings);
    soundManager.play(newDeafened ? 'soundMute' : 'soundUnmute');
    
    // Mute/unmute all incoming audio
    setWebRTCDeafened(newDeafened);
    
    // When deafening, also mute mic
    let newMuted = micMuted;
    if (newDeafened && !micMuted) {
      newMuted = true;
      setMicMuted(true);
      await toggleMicrophone(false);
    }
    
    // Update voice status in Firebase
    if (voiceChannel) {
      await updateVoiceStatus(voiceChannel.serverId, voiceChannel.channelId, newMuted, newDeafened);
    }
  };

  const handleAcceptIncomingCall = async () => {
    if (!incomingCall) return;
    
    // Отключиться от голосового канала если подключен
    if (voiceChannel) {
      await disconnectFromVoice();
      setVoiceChannel(null);
    }
    
    await acceptCall(incomingCall.id);
    
    // Загрузить photoURL звонящего если его нет
    let callerPhotoURL = incomingCall.callerPhotoURL || null;
    if (!callerPhotoURL && incomingCall.callerId) {
      try {
        const { getUserProfile } = await import('./services/friendsService');
        const profile = await getUserProfile(incomingCall.callerId);
        if (profile?.photoURL) {
          callerPhotoURL = profile.photoURL;
        }
      } catch (e) {
        console.error('Failed to load caller profile for avatar:', e);
      }
    }
    
    // Установить dmCall state
    setDmCall({
      oderId: incomingCall.callerId,
      name: incomingCall.callerName,
      photoURL: callerPhotoURL
    });
    
    // Подключиться к WebRTC для DM звонка
    const currentUser = auth.currentUser;
    if (currentUser) {
      const oderId1 = currentUser.uid;
      const oderId2 = incomingCall.callerId;
      const channelName = 'dm_' + [oderId1, oderId2].sort().join('_');
      
      try {
        await joinWebRTCChannel(
          channelName,
          currentUser.displayName || 'User',
          // onUserJoined
          (oderId, userName, stream) => {
            console.log('DM call: user joined', userName);
          },
          // onUserLeft
          (oderId, userName) => {
            console.log('DM call: user left', userName);
            // Полная очистка при выходе пользователя
            leaveWebRTCChannel();
            setDmCall(null);
            setMicMuted(false);
            setDeafened(false);
            setScreenShare(null);
          },
          // onVolumeIndicator
          (volumes) => {
            setSpeakingUsers(volumes.reduce((acc, vol) => {
              acc[vol.oderId] = vol.level;
              if (vol.name) acc[vol.name] = vol.level;
              return acc;
            }, {}));
          },
          appSettings,
          // onScreenShare - when receiving screen share from another user
          (oderId, userName, stream) => {
            console.log('DM call: received screen share from ' + userName);
            
            // Add to availableScreenShares
            setAvailableScreenShares(prev => ({
              ...prev,
              [oderId]: { userName, stream, oderId }
            }));
            
            // Also set screenShare for backward compatibility
            setScreenShare(prev => {
              // Don't replace our own screen share
              if (prev && !prev.isRemote) {
                return prev;
              }
              return {
                oderId: oderId,
                userName: userName,
                stream: stream,
                isRemote: true
              };
            });
          },
          // onScreenShareEnded - when screen share stops
          (oderId, userName) => {
            console.log('DM call: screen share ended from ' + userName);
            
            // Remove from availableScreenShares
            setAvailableScreenShares(prev => {
              const newShares = { ...prev };
              delete newShares[oderId];
              return newShares;
            });
            
            // Also clear screenShare for backward compatibility
            setScreenShare(prev => {
              if (prev && prev.oderId === oderId) {
                return null;
              }
              return prev;
            });
          }
        );
      } catch (err) {
        console.error('Failed to join DM call:', err);
      }
    }
    
    setIncomingCall(null);
    setView('friends');
  };

  const handleDeclineIncomingCall = async () => {
    if (!incomingCall) return;
    await declineCall(incomingCall.id);
    setIncomingCall(null);
  };

  const handleEndDMCall = async () => {
    if (!dmCall) return;
    
    try {
      // Stop screen share if active
      if (screenShare && !screenShare.isRemote) {
        await stopScreenShare();
      }
      
      // Отключиться от WebRTC
      await leaveWebRTCChannel();
      
      // Завершить звонок в Firebase
      const currentUser = auth.currentUser;
      if (currentUser) {
        const callId = [currentUser.uid, dmCall.oderId].sort().join('_');
        await endCall(callId);
        
        // Завершить активный звонок в Realtime Database
        await endActiveCall(dmCall.oderId);
      }
      
      // Очистить состояние
      setDmCall(null);
      setMicMuted(false);
      setDeafened(false);
      setScreenShare(null);
      setMyScreenShareStream(null);
      setAvailableScreenShares({});
    } catch (err) {
      console.error('Error ending DM call:', err);
    }
  };

  const handleOpenDMFromSidebar = (contact) => {
    setActiveDMContact(contact);
    setView('friends');
  };

  const handleScreenSelect = async (stream, sourceName) => {
    setShowScreenPicker(false);
    
    // Play screen share start sound
    const soundManager = getSoundManager();
    soundManager.updateSettings(appSettings);
    soundManager.play('screenShareStart');
    
    // Импортируем функцию для публикации стрима через WebRTC
    const { startScreenShareFromStream } = await import('./services/webrtcService');
    const track = await startScreenShareFromStream(stream);
    
    if (track) {
      // Save my screen share stream for later re-viewing
      setMyScreenShareStream(stream);
      
      setScreenShare({
        oderId: auth.currentUser?.uid,
        userName: user.name,
        sourceName: sourceName,
        track: track,
        stream: stream,
        isRemote: false
      });
      
      // Update screen share status in Firebase
      if (voiceChannel) {
        await updateScreenShareStatus(voiceChannel.serverId, voiceChannel.channelId, true);
      }
      
      stream.getVideoTracks()[0].onended = async () => {
        setScreenShare(null);
        setMyScreenShareStream(null);
        // Update screen share status in Firebase
        if (voiceChannel) {
          await updateScreenShareStatus(voiceChannel.serverId, voiceChannel.channelId, false);
        }
      };
    }
  };

  // Watch a user's screen share (including own)
  const handleWatchScreenShare = (oderId, userName, channelId) => {
    const currentUserId = auth.currentUser?.uid;
    
    // If not in the voice channel, join it first
    if (!voiceChannel || voiceChannel.channelId !== channelId) {
      // Join the voice channel - the screen share will be received via WebRTC
      handleJoinVoice(channelId);
      // Set a pending screen share to watch after joining (only for others)
      if (oderId !== currentUserId) {
        setPendingScreenShare({ oderId, userName });
      }
      return;
    }
    
    // If already in the voice channel, switch to it to see the view
    setActiveChannel(channelId);
    
    // Check if this is our own screen share
    if (oderId === currentUserId) {
      // Show our own screen share using saved stream
      if (myScreenShareStream) {
        setScreenShare({
          oderId: currentUserId,
          userName: user.name,
          stream: myScreenShareStream,
          isRemote: false
        });
      }
      return;
    }
    
    // Check if we have this user's stream in availableScreenShares
    const share = availableScreenShares[oderId];
    if (share) {
      setScreenShare({
        oderId: share.oderId,
        userName: share.userName,
        stream: share.stream,
        isRemote: true
      });
    }
  };

  // Stop screen share and update Firebase status
  const handleStopScreenShare = async () => {
    // Play screen share end sound BEFORE stopping
    const soundManager = getSoundManager();
    soundManager.updateSettings(appSettings);
    soundManager.play('screenShareEnd');
    
    // Stop the actual screen share stream
    await stopScreenShare();
    setScreenShare(null);
    setMyScreenShareStream(null);
    
    // Close fullscreen if it was showing our screen share
    setFullscreenShare(prev => {
      if (prev && !prev.isRemote) {
        return null;
      }
      return prev;
    });
    
    if (voiceChannel) {
      await updateScreenShareStatus(voiceChannel.serverId, voiceChannel.channelId, false);
    }
  };
  
  // Change screen source - stop current and open picker
  const handleChangeScreenSource = async () => {
    // Stop current screen share first
    await stopScreenShare();
    setScreenShare(null);
    setMyScreenShareStream(null);
    
    if (voiceChannel) {
      await updateScreenShareStatus(voiceChannel.serverId, voiceChannel.channelId, false);
    }
    
    // Open screen picker to select new source
    setShowScreenPicker(true);
  };

  const handleSendMessage = async (content) => {
    if (activeServer && activeChannel) {
      await sendMessage(activeServer, activeChannel, content);
    }
  };

  const handleEditMessage = async (msgId, newContent) => {
    await editMessage(msgId, newContent);
  };

  const handleDeleteMessage = async (msgId) => {
    await deleteMessage(msgId);
  };

  const handleReactMessage = async (msgId, emoji) => {
    const msg = messages.find(m => m.id === msgId);
    if (msg) {
      await addReaction(msgId, emoji, msg.reactions);
    }
  };

  const handleLogout = async () => {
    try {
      // Cleanup presence before signing out
      await cleanupPresence();
      await signOut(auth);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleAvatarChange = async (newAvatarUrl) => {
    // Update avatar in voice channel if connected
    if (voiceChannel) {
      await updateVoiceChannelAvatar(voiceChannel.serverId, voiceChannel.channelId, newAvatarUrl);
    }
  };

  if (authLoading) {
    return (
      <div className="app">
        <TitleBar />
        <div className="app-content" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: 'var(--text-muted)' }}>Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="app">
        <TitleBar />
        <div className="app-content">
          <AuthPage />
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <TitleBar />
      <div className="app-content">
        {view === 'settings' ? (
          <>
            <SettingsMenu activeSection={settingsSection} onSectionChange={setSettingsSection} />
            {settingsSection === 'account' ? (
              <AccountSettings user={user} setUser={setUser} onClose={() => setView('main')} onLogout={handleLogout} onAvatarChange={handleAvatarChange} />
            ) : (
              <AppSettings 
                section={settingsSection} 
                settings={appSettings} 
                setSettings={setAppSettings} 
                onClose={() => setView('main')} 
              />
            )}
          </>
        ) : view === 'friends' ? (
          <>
            <ServerList 
              servers={servers}
              activeServer={activeServer}
              onServerChange={handleServerChange}
              onAddServer={handleAddServer}
              onJoinServer={() => setShowJoinModal(true)}
              onFriendsClick={() => setView('friends')}
              friendsActive={true}
              recentContacts={recentContacts}
              onOpenDM={handleOpenDMFromSidebar}
              activeContactId={activeDMContact?.oderId || activeDMContact?.id}
              unreadDMs={unreadDMs}
              unreadNotifications={unreadNotifications}
              onOpenNotifications={() => setShowNotifications(true)}
            />
            <FriendsPage 
              onBack={() => setView('main')}
              user={user}
              authUser={authUser}
              onOpenSettings={() => setView('settings')}
              appSettings={appSettings}
              onShowScreenPicker={() => setShowScreenPicker(true)}
              onStopScreenShare={handleStopScreenShare}
              screenShare={screenShare}
              setScreenShare={setScreenShare}
              myScreenShareStream={myScreenShareStream}
              availableScreenShares={availableScreenShares}
              setAvailableScreenShares={setAvailableScreenShares}
              onFullscreenShare={(oderId, userName) => {
                // Определяем чью демонстрацию открываем
                const currentUserId = auth.currentUser?.uid;
                const isRemote = oderId !== currentUserId;
                
                // Находим stream для этого пользователя
                let targetStream = null;
                if (isRemote) {
                  // Чужая демонстрация
                  const share = availableScreenShares[oderId];
                  if (share) {
                    targetStream = share.stream;
                  }
                } else {
                  // Своя демонстрация
                  targetStream = myScreenShareStream;
                }
                
                if (targetStream) {
                  setFullscreenShare({
                    oderId: oderId,
                    userName: userName,
                    isRemote: isRemote
                  });
                }
              }}
              voiceChannel={voiceChannel}
              onLeaveVoiceChannel={handleLeaveVoice}
              dmCall={dmCall}
              setDmCall={setDmCall}
              activeDMContact={activeDMContact}
              setActiveDMContact={setActiveDMContact}
              micMuted={micMuted}
              deafened={deafened}
              speakingUsers={speakingUsers}
              onToggleMic={handleToggleMic}
              onToggleDeafen={handleToggleDeafen}
              onEndCall={handleEndDMCall}
            />
          </>
        ) : (
          <>
            <ServerList 
              servers={servers}
              activeServer={activeServer}
              onServerChange={handleServerChange}
              onAddServer={handleAddServer}
              onJoinServer={() => setShowJoinModal(true)}
              onFriendsClick={() => setView('friends')}
              friendsActive={false}
              recentContacts={recentContacts}
              onOpenDM={handleOpenDMFromSidebar}
              activeContactId={activeDMContact?.oderId || activeDMContact?.id}
              unreadDMs={unreadDMs}
              unreadNotifications={unreadNotifications}
              onOpenNotifications={() => setShowNotifications(true)}
            />
            {activeServer ? (
              <div className="main-panel">
                <ChannelSidebar 
                  serverName={currentServer?.name || 'Server'}
                  serverId={activeServer}
                  channels={channels}
                  activeChannel={activeChannel} 
                  setActiveChannel={setActiveChannel}
                  onOpenSettings={() => setView('settings')}
                  onAddChannel={handleAddChannel}
                  onDeleteChannel={handleDeleteChannel}
                  onRenameChannel={renameChannel}
                  onDeleteServer={() => handleDeleteServer(activeServer)}
                  onShowInvite={handleShowInvite}
                  user={user}
                  voiceChannel={voiceChannel?.serverId === activeServer ? voiceChannel.channelId : null}
                  voiceConnected={voiceConnected}
                  onJoinVoice={handleJoinVoice}
                  onLeaveVoice={handleLeaveVoice}
                  micMuted={micMuted}
                  onToggleMic={handleToggleMic}
                  deafened={deafened}
                  onToggleDeafen={handleToggleDeafen}
                  appSettings={appSettings}
                  screenShare={screenShare}
                  setScreenShare={setScreenShare}
                  onShowScreenPicker={() => setShowScreenPicker(true)}
                  isOwner={isServerOwner}
                  speakingUsers={speakingUsers}
                  onWatchScreenShare={handleWatchScreenShare}
                  onStopScreenShare={handleStopScreenShare}
                  onOpenDM={(voiceUser) => {
                    // Open DM with user from voice channel
                    setActiveDMContact({ id: voiceUser.oderId, oderId: voiceUser.oderId, name: voiceUser.name, photoURL: voiceUser.photoURL });
                    setView('friends');
                  }}
                  onAddFriend={async (voiceUser) => {
                    // Send friend request
                    const { sendFriendRequest } = await import('./services/friendsService');
                    try {
                      await sendFriendRequest(voiceUser.oderId);
                    } catch (err) {
                      console.error('Failed to send friend request:', err);
                    }
                  }}
                />
                <ChatArea 
                  channelName={currentChannel?.name || 'general'}
                  messages={messages}
                  onSendMessage={handleSendMessage}
                  onEditMessage={handleEditMessage}
                  onDeleteMessage={handleDeleteMessage}
                  onReactMessage={handleReactMessage}
                  currentUser={user.name}
                  highlightMentions={appSettings.highlightMentions}
                  voiceChannel={voiceChannel}
                  activeServer={activeServer}
                  voiceConnected={voiceConnected}
                  micMuted={micMuted}
                  onToggleMic={handleToggleMic}
                  onShowScreenPicker={() => setShowScreenPicker(true)}
                  speakingUsers={speakingUsers}
                  currentChannelType={currentChannel?.type}
                  onLeaveVoice={handleLeaveVoice}
                  availableScreenShares={availableScreenShares}
                  myScreenShareStream={myScreenShareStream}
                  screenShare={screenShare}
                  onStopScreenShare={handleStopScreenShare}
                  onFullscreenShare={(oderId, userName) => {
                    // Определяем чью демонстрацию открываем
                    const currentUserId = auth.currentUser?.uid;
                    const isRemote = oderId !== currentUserId;
                    
                    // Находим stream для этого пользователя
                    let targetStream = null;
                    if (isRemote) {
                      // Чужая демонстрация
                      const share = availableScreenShares[oderId];
                      if (share) {
                        targetStream = share.stream;
                      }
                    } else {
                      // Своя демонстрация
                      targetStream = myScreenShareStream;
                    }
                    
                    if (targetStream) {
                      setFullscreenShare({
                        oderId: oderId,
                        userName: userName,
                        isRemote: isRemote
                      });
                    }
                  }}
                />
              </div>
            ) : (
              <div className="main-panel" style={{ alignItems: 'center', justifyContent: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h2 style={{ color: 'var(--text-primary)' }}>Нет серверов</h2>
                <p style={{ color: 'var(--text-muted)' }}>Создайте сервер или присоединитесь по приглашению</p>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={handleAddServer} style={{ padding: '12px 24px', borderRadius: '8px', background: 'var(--accent)', color: 'white', border: 'none', cursor: 'pointer' }}>
                    Создать сервер
                  </button>
                  <button onClick={() => setShowJoinModal(true)} style={{ padding: '12px 24px', borderRadius: '8px', background: 'var(--bg-3)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer' }}>
                    Присоединиться
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      
      {showScreenPicker && (
        <ScreenPicker 
          onSelect={handleScreenSelect}
          onClose={() => setShowScreenPicker(false)}
        />
      )}
      
      {showNotifications && (
        <NotificationPanel 
          notifications={notifications}
          onClose={() => setShowNotifications(false)}
        />
      )}
      
      {/* Полноэкранный просмотр демонстрации */}
      {fullscreenShare && (
        <div className="fullscreen-share-overlay">
          <div className="fullscreen-share-video" id="fullscreen-share-video"></div>
          <div className="fullscreen-share-controls">
            <div className="fullscreen-share-info">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" clipRule="evenodd" d="M11 17H4C3.20435 17 2.44129 16.6839 1.87868 16.1213C1.31607 15.5587 1 14.7956 1 14V6C1 5.20435 1.31607 4.44129 1.87868 3.87868C2.44129 3.31607 3.20435 3 4 3H20C20.7956 3 21.5587 3.31607 22.1213 3.87868C22.6839 4.44129 23 5.20435 23 6V14C23 14.7956 22.6839 15.5587 22.1213 16.1213C21.5587 16.6839 20.7956 17 20 17H13V19H16C16.2652 19 16.5196 19.1054 16.7071 19.2929C16.8946 19.4804 17 19.7348 17 20C17 20.2652 16.8946 20.5196 16.7071 20.7071C16.5196 20.8946 16.2652 21 16 21H8C7.73478 21 7.48043 20.8946 7.29289 20.7071C7.10536 20.5196 7 20.2652 7 20C7 19.7348 7.10536 19.4804 7.29289 19.2929C7.48043 19.1054 7.73478 19 8 19H11V17ZM4 5H20C20.2652 5 20.5196 5.10536 20.7071 5.29289C20.8946 5.48043 21 5.73478 21 6V14C21 14.2652 20.8946 14.5196 20.7071 14.7071C20.5196 14.8946 20.2652 15 20 15H4C3.73478 15 3.48043 14.8946 3.29289 14.7071C3.10536 14.5196 3 14.2652 3 14V6C3 5.73478 3.10536 5.48043 3.29289 5.29289C3.48043 5.10536 3.73478 5 4 5Z" fill="currentColor"/>
              </svg>
              <span>{fullscreenShare.userName} демонстрирует экран</span>
            </div>
            <div className="fullscreen-share-buttons">
              <button 
                className="fullscreen-btn"
                onClick={() => setFullscreenShare(null)}
                title="Закрыть полноэкранный режим"
              >
                <svg width="24" height="24" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                </svg>
              </button>
              {/* Показываем кнопку "Остановить демонстрацию" только для своей демонстрации */}
              {!fullscreenShare.isRemote && fullscreenShare.oderId === auth.currentUser?.uid && (
                <button 
                  className="fullscreen-btn end"
                  onClick={async () => {
                    await handleStopScreenShare();
                  }}
                  title="Остановить демонстрацию"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path fillRule="evenodd" clipRule="evenodd" d="M11 17H4C3.20435 17 2.44129 16.6839 1.87868 16.1213C1.31607 15.5587 1 14.7956 1 14V6C1 5.20435 1.31607 4.44129 1.87868 3.87868C2.44129 3.31607 3.20435 3 4 3H20C20.7956 3 21.5587 3.31607 22.1213 3.87868C22.6839 4.44129 23 5.20435 23 6V14C23 14.7956 22.6839 15.5587 22.1213 16.1213C21.5587 16.6839 20.7956 17 20 17H13V19H16C16.2652 19 16.5196 19.1054 16.7071 19.2929C16.8946 19.4804 17 19.7348 17 20C17 20.2652 16.8946 20.5196 16.7071 20.7071C16.5196 20.8946 16.2652 21 16 21H8C7.73478 21 7.48043 20.8946 7.29289 20.7071C7.10536 20.5196 7 20.2652 7 20C7 19.7348 7.10536 19.4804 7.29289 19.2929C7.48043 19.1054 7.73478 19 8 19H11V17ZM4 5H20C20.2652 5 20.5196 5.10536 20.7071 5.29289C20.8946 5.48043 21 5.73478 21 6V14C21 14.2652 20.8946 14.5196 20.7071 14.7071C20.5196 14.8946 20.2652 15 20 15H4C3.73478 15 3.48043 14.8946 3.29289 14.7071C3.10536 14.5196 3 14.2652 3 14V6C3 5.73478 3.10536 5.48043 3.29289 5.29289C3.48043 5.10536 3.73478 5 4 5Z" fill="currentColor"/>
                    <rect x="9" y="8.06055" width="1.5" height="7" rx="0.75" transform="rotate(-45 9 8.06055)" fill="currentColor"/>
                    <rect x="14" y="7.06055" width="1.5" height="7" rx="0.75" transform="rotate(45 14 7.06055)" fill="currentColor"/>
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Модалка с инвайт-кодом */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Пригласить на сервер</h3>
            <p>Отправьте этот код друзьям:</p>
            <div className="invite-code-box">
              <code>{inviteCode}</code>
              <button onClick={() => {
                navigator.clipboard.writeText(inviteCode);
              }}>Копировать</button>
            </div>
            <button className="modal-close" onClick={() => setShowInviteModal(false)}>Закрыть</button>
          </div>
        </div>
      )}
      
      {/* Модалка присоединения */}
      {showJoinModal && (
        <div className="modal-overlay" onClick={() => setShowJoinModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Присоединиться к серверу</h3>
            <p>Введите код приглашения:</p>
            <input 
              type="text" 
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="XXXXXX"
              maxLength={6}
              style={{ textTransform: 'uppercase', textAlign: 'center', fontSize: '18px', letterSpacing: '4px' }}
            />
            {joinError && <p className="error">{joinError}</p>}
            <div className="modal-buttons">
              <button onClick={() => setShowJoinModal(false)}>Отмена</button>
              <button className="primary" onClick={handleJoinServer}>Присоединиться</button>
            </div>
          </div>
        </div>
      )}
      
      {/* Модалка создания сервера */}
      {showCreateServerModal && (
        <div className="modal-overlay" onClick={() => setShowCreateServerModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Создать сервер</h3>
            <p>Введите название сервера:</p>
            <input 
              type="text" 
              value={newServerName}
              onChange={e => setNewServerName(e.target.value)}
              placeholder="Мой сервер"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleCreateServer()}
            />
            <div className="modal-buttons">
              <button onClick={() => setShowCreateServerModal(false)}>Отмена</button>
              <button className="primary" onClick={handleCreateServer}>Создать</button>
            </div>
          </div>
        </div>
      )}
      
      {/* Модалка создания канала */}
      {showCreateChannelModal && (
        <div className="modal-overlay" onClick={() => setShowCreateChannelModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Создать {newChannelType === 'voice' ? 'голосовой' : 'текстовый'} канал</h3>
            <p>Введите название канала:</p>
            <input 
              type="text" 
              value={newChannelName}
              onChange={e => setNewChannelName(e.target.value)}
              placeholder={newChannelType === 'voice' ? 'Голосовой' : 'general'}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleCreateChannel()}
            />
            <div className="modal-buttons">
              <button onClick={() => setShowCreateChannelModal(false)}>Отмена</button>
              <button className="primary" onClick={handleCreateChannel}>Создать</button>
            </div>
          </div>
        </div>
      )}
      
      {/* Входящий звонок */}
      {incomingCall && (
        <div className="incoming-call-overlay">
          <div className="incoming-call-modal">
            <div className="incoming-call-avatar">
              {incomingCall.callerName?.[0] || '?'}
            </div>
            <h3>{incomingCall.callerName}</h3>
            <p>Входящий звонок...</p>
            <div className="incoming-call-actions">
              <button className="decline-call-btn" onClick={handleDeclineIncomingCall}>
                <svg width="24" height="24" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
                </svg>
              </button>
              <button className="accept-call-btn" onClick={handleAcceptIncomingCall}>
                <svg width="24" height="24" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
