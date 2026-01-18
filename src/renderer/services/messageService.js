import { db, auth } from '../firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  limit
} from 'firebase/firestore';

// Отправить сообщение
export const sendMessage = async (serverId, channelId, content) => {
  const currentUser = auth.currentUser;
  if (!currentUser || !content.trim()) return null;
  
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const messageData = {
    id: messageId,
    serverId,
    channelId,
    content: content.trim(),
    authorId: currentUser.uid,
    authorName: currentUser.displayName || 'User',
    authorColor: '#5b8def',
    reactions: [],
    createdAt: serverTimestamp(),
    edited: false
  };
  
  await setDoc(doc(db, 'messages', messageId), messageData);
  return messageData;
};

// Редактировать сообщение
export const editMessage = async (messageId, newContent) => {
  await updateDoc(doc(db, 'messages', messageId), {
    content: newContent.trim(),
    edited: true,
    editedAt: serverTimestamp()
  });
};

// Удалить сообщение
export const deleteMessage = async (messageId) => {
  await deleteDoc(doc(db, 'messages', messageId));
};

// Добавить реакцию
export const addReaction = async (messageId, emoji, currentReactions) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  const reactions = [...(currentReactions || [])];
  const existing = reactions.find(r => r.emoji === emoji);
  
  if (existing) {
    existing.count += 1;
    existing.users = [...(existing.users || []), currentUser.uid];
  } else {
    reactions.push({ emoji, count: 1, users: [currentUser.uid] });
  }
  
  await updateDoc(doc(db, 'messages', messageId), { reactions });
};

// Подписка на сообщения канала
export const subscribeToMessages = (serverId, channelId, callback) => {
  const q = query(
    collection(db, 'messages'),
    where('serverId', '==', serverId),
    where('channelId', '==', channelId),
    orderBy('createdAt', 'asc'),
    limit(100)
  );
  
  // Track author profile listeners
  const authorListeners = new Map();
  let messagesData = [];
  
  const updateMessageAuthor = (authorId, photoURL) => {
    // Update all messages from this author
    let updated = false;
    messagesData = messagesData.map(msg => {
      if (msg.authorId === authorId && msg.authorAvatar !== photoURL) {
        updated = true;
        return { ...msg, authorAvatar: photoURL };
      }
      return msg;
    });
    
    if (updated) {
      callback([...messagesData]);
    }
  };
  
  const unsubscribe = onSnapshot(q, async (snapshot) => {
    const messages = [];
    const authorIds = new Set();
    
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      authorIds.add(data.authorId);
      
      // Try to get author avatar from cache or Firestore
      let authorAvatar = null;
      try {
        const { getUserProfile } = await import('./friendsService');
        const profile = await getUserProfile(data.authorId);
        authorAvatar = profile?.photoURL || null;
      } catch (e) {
        console.error('Failed to load author avatar:', e);
      }
      
      messages.push({
        id: docSnap.id,
        ...data,
        authorAvatar: authorAvatar,
        time: data.createdAt?.toDate?.()?.toLocaleTimeString('ru-RU', { 
          hour: '2-digit', 
          minute: '2-digit' 
        }) || ''
      });
      
      // Subscribe to author profile changes if not already subscribed
      if (!authorListeners.has(data.authorId)) {
        const userRef = doc(db, 'users', data.authorId);
        const authorUnsub = onSnapshot(userRef, (userDoc) => {
          if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.photoURL) {
              console.log(`Author ${data.authorId} avatar updated in messages:`, userData.photoURL);
              updateMessageAuthor(data.authorId, userData.photoURL);
            }
          }
        });
        authorListeners.set(data.authorId, authorUnsub);
      }
    }
    
    // Clean up listeners for authors no longer in messages
    for (const [authorId, unsub] of authorListeners) {
      if (!authorIds.has(authorId)) {
        unsub();
        authorListeners.delete(authorId);
      }
    }
    
    messagesData = messages;
    callback(messages);
  });
  
  // Return cleanup function
  return () => {
    unsubscribe();
    authorListeners.forEach(unsub => unsub());
    authorListeners.clear();
  };
};
