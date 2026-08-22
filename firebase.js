import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import {
  getDatabase,
  ref,
  set,
  update,
  push,
  onValue,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js';
import { firebaseConfig } from './firebase-config.js';

const configured = Object.values(firebaseConfig).every(value => value && !String(value).startsWith('YOUR_'));

let app = null;
let auth = null;
let db = null;

if (configured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
}

export {
  configured,
  auth,
  db,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  ref,
  set,
  update,
  push,
  onValue,
  serverTimestamp
};
