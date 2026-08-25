import { writeFile } from 'node:fs/promises';

const required = ['FIREBASE_API_KEY','FIREBASE_AUTH_DOMAIN','FIREBASE_DATABASE_URL','FIREBASE_PROJECT_ID','FIREBASE_STORAGE_BUCKET','FIREBASE_MESSAGING_SENDER_ID','FIREBASE_APP_ID'];
const missing = required.filter(key => !process.env[key]);
if (missing.length) { console.error(`Missing Netlify/Firebase environment variables: ${missing.join(', ')}`); process.exit(1); }
const configObject = { apiKey: process.env.FIREBASE_API_KEY, authDomain: process.env.FIREBASE_AUTH_DOMAIN, databaseURL: process.env.FIREBASE_DATABASE_URL, projectId: process.env.FIREBASE_PROJECT_ID, storageBucket: process.env.FIREBASE_STORAGE_BUCKET, messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID, appId: process.env.FIREBASE_APP_ID, vapidKey: process.env.FIREBASE_VAPID_KEY || '' };
await writeFile('firebase-config.js', `// Generated during the Netlify build. Do not edit manually.\nexport const firebaseConfig = ${JSON.stringify(configObject, null, 2)};\n`, 'utf8');
const sw = `importScripts('https://www.gstatic.com/firebasejs/12.1.0/firebase-app-compat.js');\nimportScripts('https://www.gstatic.com/firebasejs/12.1.0/firebase-messaging-compat.js');\nconst firebaseConfig = ${JSON.stringify(configObject)};\nfirebase.initializeApp(firebaseConfig);\nconst messaging = firebase.messaging();\nmessaging.onBackgroundMessage(payload => { const title = payload.notification?.title || 'Main'; const options = { body: payload.notification?.body || 'You have a new message.', icon: '/icon-192.png', data: payload.data || {} }; self.registration.showNotification(title, options); });\n`;
await writeFile('firebase-messaging-sw.js', sw, 'utf8');
console.log('Firebase web configuration and optional messaging service worker generated for this build.');
