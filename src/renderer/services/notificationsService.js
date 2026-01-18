import { rtdb, auth } from '../firebase';
import { ref, push, set, remove, onValue, onDisconnect, query, orderByChild, limitToLast } from 'firebase/database';

/**
 * Отправить уведомление пользователю
 * @param {string} recipientId - ID получателя
 * @param {Object} notification - Объект уведомления
 * @param {string} notification.type - Тип ('message', 'call', 'friendRequest', 'mention')
 * @param {string} notification.title - Заголовок
 * @param {string} notification.body - Текст
 * @param {Object} notification.data - Дополнительные данные
 */
export const sendNotification = async (recipientId, notification) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  const notificationsPath = `notifications/${recipientId}`;
  const notificationsRef = ref(rtdb, notificationsPath);
  
  try {
    const newNotificationRef = push(notificationsRef);
    
    await set(newNotificationRef, {
      type: notification.type,
      title: notification.title,
      body: notification.body,
      data: notification.data || {},
      from: currentUser.uid,
      fromName: currentUser.displayName || 'User',
      timestamp: Date.now(),
      read: false
    });
    
    console.log('Notification sent to:', recipientId);
  } catch (err) {
    console.warn('Could not send notification:', err);
  }
};

/**
 * Пометить уведомление как прочитанное
 * @param {string} notificationId - ID уведомления
 */
export const markNotificationAsRead = async (notificationId) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  const notificationPath = `notifications/${currentUser.uid}/${notificationId}/read`;
  const notificationRef = ref(rtdb, notificationPath);
  
  try {
    await set(notificationRef, true);
  } catch (err) {
    console.warn('Could not mark notification as read:', err);
  }
};

/**
 * Удалить уведомление
 * @param {string} notificationId - ID уведомления
 */
export const deleteNotification = async (notificationId) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  const notificationPath = `notifications/${currentUser.uid}/${notificationId}`;
  const notificationRef = ref(rtdb, notificationPath);
  
  try {
    await remove(notificationRef);
  } catch (err) {
    console.warn('Could not delete notification:', err);
  }
};

/**
 * Подписаться на уведомления текущего пользователя
 * @param {Function} callback - Функция обратного вызова с массивом уведомлений
 * @returns {Function} Функция отписки
 */
export const subscribeToNotifications = (callback) => {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    callback([]);
    return () => {};
  }
  
  const notificationsPath = `notifications/${currentUser.uid}`;
  const notificationsRef = ref(rtdb, notificationsPath);
  
  // Get last 50 notifications
  const notificationsQuery = query(
    notificationsRef,
    orderByChild('timestamp'),
    limitToLast(50)
  );
  
  return onValue(notificationsQuery, (snapshot) => {
    const notifications = [];
    const data = snapshot.val();
    
    if (data) {
      Object.keys(data).forEach(notificationId => {
        const notification = data[notificationId];
        notifications.push({
          id: notificationId,
          ...notification
        });
      });
      
      // Sort by timestamp descending (newest first)
      notifications.sort((a, b) => b.timestamp - a.timestamp);
    }
    
    callback(notifications);
  });
};

/**
 * Получить количество непрочитанных уведомлений
 * @param {Function} callback - Функция обратного вызова с количеством
 * @returns {Function} Функция отписки
 */
export const subscribeToUnreadCount = (callback) => {
  return subscribeToNotifications((notifications) => {
    const unreadCount = notifications.filter(n => !n.read).length;
    callback(unreadCount);
  });
};

/**
 * Очистить все уведомления
 */
export const clearAllNotifications = async () => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  const notificationsPath = `notifications/${currentUser.uid}`;
  const notificationsRef = ref(rtdb, notificationsPath);
  
  try {
    await remove(notificationsRef);
    console.log('All notifications cleared');
  } catch (err) {
    console.warn('Could not clear notifications:', err);
  }
};
