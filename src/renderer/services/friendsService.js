import { db, auth, rtdb } from '../firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  onSnapshot,
  deleteDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';

// Cache to prevent duplicate profile updates
const profileUpdateCache = new Map();
const PROFILE_UPDATE_INTERVAL = 60000; // 1 minute minimum between updates

// Создать/обновить профиль пользователя в Firestore
export const createUserProfile = async (user) => {
  const now = Date.now();
  const lastUpdate = profileUpdateCache.get(user.uid);
  
  // Skip if updated recently (within 1 minute)
  if (lastUpdate && now - lastUpdate < PROFILE_UPDATE_INTERVAL) {
    console.log('Skipping profile update - too recent');
    return;
  }
  
  profileUpdateCache.set(user.uid, now);
  
  const userRef = doc(db, 'users', user.uid);
  
  // Check if user already has a photoURL in Firestore
  const existingDoc = await getDoc(userRef);
  const existingPhotoURL = existingDoc.exists() ? existingDoc.data().photoURL : null;
  
  console.log('createUserProfile - existingPhotoURL:', existingPhotoURL);
  console.log('createUserProfile - user.photoURL:', user.photoURL);
  
  // Only update photoURL if user doesn't have one saved already
  const updateData = { 
    uid: user.uid,
    displayName: user.displayName || 'User',
    email: user.email,
    status: 'online',
    lastSeen: serverTimestamp()
  };
  
  // Don't overwrite existing photoURL with null
  if (!existingPhotoURL && user.photoURL) {
    updateData.photoURL = user.photoURL;
    console.log('Adding photoURL to updateData');
  } else {
    console.log('NOT adding photoURL - existingPhotoURL exists or user.photoURL is null');
  }
  
  console.log('updateData:', updateData);
  
  await setDoc(userRef, updateData, { merge: true });
};

// Обновить аватар пользователя
export const updateUserAvatar = async (avatarUrl) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  const userRef = doc(db, 'users', currentUser.uid);
  
  console.log('Saving avatar to Firestore:', avatarUrl);
  
  await setDoc(userRef, { 
    photoURL: avatarUrl
  }, { merge: true });
  
  console.log('Avatar saved successfully');
};

// Удалить аватар пользователя (сбросить на null)
export const removeUserAvatar = async () => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  const userRef = doc(db, 'users', currentUser.uid);
  
  console.log('Removing avatar from Firestore');
  
  await setDoc(userRef, { 
    photoURL: null
  }, { merge: true });
  
  console.log('Avatar removed successfully');
};

// Получить профиль пользователя из Firestore
export const getUserProfile = async (oderId) => {
  try {
    const userRef = doc(db, 'users', oderId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      return userSnap.data();
    }
    return null;
  } catch (err) {
    console.warn('Could not get user profile:', err);
    return null;
  }
};

// Поиск пользователя по имени
export const searchUsers = async (searchName) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return [];
  
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('displayName', '==', searchName));
  const snapshot = await getDocs(q);
  
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(user => user.uid !== currentUser.uid);
};

// Отправить запрос в друзья
export const sendFriendRequest = async (toUserId) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  const requestRef = doc(db, 'friendRequests', `${currentUser.uid}_${toUserId}`);
  await setDoc(requestRef, {
    from: currentUser.uid,
    fromName: currentUser.displayName,
    to: toUserId,
    status: 'pending',
    createdAt: serverTimestamp()
  });
};

// Принять запрос в друзья
export const acceptFriendRequest = async (requestId, fromUserId) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  // Добавить в друзья обоим пользователям
  const friendship1 = doc(db, 'friends', `${currentUser.uid}_${fromUserId}`);
  const friendship2 = doc(db, 'friends', `${fromUserId}_${currentUser.uid}`);
  
  await setDoc(friendship1, {
    oderId: currentUser.uid,
    friendId: fromUserId,
    createdAt: serverTimestamp()
  });
  
  await setDoc(friendship2, {
    oderId: fromUserId,
    friendId: currentUser.uid,
    createdAt: serverTimestamp()
  });
  
  // Удалить запрос
  await deleteDoc(doc(db, 'friendRequests', requestId));
};

// Отклонить запрос
export const declineFriendRequest = async (requestId) => {
  await deleteDoc(doc(db, 'friendRequests', requestId));
};

// Удалить из друзей
export const removeFriend = async (friendId) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  await deleteDoc(doc(db, 'friends', `${currentUser.uid}_${friendId}`));
  await deleteDoc(doc(db, 'friends', `${friendId}_${currentUser.uid}`));
};

// Cache for user data to reduce reads
const userDataCache = new Map();
const USER_CACHE_TTL = 30000; // 30 seconds
const userProfileListeners = new Map(); // Track active listeners per user

