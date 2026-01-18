import { db, auth, rtdb } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, onDisconnect, set, onValue, serverTimestamp as rtdbServerTimestamp } from 'firebase/database';

/**
 * Initialize presence system for the current user
 * Sets up automatic offline detection using Firebase onDisconnect
 */
export const initializePresence = async () => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  try {
    const presenceRef = ref(rtdb, `presence/${currentUser.uid}`);

    // Set up presence data
    const presenceData = {
      status: 'online',
      lastSeen: rtdbServerTimestamp(),
      uid: currentUser.uid
    };

    // Set current status to online
    await set(presenceRef, presenceData);

    // Set up automatic offline on disconnect
    const disconnectRef = onDisconnect(presenceRef);
    await disconnectRef.set({
      status: 'offline',
      lastSeen: rtdbServerTimestamp(),
      uid: currentUser.uid
    });

    console.log('Presence system initialized');

    // Also update Firestore user profile
    const userRef = doc(db, 'users', currentUser.uid);
    await setDoc(userRef, {
      status: 'online',
      lastSeen: serverTimestamp()
    }, { merge: true });

  } catch (err) {
    console.error('Failed to initialize presence:', err);
  }
};

/**
 * Update user status manually
 */
export const updatePresenceStatus = async (status) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  try {
    const userPresenceRef = ref(rtdb, `presence/${currentUser.uid}`);

    await set(userPresenceRef, {
      status: status,
      lastSeen: rtdbServerTimestamp(),
      uid: currentUser.uid
    });

    // Also update Firestore
    const userRef = doc(db, 'users', currentUser.uid);
    await setDoc(userRef, {
      status: status,
      lastSeen: serverTimestamp()
    }, { merge: true });

    console.log(`Presence status updated to: ${status}`);
  } catch (err) {
    console.error('Failed to update presence status:', err);
  }
};

/**
 * Subscribe to a user's presence status
 */
export const subscribeToUserPresence = (userId, callback) => {
  try {
    const userPresenceRef = ref(rtdb, `presence/${userId}`);

    return onValue(userPresenceRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        callback(data.status || 'offline', data.lastSeen);
      } else {
        callback('offline', null);
      }
    });
  } catch (err) {
    console.error('Failed to subscribe to user presence:', err);
    return () => {};
  }
};

/**
 * Cleanup presence system
 * Sets status to offline
 */
export const cleanupPresence = async () => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  try {
    // Set status to offline in Realtime Database
    const userPresenceRef = ref(rtdb, `presence/${currentUser.uid}`);
    
    await set(userPresenceRef, {
      status: 'offline',
      lastSeen: rtdbServerTimestamp(),
      uid: currentUser.uid
    });

    // Also update Firestore
    const userRef = doc(db, 'users', currentUser.uid);
    await setDoc(userRef, {
      status: 'offline',
      lastSeen: serverTimestamp()
    }, { merge: true });

    console.log('Presence cleaned up');
  } catch (err) {
    console.error('Failed to cleanup presence:', err);
  }
};

/**
 * Heartbeat to keep presence alive
 * Call this periodically (e.g., every 30 seconds)
 */
export const sendPresenceHeartbeat = async () => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  try {
    const userPresenceRef = ref(rtdb, `presence/${currentUser.uid}`);

    await set(userPresenceRef, {
      status: 'online',
      lastSeen: rtdbServerTimestamp(),
      uid: currentUser.uid
    });

    // Re-setup onDisconnect in case connection was lost
    const disconnectRef = onDisconnect(userPresenceRef);
    await disconnectRef.set({
      status: 'offline',
      lastSeen: rtdbServerTimestamp(),
      uid: currentUser.uid
    });
  } catch (err) {
    console.error('Failed to send heartbeat:', err);
  }
};
