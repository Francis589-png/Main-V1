import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut, updateProfile, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import { getDatabase, ref, set, update, push, get, onValue, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js';
import { initializeFirestore, collection, collectionGroup, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, addDoc, query, where, orderBy, limit, startAt, endAt, onSnapshot, enableNetwork, serverTimestamp as firestoreServerTimestamp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const requiredConfigKeys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
const configured = requiredConfigKeys.every(key => {
  const value = firebaseConfig[key];
  return Boolean(value) && !String(value).startsWith('YOUR_');
});
let app = null; let auth = null; let db = null; let firestore = null;
if (configured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
  // Let Firestore automatically select the most reliable browser transport.
  // This improves reliability on mobile/proxied networks without forcing the
  // slower long-polling transport for every connection.
  firestore = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  setPersistence(auth, browserLocalPersistence).catch(() => {});
  enableNetwork(firestore).catch(() => {});
}
export { configured, app, auth, db, firestore, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut, updateProfile, setPersistence, browserLocalPersistence, ref, set, update, push, get, onValue, serverTimestamp, collection, collectionGroup, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, addDoc, query, where, orderBy, limit, startAt, endAt, onSnapshot, enableNetwork, firestoreServerTimestamp };
