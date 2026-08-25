import { getMessaging, getToken, onMessage } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-messaging.js';
import { auth, app, firestore, doc, setDoc, firestoreServerTimestamp } from './firebase.js';
import { firebaseConfig } from './firebase-config.js';

let foregroundInstalled = false;
export async function enablePushNotifications() {
  if (!auth?.currentUser || !app) throw new Error('Sign in before enabling notifications.');
  if (!('Notification' in window) || !('serviceWorker' in navigator)) throw new Error('Push notifications are not supported here.');
  if (!firebaseConfig.vapidKey) throw new Error('Push notifications are not configured on this deployment yet.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was denied.');
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey: firebaseConfig.vapidKey, serviceWorkerRegistration: registration });
  if (!token) throw new Error('Firebase did not return a notification token.');
  await setDoc(doc(firestore, 'users', auth.currentUser.uid, 'pushTokens', token), { token, createdAt: firestoreServerTimestamp(), updatedAt: firestoreServerTimestamp() });
  if (!foregroundInstalled) {
    foregroundInstalled = true;
    onMessage(messaging, payload => { const title = payload.notification?.title || 'Main'; const body = payload.notification?.body || 'You have a new message.'; if (document.visibilityState === 'visible') { const event = new CustomEvent('main:push-notification', { detail: { title, body } }); window.dispatchEvent(event); } });
  }
  return token;
}
