import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  setPersistence,
  browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import {
  getDatabase,
  ref,
  set,
  update,
  push,
  get,
  onValue,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp as firestoreServerTimestamp
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const configured = Object.values(firebaseConfig).every(value => value && !String(value).startsWith('YOUR_'));
let app = null;
let auth = null;
let db = null;
let firestore = null;

if (configured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
  firestore = getFirestore(app);
  setPersistence(auth, browserLocalPersistence).catch(() => {});
}

export {
  configured,
  app,
  auth,
  db,
  firestore,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  setPersistence,
  browserLocalPersistence,
  ref,
  set,
  update,
  push,
  get,
  onValue,
  serverTimestamp,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  firestoreServerTimestamp
};
