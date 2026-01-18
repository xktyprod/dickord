import { rtdb, auth } from '../firebase';
import { ref, set, remove, onValue, onDisconnect } from 'firebase/database';

/**
 * Начать DM звонок (записать в Realtime Database)
 * @param {string} otherUserId - ID другого пользователя
 * @param {string} callType - Тип звонка ('voice' или 'video')
 */
export const startActiveCall = async (otherUserId, callType = 'voice') => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  // Create sorted call ID
  const callId = [currentUser.uid, otherUserId].sort().join('_');
  const callPath = `activeCalls/${callId}`;
  const callRef = ref(rtdb, callPath);
  
  try {
    await set(callRef, {
      participants: {
        [currentUser.uid]: {
          userName: currentUser.displayName || 'User',
          joinedAt: Date.now()
        },
        [otherUserId]: {
          userName: 'User',
          joinedAt: Date.now()
        }
      },
      callType,
      startedAt: Date.now(),
      startedBy: currentUser.uid
    });
    
    // Auto-remove on disconnect
    await onDisconnect(callRef).remove();
    
    console.log('Active call started:', callId);
  } catch (err) {
    console.warn('Could not start active call:', err);
  }
};

/**
 * Завершить активный звонок
 * @param {string} otherUserId - ID другого пользователя
 */
export const endActiveCall = async (otherUserId) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  const callId = [currentUser.uid, otherUserId].sort().join('_');
  const callPath = `activeCalls/${callId}`;
  const callRef = ref(rtdb, callPath);
  
  try {
    // Cancel onDisconnect
    await onDisconnect(callRef).cancel();
    
    // Remove call
    await remove(callRef);
    
    console.log('Active call ended:', callId);
  } catch (err) {
    console.warn('Could not end active call:', err);
  }
};

/**
 * Проверить, в звонке ли пользователь
 * @param {string} userId - ID пользователя
 * @param {Function} callback - Функция обратного вызова с информацией о звонке
 * @returns {Function} Функция отписки
 */
export const subscribeToUserCall = (userId, callback) => {
  const callsPath = 'activeCalls';
  const callsRef = ref(rtdb, callsPath);
  
  return onValue(callsRef, (snapshot) => {
    const data = snapshot.val();
    let userCall = null;
    
    if (data) {
      // Find call where user is participant
      Object.keys(data).forEach(callId => {
        const call = data[callId];
        if (call.participants && call.participants[userId]) {
          userCall = {
            callId,
            callType: call.callType,
            startedAt: call.startedAt,
            participants: Object.keys(call.participants)
          };
        }
      });
    }
    
    callback(userCall);
  });
};

/**
 * Получить все активные звонки пользователя
 * @param {Function} callback - Функция обратного вызова с массивом активных звонков
 * @returns {Function} Функция отписки
 */
export const subscribeToActiveCalls = (callback) => {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    callback([]);
    return () => {};
  }
  
  const callsPath = 'activeCalls';
  const callsRef = ref(rtdb, callsPath);
  
  return onValue(callsRef, (snapshot) => {
    const activeCalls = [];
    const data = snapshot.val();
    
    if (data) {
      Object.keys(data).forEach(callId => {
        const call = data[callId];
        // Check if current user is in this call
        if (call.participants && call.participants[currentUser.uid]) {
          activeCalls.push({
            callId,
            callType: call.callType,
            startedAt: call.startedAt,
            participants: call.participants
          });
        }
      });
    }
    
    callback(activeCalls);
  });
};
