import { db, auth, rtdb } from '../firebase';
import { 
  doc, 
  updateDoc,
  onSnapshot
} from 'firebase/firestore';
import {
  ref,
  set,
  update,
  remove,
  onValue,
  onDisconnect,
  serverTimestamp as rtdbServerTimestamp
} from 'firebase/database';

// Throttle voice status updates
const voiceStatusCache = new Map();
const VOICE_STATUS_INTERVAL = 2000; // 2 seconds minimum between updates

// Присоединиться к голосовому каналу (записать в Realtime Database)
export const joinVoiceChannelDB = async (serverId, channelId, photoURL = null) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  const userPath = `voiceChannels/${serverId}/${channelId}/${currentUser.uid}`;
  const userRef = ref(rtdb, userPath);
  
  // Set user data
  await set(userRef, {
    oderId: currentUser.uid,
    userName: currentUser.displayName || 'User',
    photoURL: photoURL || currentUser.photoURL || null,
    muted: false,
    deafened: false,
    screenSharing: false,
    joinedAt: rtdbServerTimestamp()
  });
  
  // Setup automatic removal on disconnect
  await onDisconnect(userRef).remove();
  
  console.log('Joined voice channel with auto-disconnect cleanup');
};

// Обновить статус микрофона/звука (with throttling)
export const updateVoiceStatus = async (serverId, channelId, muted, deafened) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  const cacheKey = `${serverId}_${channelId}_status`;
  const now = Date.now();
  
  // Check cache to avoid too frequent updates
  const cached = voiceStatusCache.get(cacheKey);
  if (cached && now - cached.timestamp < VOICE_STATUS_INTERVAL) {
    // Check if values actually changed
    if (cached.muted === muted && cached.deafened === deafened) {
      return; // No change, skip update
    }
  }
  
  voiceStatusCache.set(cacheKey, { muted, deafened, timestamp: now });
  
  try {
    const userPath = `voiceChannels/${serverId}/${channelId}/${currentUser.uid}`;
    const userRef = ref(rtdb, userPath);
    
    // Используем update вместо set, чтобы не стирать photoURL
    await update(userRef, {
      muted: muted,
      deafened: deafened
    });
  } catch (err) {
    console.warn('Could not update voice status:', err);
  }
};

// Обновить статус screen share (with throttling)
export const updateScreenShareStatus = async (serverId, channelId, isSharing) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  const cacheKey = `${serverId}_${channelId}_screen`;
  const now = Date.now();
  
  // Check cache
  const cached = voiceStatusCache.get(cacheKey);
  if (cached && now - cached.timestamp < VOICE_STATUS_INTERVAL) {
    if (cached.isSharing === isSharing) {
      return; // No change
    }
  }
  
  voiceStatusCache.set(cacheKey, { isSharing, timestamp: now });
  
  try {
    const userPath = `voiceChannels/${serverId}/${channelId}/${currentUser.uid}`;
    const userRef = ref(rtdb, userPath);
    
    // Используем update для обновления только screenSharing
    await update(userRef, {
      screenSharing: isSharing
    });
  } catch (err) {
    console.warn('Could not update screen share status:', err);
  }
};

// Покинуть голосовой канал (удалить из Realtime Database)
export const leaveVoiceChannelDB = async (serverId, channelId) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  const userPath = `voiceChannels/${serverId}/${channelId}/${currentUser.uid}`;
  const userRef = ref(rtdb, userPath);
  
  // Cancel onDisconnect
  await onDisconnect(userRef).cancel();
  
  // Remove user
  await remove(userRef);
};

// Обновить аватар пользователя в голосовом канале
export const updateVoiceChannelAvatar = async (serverId, channelId, photoURL) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  try {
    const userPath = `voiceChannels/${serverId}/${channelId}/${currentUser.uid}/photoURL`;
    const photoRef = ref(rtdb, userPath);
    
    await set(photoRef, photoURL);
    console.log('Voice channel avatar updated');
  } catch (err) {
    console.warn('Could not update voice channel avatar:', err);
  }
};