const getCachedUserData = async (userId) => {
  const cached = userDataCache.get(userId);
  if (cached && Date.now() - cached.timestamp < USER_CACHE_TTL) {
    return cached.data;
  }
  
  const userDoc = await getDoc(doc(db, 'users', userId));
  if (userDoc.exists()) {
    const data = userDoc.data();
    userDataCache.set(userId, { data, timestamp: Date.now() });
    return data;
  }
  return null;
};

// Invalidate cache for a specific user (when their profile updates)
const invalidateUserCache = (userId) => {
  userDataCache.delete(userId);
};

// Подписка на входящие запросы в друзья
export const subscribeToFriendRequests = (callback) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return () => {};
  
  const q = query(
    collection(db, 'friendRequests'),
    where('to', '==', currentUser.uid),
    where('status', '==', 'pending')
  );
  
  return onSnapshot(q, async (snapshot) => {
    const requests = [];
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const userData = await getCachedUserData(data.from);
      requests.push({
        id: docSnap.id,
        ...data,
        fromUser: userData
      });
    }
    callback(requests);
  });
};

// Подписка на список друзей
export const subscribeToFriends = (callback) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return () => {};
  
  const q = query(
    collection(db, 'friends'),
    where('oderId', '==', currentUser.uid)
  );
  
  // Track user profile and presence listeners for cleanup
  const profileUnsubscribers = new Map();
  const presenceUnsubscribers = new Map();
  
  // Store friends data that will be updated by profile and presence listeners
  let friendsData = [];
  
  const updateFriend = (friendId, updates) => {
    // Find and update the friend in the array
    const friendIndex = friendsData.findIndex(f => f.id === friendId);
    if (friendIndex !== -1) {
      friendsData[friendIndex] = {
        ...friendsData[friendIndex],
        ...updates
      };
      // Trigger callback with updated array
      callback([...friendsData]);
    }
  };
  
  const unsubscribe = onSnapshot(q, async (snapshot) => {
    const friends = [];
    const friendIds = new Set();
    
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const friendId = data.friendId;
      friendIds.add(friendId);
      
      const userData = await getCachedUserData(friendId);
      if (userData) {
        friends.push({
          id: friendId,
          name: userData.displayName,
          status: userData.status || 'offline',
          activity: userData.activity || null,
          photoURL: userData.photoURL
        });
        
        // Subscribe to this user's profile changes if not already subscribed
        if (!profileUnsubscribers.has(friendId)) {
          const userRef = doc(db, 'users', friendId);
          const profileUnsub = onSnapshot(userRef, (userDoc) => {
            if (userDoc.exists()) {
              // Invalidate cache
              invalidateUserCache(friendId);
              console.log(`Profile updated for ${friendId}, updating friends list`);
              
              // Update the friend in the stored array
              const updatedData = userDoc.data();
              updateFriend(friendId, {
                name: updatedData.displayName,
                photoURL: updatedData.photoURL,
                activity: updatedData.activity || null
              });
            }
          });
          profileUnsubscribers.set(friendId, profileUnsub);
        }
        
        // Subscribe to this user's presence status if not already subscribed
        if (!presenceUnsubscribers.has(friendId)) {
          const presenceRef = ref(rtdb, `presence/${friendId}`);
          const presenceUnsub = onValue(presenceRef, (snapshot) => {
            const presenceData = snapshot.val();
            const status = presenceData?.status || 'offline';
            console.log(`Presence updated for ${friendId}: ${status}`);
            
            // Update the friend's status
            updateFriend(friendId, { status });
          });
          presenceUnsubscribers.set(friendId, presenceUnsub);
        }
      }
    }
    
    // Clean up listeners for users who are no longer friends
    for (const [userId, unsub] of profileUnsubscribers) {
      if (!friendIds.has(userId)) {
        unsub();
        profileUnsubscribers.delete(userId);
      }
    }
    
    for (const [userId, unsub] of presenceUnsubscribers) {
      if (!friendIds.has(userId)) {
        unsub();
        presenceUnsubscribers.delete(userId);
      }
    }
    
    // Update stored friends data
    friendsData = friends;
    callback(friends);
  });
  
  // Return cleanup function that also cleans up profile and presence listeners
  return () => {
    unsubscribe();
    profileUnsubscribers.forEach(unsub => unsub());
    profileUnsubscribers.clear();
    presenceUnsubscribers.forEach(unsub => unsub());
    presenceUnsubscribers.clear();
  };
};

// Throttle status updates
let lastStatusUpdate = 0;
const STATUS_UPDATE_INTERVAL = 30000; // 30 seconds minimum

// Обновить статус пользователя
export const updateUserStatus = async (status) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  const now = Date.now();
  if (now - lastStatusUpdate < STATUS_UPDATE_INTERVAL) {
    console.log('Skipping status update - too recent');
    return;
  }
  lastStatusUpdate = now;
  
  await setDoc(doc(db, 'users', currentUser.uid), {
    status,
    lastSeen: serverTimestamp()
  }, { merge: true });
};
