import { rtdb, auth } from '../firebase';
import { ref, set, remove, onValue, onDisconnect } from 'firebase/database';

let typingTimeout = null;
const TYPING_TIMEOUT = 3000; // 3 seconds

/**
 * Показать что пользователь печатает в канале
 * @param {string} serverId - ID сервера
 * @param {string} channelId - ID канала
 */
export const setTyping = async (serverId, channelId) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  const typingPath = `typing/${serverId}/${channelId}/${currentUser.uid}`;
  const typingRef = ref(rtdb, typingPath);
  
  try {
    await set(typingRef, {
      userName: currentUser.displayName || 'User',
      timestamp: Date.now()
    });
    
    // Auto-remove on disconnect
    await onDisconnect(typingRef).remove();
    
    // Clear existing timeout
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }
    
    // Auto-remove after 3 seconds
    typingTimeout = setTimeout(async () => {
      await remove(typingRef);
    }, TYPING_TIMEOUT);
  } catch (err) {
    console.warn('Could not set typing status:', err);
  }
};

/**
 * Убрать индикатор печати
 * @param {string} serverId - ID сервера
 * @param {string} channelId - ID канала
 */
export const clearTyping = async (serverId, channelId) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  if (typingTimeout) {
    clearTimeout(typingTimeout);
    typingTimeout = null;
  }
  
  const typingPath = `typing/${serverId}/${channelId}/${currentUser.uid}`;
  const typingRef = ref(rtdb, typingPath);
  
  try {
    await remove(typingRef);
  } catch (err) {
    console.warn('Could not clear typing status:', err);
  }
};

/**
 * Подписаться на индикаторы печати в канале
 * @param {string} serverId - ID сервера
 * @param {string} channelId - ID канала
 * @param {Function} callback - Функция обратного вызова с массивом печатающих пользователей
 * @returns {Function} Функция отписки
 */
export const subscribeToTyping = (serverId, channelId, callback) => {
  const currentUser = auth.currentUser;
  const currentUid = currentUser ? currentUser.uid : null;
  
  const typingPath = `typing/${serverId}/${channelId}`;
  const typingRef = ref(rtdb, typingPath);
  
  return onValue(typingRef, (snapshot) => {
    const typingUsers = [];
    const data = snapshot.val();
    const now = Date.now();
    
    if (data) {
      Object.keys(data).forEach(userId => {
        // Skip self
        if (userId === currentUid) return;
        
        const userData = data[userId];
        const timestamp = userData.timestamp || 0;
        
        // Check if typing is still valid (within timeout)
        if (now - timestamp < TYPING_TIMEOUT + 1000) {
          typingUsers.push({
            userId,
            userName: userData.userName
          });
        }
      });
    }
    
    callback(typingUsers);
  });
};
