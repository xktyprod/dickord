import { db, auth } from '../firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot,
  query,
  where,
  serverTimestamp,
  arrayUnion,
  getDoc,
  getDocs,
  updateDoc
} from 'firebase/firestore';

// Создать сервер
export const createServer = async (name) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;
  
  const serverId = `server_${Date.now()}`;
  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  
  const serverData = {
    id: serverId,
    name: name.trim(),
    icon: name.trim()[0].toUpperCase(),
    ownerId: currentUser.uid,
    members: [currentUser.uid],
    inviteCode: inviteCode,
    createdAt: serverTimestamp()
  };
  
  await setDoc(doc(db, 'servers', serverId), serverData);
  
  // Создать дефолтные каналы с фиксированными ID
  await setDoc(doc(db, 'channels', `${serverId}_general`), {
    id: `${serverId}_general`,
    serverId: serverId,
    name: 'general',
    type: 'text',
    createdAt: serverTimestamp()
  });
  
  await setDoc(doc(db, 'channels', `${serverId}_voice`), {
    id: `${serverId}_voice`,
    serverId: serverId,
    name: 'Голосовой',
    type: 'voice',
    createdAt: serverTimestamp()
  });
  
  return { ...serverData, inviteCode };
};

// Удалить сервер
export const deleteServer = async (serverId) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  // Проверить что пользователь владелец
  const serverRef = doc(db, 'servers', serverId);
  const serverSnap = await getDoc(serverRef);
  
  if (!serverSnap.exists()) return;
  
  const serverData = serverSnap.data();
  if (serverData.ownerId !== currentUser.uid) {
    throw new Error('Только владелец может удалить сервер');
  }
  
  // Удалить каналы сервера
  const channelsQuery = query(
    collection(db, 'channels'),
    where('serverId', '==', serverId)
  );
  const channelsSnap = await getDocs(channelsQuery);
  for (const channelDoc of channelsSnap.docs) {
    await deleteDoc(channelDoc.ref);
  }
  
  // Удалить сервер
  await deleteDoc(serverRef);
};

// Покинуть сервер
export const leaveServer = async (serverId) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  const serverRef = doc(db, 'servers', serverId);
  const serverSnap = await getDoc(serverRef);
  
  if (!serverSnap.exists()) return;
  
  const serverData = serverSnap.data();
  
  // Владелец не может покинуть сервер
  if (serverData.ownerId === currentUser.uid) {
    throw new Error('Владелец не может покинуть сервер. Удалите его.');
  }
  
  // Удалить из members
  const newMembers = serverData.members.filter(m => m !== currentUser.uid);
  await updateDoc(serverRef, { members: newMembers });
};

// Присоединиться к серверу по инвайт-коду
export const joinServerByInvite = async (inviteCode) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;
  
  const code = inviteCode.trim().toUpperCase();
  
  // Найти сервер по инвайт-коду
  const q = query(
    collection(db, 'servers'),
    where('inviteCode', '==', code)
  );
  
  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    throw new Error('Сервер не найден');
  }
  
  const serverDoc = snapshot.docs[0];
  const serverData = serverDoc.data();
  
  // Проверить не состоит ли уже
  if (serverData.members?.includes(currentUser.uid)) {
    throw new Error('Вы уже на этом сервере');
  }
  
  // Добавить в members
  await updateDoc(doc(db, 'servers', serverDoc.id), {
    members: arrayUnion(currentUser.uid)
  });
  
  return serverData;
};

// Получить инвайт-код сервера
export const getServerInviteCode = async (serverId) => {
  const serverRef = doc(db, 'servers', serverId);
  const serverSnap = await getDoc(serverRef);
  
  if (!serverSnap.exists()) return null;
  
  return serverSnap.data().inviteCode;
};

// Подписка на серверы пользователя
export const subscribeToServers = (callback) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return () => {};
  
  const q = query(
    collection(db, 'servers'),
    where('members', 'array-contains', currentUser.uid)
  );
  
  return onSnapshot(q, (snapshot) => {
    const servers = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(servers);
  });
};

// Создать канал
export const createChannel = async (serverId, name, type = 'text') => {
  const channelId = `${serverId}_channel_${Date.now()}`;
  const channelData = {
    id: channelId,
    serverId,
    name: name.trim(),
    type,
    createdAt: serverTimestamp()
  };
  
  await setDoc(doc(db, 'channels', channelId), channelData);
  return channelData;
};

// Удалить канал
export const deleteChannel = async (channelId) => {
  await deleteDoc(doc(db, 'channels', channelId));
};

// Переименовать канал
export const renameChannel = async (channelId, newName) => {
  await updateDoc(doc(db, 'channels', channelId), {
    name: newName.trim()
  });
};

// Подписка на каналы сервера
export const subscribeToChannels = (serverId, callback) => {
  const q = query(
    collection(db, 'channels'),
    where('serverId', '==', serverId)
  );
  
  return onSnapshot(q, (snapshot) => {
    const channels = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(channels);
  });
};
