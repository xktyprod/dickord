import { db, auth } from '../firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp
} from 'firebase/firestore';

// Throttle recent contact updates
const recentContactCache = new Map();
const RECENT_CONTACT_INTERVAL = 60000; // 1 minute minimum between updates for same contact

// Добавить/обновить недавний контакт
export const updateRecentContact = async (contactId, contactName, contactAvatar = null) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  const now = Date.now();
  const cacheKey = `${currentUser.uid}_${contactId}`;
  const lastUpdate = recentContactCache.get(cacheKey);
  
  // Skip if updated recently (but always update if we have a new avatar)
  if (lastUpdate && now - lastUpdate < RECENT_CONTACT_INTERVAL && !contactAvatar) {
    return;
  }
  
  recentContactCache.set(cacheKey, now);
  
  const contactRef = doc(db, 'users', currentUser.uid, 'recentContacts', contactId);
  
  const updateData = {
    oderId: contactId,
    name: contactName,
    lastContact: serverTimestamp()
  };
  
  // Only update avatar if provided
  if (contactAvatar) {
    updateData.avatar = contactAvatar;
  }
  
  await setDoc(contactRef, updateData, { merge: true });
};

// Подписаться на недавние контакты
export const subscribeToRecentContacts = (callback) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return () => {};
  
  const q = query(
    collection(db, 'users', currentUser.uid, 'recentContacts'),
    orderBy('lastContact', 'desc'),
    limit(10)
  );
  
  // Track user profile listeners for cleanup
  const profileUnsubscribers = new Map();
  
  // Store contacts data that will be updated by profile listeners
  let contactsData = [];
  
  const updateContact = (contactId, photoURL) => {
    // Find and update the contact in the array
    const contactIndex = contactsData.findIndex(c => c.oderId === contactId || c.id === contactId);
    if (contactIndex !== -1) {
      contactsData[contactIndex] = {
        ...contactsData[contactIndex],
        avatar: photoURL
      };
      // Trigger callback with updated array
      callback([...contactsData]);
      
      // Also update in Firestore for persistence
      setDoc(doc(db, 'users', currentUser.uid, 'recentContacts', contactId), {
        avatar: photoURL
      }, { merge: true }).catch(err => console.error('Failed to update contact avatar:', err));
    }
  };
  
  const unsubscribe = onSnapshot(q, async (snapshot) => {
    const contacts = [];
    const contactIds = new Set();
    
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const contactId = data.oderId;
      contactIds.add(contactId);
      
      let avatar = data.avatar;
      
      // Если нет аватарки, попробовать загрузить из профиля пользователя
      if (!avatar && contactId) {
        try {
          const userDoc = await getDoc(doc(db, 'users', contactId));
          if (userDoc.exists() && userDoc.data().photoURL) {
            avatar = userDoc.data().photoURL;
            // Обновить запись с аватаркой
            await setDoc(doc(db, 'users', currentUser.uid, 'recentContacts', contactId), {
              avatar: avatar
            }, { merge: true });
          }
        } catch (e) {
          console.error('Failed to load avatar for contact:', e);
        }
      }
      
      contacts.push({
        id: docSnap.id,
        ...data,
        avatar: avatar
      });
      
      // Subscribe to this user's profile changes if not already subscribed
      if (contactId && !profileUnsubscribers.has(contactId)) {
        const userRef = doc(db, 'users', contactId);
        const profileUnsub = onSnapshot(userRef, (userDoc) => {
          if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.photoURL) {
              console.log(`Contact ${contactId} avatar updated:`, userData.photoURL);
              updateContact(contactId, userData.photoURL);
            }
          }
        });
        profileUnsubscribers.set(contactId, profileUnsub);
      }
    }
    
    // Clean up listeners for contacts no longer in recent list
    for (const [userId, unsub] of profileUnsubscribers) {
      if (!contactIds.has(userId)) {
        unsub();
        profileUnsubscribers.delete(userId);
      }
    }
    
    // Update stored contacts data
    contactsData = contacts;
    callback(contacts);
  });
  
  // Return cleanup function that also cleans up profile listeners
  return () => {
    unsubscribe();
    profileUnsubscribers.forEach(unsub => unsub());
    profileUnsubscribers.clear();
  };
};
