import { writeFile } from 'node:fs/promises';

const required = [
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_DATABASE_URL',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_STORAGE_BUCKET',
  'FIREBASE_MESSAGING_SENDER_ID',
  'FIREBASE_APP_ID'
];

const missing = required.filter(key => !process.env[key]);
if (missing.length) {
  console.error(`Missing Netlify/Firebase environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const config = `// Generated during the Netlify build. Do not edit manually.\nexport const firebaseConfig = ${JSON.stringify({
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
}, null, 2)};\n`;

await writeFile('firebase-config.js', config, 'utf8');
console.log('Firebase web configuration generated for this build.');
