import { db, auth } from '../firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore';
import { updateRecentContact } from './recentContactsService';

// Создать исходящий звонок
export const startCall = async (callerId, callerName, receiverId, receiverName, callerPhotoURL = null) => {
  const callId = [callerId, receiverId].sort().join('_');
  
  await setDoc(doc(db, 'calls', callId), {
    callerId,
    callerName,
    callerPhotoURL,
    receiverId,
    receiverName,
    status: 'ringing', // ringing, accepted, declined, ended
    createdAt: serverTimestamp()
  });
  
  // Обновить недавние контакты
  await updateRecentContact(receiverId, receiverName, callerPhotoURL);
  
  return callId;
};

// Принять звонок
export const acceptCall = async (callId) => {
  await setDoc(doc(db, 'calls', callId), {
    status: 'accepted'
  }, { merge: true });
};

// Отклонить звонок
export const declineCall = async (callId) => {
  await deleteDoc(doc(db, 'calls', callId));
};

// Завершить звонок
export const endCall = async (callId) => {
  await deleteDoc(doc(db, 'calls', callId));
};

// Подписаться на входящие звонки
export const subscribeToIncomingCalls = (callback) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return () => {};
  
  const q = query(
    collection(db, 'calls'),
    where('receiverId', '==', currentUser.uid),
    where('status', '==', 'ringing')
  );
  
  return onSnapshot(q, (snapshot) => {
    const calls = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(calls.length > 0 ? calls[0] : null);
  });
};

// Подписаться на статус исходящего звонка
export const subscribeToCallStatus = (callId, callback) => {
  return onSnapshot(doc(db, 'calls', callId), (snapshot) => {
    if (snapshot.exists()) {
      callback({ id: snapshot.id, ...snapshot.data() });
    } else {
      callback(null);
    }
  });
};
