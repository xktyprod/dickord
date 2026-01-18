import { db, auth } from '../firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  or,
  updateDoc,
  writeBatch
} from 'firebase/firestore';
import { updateRecentContact } from './recentContactsService';

// Получить ID чата между двумя пользователями (сортируем чтобы был одинаковый для обоих)
const getDMChatId = (oderId1, oderId2) => {
  return [oderId1, oderId2].sort().join('_');
};

// Отправить личное сообщение
export const sendDM = async (recipientId, content, recipientName = null) => {
  const currentUser = auth.currentUser;
  if (!currentUser || !content.trim()) return null;
  
  const chatId = getDMChatId(currentUser.uid, recipientId);
  const messageId = `dm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  console.log('Sending DM to:', recipientId, 'chatId:', chatId);
  
  const messageData = {
    id: messageId,
    chatId,
    senderId: currentUser.uid,
    senderName: currentUser.displayName || 'User',
    recipientId,
    content: content.trim(),
    createdAt: serverTimestamp(),
    read: false
  };
  
  try {
    await setDoc(doc(db, 'directMessages', messageId), messageData);
    console.log('DM sent successfully');
  } catch (err) {
    console.error('Failed to send DM:', err);
    throw err;
  }
  
  // Обновить недавние контакты
  if (recipientName) {
    // Попробовать получить аватарку из профиля
    try {
      const userDoc = await getDoc(doc(db, 'users', recipientId));
      if (userDoc.exists()) {
        await updateRecentContact(recipientId, recipientName, userDoc.data().photoURL);
      } else {
        await updateRecentContact(recipientId, recipientName);
      }
    } catch (e) {
      await updateRecentContact(recipientId, recipientName);
    }
  } else {
    // Попробовать получить имя из профиля
    try {
      const userDoc = await getDoc(doc(db, 'users', recipientId));
      if (userDoc.exists()) {
        await updateRecentContact(recipientId, userDoc.data().displayName || 'User', userDoc.data().photoURL);
      }
    } catch (e) {
      // Игнорируем ошибку
    }
  }
  
  return messageData;
};

// Подписка на личные сообщения с конкретным пользователем
export const subscribeToDMs = (friendId, callback) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return () => {};
  
  const chatId = getDMChatId(currentUser.uid, friendId);
  console.log('Subscribing to DMs with chatId:', chatId);
  
  const q = query(
    collection(db, 'directMessages'),
    where('chatId', '==', chatId),
    orderBy('createdAt', 'asc')
  );
  
  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        isMe: data.senderId === currentUser.uid,
        author: data.senderName,
        time: data.createdAt?.toDate?.()?.toLocaleTimeString('ru-RU', { 
          hour: '2-digit', 
          minute: '2-digit' 
        }) || ''
      };
    });
    console.log('DM messages received:', messages.length);
    callback(messages);
  }, (error) => {
    console.error('DM subscription error:', error);
    // If index is missing, Firestore will show a link in the error
    callback([]);
  });
};

// Удалить сообщение
export const deleteDM = async (messageId) => {
  await deleteDoc(doc(db, 'directMessages', messageId));
};

// Подписка на непрочитанные сообщения (для индикатора)
export const subscribeToUnreadDMs = (callback) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return () => {};
  
  const q = query(
    collection(db, 'directMessages'),
    where('recipientId', '==', currentUser.uid),
    where('read', '==', false)
  );
  
  return onSnapshot(q, (snapshot) => {
    // Группируем по отправителю
    const unreadBySender = {};
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (!unreadBySender[data.senderId]) {
        unreadBySender[data.senderId] = 0;
      }
      unreadBySender[data.senderId]++;
    });
    callback(unreadBySender);
  }, (error) => {
    console.error('Unread DMs subscription error:', error);
    callback({});
  });
};

// Пометить сообщения как прочитанные
export const markDMsAsRead = async (senderId) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  const chatId = getDMChatId(currentUser.uid, senderId);
  
  const q = query(
    collection(db, 'directMessages'),
    where('chatId', '==', chatId),
    where('recipientId', '==', currentUser.uid),
    where('read', '==', false)
  );
  
  return new Promise((resolve) => {
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      unsubscribe();
      
      if (snapshot.empty) {
        resolve();
        return;
      }
      
      const batch = writeBatch(db);
      snapshot.docs.forEach(doc => {
        batch.update(doc.ref, { read: true });
      });
      
      try {
        await batch.commit();
      } catch (err) {
        console.error('Failed to mark DMs as read:', err);
      }
      resolve();
    });
  });
};