// Подписка на пользователей в голосовом канале (для отображения когда сам в канале)
export const subscribeToVoiceChannelUsers = (serverId, channelId, callback) => {
  const currentUser = auth.currentUser;
  const currentUid = currentUser ? currentUser.uid : null;
  
  const channelPath = `voiceChannels/${serverId}/${channelId}`;
  const channelRef = ref(rtdb, channelPath);
  
  return onValue(channelRef, (snapshot) => {
    const result = [];
    const data = snapshot.val();
    
    if (data) {
      Object.keys(data).forEach(userId => {
        // Включаем ВСЕХ пользователей, включая себя
        const userData = data[userId];
        result.push({
          oderId: userId,
          name: userData.userName,
          photoURL: userData.photoURL,
          muted: userData.muted,
          deafened: userData.deafened,
          screenSharing: userData.screenSharing
        });
      });
    }
    
    callback(result);
  }, (error) => {
    console.error('Realtime Database error:', error);
    callback([]);
  });
};

// Подписка на ВСЕХ пользователей во ВСЕХ голосовых каналах сервера
export const subscribeToAllVoiceUsers = (serverId, callback) => {
  const serverPath = `voiceChannels/${serverId}`;
  const serverRef = ref(rtdb, serverPath);
  
  // Track user profile listeners for cleanup
  const profileUnsubscribers = new Map();
  
  // Store voice users data that will be updated by profile listeners
  let voiceUsersData = {};
  
  const updateUserAvatar = (userId, photoURL) => {
    // Update all instances of this user across all channels
    let updated = false;
    Object.keys(voiceUsersData).forEach(channelId => {
      voiceUsersData[channelId] = voiceUsersData[channelId].map(user => {
        if (user.oderId === userId && user.photoURL !== photoURL) {
          updated = true;
          return { ...user, photoURL };
        }
        return user;
      });
    });
    
    if (updated) {
      console.log(`Voice user ${userId} avatar updated on server`);
      callback({ ...voiceUsersData });
    }
  };
  
  const unsubscribe = onValue(serverRef, (snapshot) => {
    const byChannel = {};
    const userIds = new Set();
    const data = snapshot.val();
    
    if (data) {
      // Iterate through channels
      Object.keys(data).forEach(channelId => {
        const channelData = data[channelId];
        byChannel[channelId] = [];
        
        // Iterate through users in this channel
        Object.keys(channelData).forEach(userId => {
          const userData = channelData[userId];
          userIds.add(userId);
          
          byChannel[channelId].push({
            oderId: userId,
            name: userData.userName,
            photoURL: userData.photoURL,
            muted: userData.muted || false,
            deafened: userData.deafened || false,
            screenSharing: userData.screenSharing || false
          });
          
          // Subscribe to this user's profile changes if not already subscribed
          if (!profileUnsubscribers.has(userId)) {
            const userRef = doc(db, 'users', userId);
            const profileUnsub = onSnapshot(userRef, (userDoc) => {
              if (userDoc.exists()) {
                const firestoreUserData = userDoc.data();
                if (firestoreUserData.photoURL) {
                  updateUserAvatar(userId, firestoreUserData.photoURL);
                }
              }
            });
            profileUnsubscribers.set(userId, profileUnsub);
          }
        });
      });
    }
    
    // Clean up listeners for users no longer in voice channels
    for (const [userId, unsub] of profileUnsubscribers) {
      if (!userIds.has(userId)) {
        unsub();
        profileUnsubscribers.delete(userId);
      }
    }
    
    // Update stored voice users data
    voiceUsersData = byChannel;
    callback(byChannel);
  }, (error) => {
    console.error('Realtime Database error:', error);
    callback({});
  });
  
  // Return cleanup function that also cleans up profile listeners
  return () => {
    unsubscribe();
    profileUnsubscribers.forEach(unsub => unsub());
    profileUnsubscribers.clear();
  };
};

// Очистить все записи пользователя во всех голосовых каналах (legacy cleanup)
export const cleanupUserVoiceChannels = async () => {
  // Not needed with Realtime Database + onDisconnect, but keep for compatibility
  console.log('Cleanup not needed with Realtime Database onDisconnect');
};
