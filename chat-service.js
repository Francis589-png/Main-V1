import { db, auth, onValue, push, ref, serverTimestamp, set, update } from './firebase.js';

export function conversationId(uidA, uidB) {
  return [uidA, uidB].sort().join('_');
}

export function watchUserChats(uid, callback) {
  return onValue(ref(db, `userChats/${uid}`), snapshot => callback(snapshot.val() || {}));
}

export function watchMessages(chatId, callback) {
  return onValue(ref(db, `messages/${chatId}`), snapshot => {
    const value = snapshot.val() || {};
    callback(Object.entries(value).map(([id, message]) => ({ id, ...message })).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
  });
}

export async function sendMessage(chatId, text) {
  if (!auth.currentUser) throw new Error('You must be signed in.');
  const cleanText = text.trim();
  if (!cleanText) return;
  const messageRef = push(ref(db, `messages/${chatId}`));
  const createdAt = Date.now();
  await set(messageRef, {
    senderId: auth.currentUser.uid,
    text: cleanText,
    type: 'text',
    createdAt,
    serverCreatedAt: serverTimestamp()
  });
}

export async function markTyping(chatId, typing) {
  if (!auth.currentUser) return;
  await set(ref(db, `typing/${chatId}/${auth.currentUser.uid}`), typing ? Date.now() : null);
}

export async function updatePresence(online) {
  if (!auth.currentUser) return;
  await update(ref(db, `presence/${auth.currentUser.uid}`), {
    online,
    lastSeen: Date.now()
  });
}
