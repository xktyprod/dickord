import { rtdb, auth } from '../firebase';
import { ref, set, remove, onValue, onDisconnect, serverTimestamp } from 'firebase/database';

/**
 * Установить активность пользователя
 * @param {Object} activity - Объект активности
 * @param {string} activity.type - Тип активности ('voice', 'text', 'idle', 'game', 'music')
 * @param {string} activity.details - Детали активности
 * @param {string} activity.serverId - ID сервера (опционально)
 * @param {string} activity.channelId - ID канала (опционально)
 */
export const setUserActivity = async (activity) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  const activityPath = `userActivity/${currentUser.uid}`;
  const activityRef = ref(rtdb, activityPath);
  
  try {
    await set(activityRef, {
      type: activity.type,
      details: activity.details || '',
      serverId: activity.serverId || null,
      channelId: activity.channelId || null,
      timestamp: serverTimestamp()
    });
    
    // Auto-remove on disconnect
    await onDisconnect(activityRef).remove();
    
    console.log('User activity set:', activity.type);
  } catch (err) {
    console.warn('Could not set user activity:', err);
  }
};

/**
 * Очистить активность пользователя
 */
export const clearUserActivity = async () => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  const activityPath = `userActivity/${currentUser.uid}`;
  const activityRef = ref(rtdb, activityPath);
  
  try {
    await onDisconnect(activityRef).cancel();
    await remove(activityRef);
    
    console.log('User activity cleared');
  } catch (err) {
    console.warn('Could not clear user activity:', err);
  }
};

/**
 * Подписаться на активность пользователя
 * @param {string} userId - ID пользователя
 * @param {Function} callback - Функция обратного вызова с активностью
 * @returns {Function} Функция отписки
 */
export const subscribeToUserActivity = (userId, callback) => {
  const activityPath = `userActivity/${userId}`;
  const activityRef = ref(rtdb, activityPath);
  
  return onValue(activityRef, (snapshot) => {
    const activity = snapshot.val();
    callback(activity);
  });
};

/**
 * Подписаться на активность нескольких пользователей
 * @param {string[]} userIds - Массив ID пользователей
 * @param {Function} callback - Функция обратного вызова с объектом {userId: activity}
 * @returns {Function} Функция отписки
 */
export const subscribeToMultipleUserActivities = (userIds, callback) => {
  const unsubscribers = [];
  const activities = {};
  
  userIds.forEach(userId => {
    const unsub = subscribeToUserActivity(userId, (activity) => {
      activities[userId] = activity;
      callback({ ...activities });
    });
    unsubscribers.push(unsub);
  });
  
  // Return combined unsubscribe function
  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
};

/**
 * Форматировать активность для отображения
 * @param {Object} activity - Объект активности
 * @returns {string} Отформатированная строка активности
 */
export const formatActivity = (activity) => {
  if (!activity) return '';
  
  switch (activity.type) {
    case 'voice':
      return `В голосовом канале`;
    case 'text':
      return `В текстовом канале`;
    case 'game':
      return `Играет в ${activity.details}`;
    case 'music':
      return `Слушает ${activity.details}`;
    case 'idle':
      return 'Неактивен';
    default:
      return activity.details || '';
  }
};
