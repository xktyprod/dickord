import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyBiWmH-9cKZICjiTYp0KZuxSSbq_SI-UKM",
  authDomain: "dicckord-ff35a.firebaseapp.com",
  projectId: "dicckord-ff35a",
  storageBucket: "dicckord-ff35a.firebasestorage.app",
  messagingSenderId: "652944942983",
  appId: "1:652944942983:web:124606bce7958ee0539522",
  databaseURL: "https://dicckord-ff35a-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const rtdb = getDatabase(app);
export default app;
