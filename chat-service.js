import { db, auth, get, onValue, push, ref, serverTimestamp, set, update } from './firebase.js';

export function conversationId(uidA, uidB) {
  return [uidA, uidB].sort().join('_');
}

export async function ensureDirectChat(otherUser) {
  if (!auth.currentUser || !otherUser?.uid || otherUser.uid === auth.currentUser.uid) throw new Error('A valid other user is required.');
  const myUid = auth.currentUser.uid;
  const chatId = conversationId(myUid, otherUser.uid);
  await update(ref(db, `chats/${chatId}`), {
    type: 'direct',
    members: { [myUid]: true, [otherUser.uid]: true },
    updatedAt: serverTimestamp()
  });
  await update(ref(db, `userChats/${myUid}/${chatId}`), {
    chatId,
    otherUid: otherUser.uid,
    otherName: otherUser.displayName || 'Main user'
  });
  await update(ref(db, `userChats/${otherUser.uid}/${chatId}`), {
    chatId,
    otherUid: myUid,
    otherName: auth.currentUser.displayName || 'Main user'
  });
  return chatId;
}

export function watchUserChats(uid, callback) {
  return onValue(ref(db, `userChats/${uid}`), snapshot => callback(snapshot.val() || {}));
}

export function watchChat(chatId, callback) {
  return onValue(ref(db, `chats/${chatId}`), snapshot => callback(snapshot.val() || null));
}

export function watchPublicProfiles(callback) {
  return onValue(ref(db, 'publicProfiles'), snapshot => callback(snapshot.val() || {}));
}

export function watchMessages(chatId, callback) {
  return onValue(ref(db, `messages/${chatId}`), snapshot => {
    const value = snapshot.val() || {};
    callback(Object.entries(value)
      .map(([id, message]) => ({ id, ...message }))
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
  });
}

export function watchPresence(uid, callback) {
  return onValue(ref(db, `presence/${uid}`), snapshot => callback(snapshot.val() || { online: false }));
}

export function watchTyping(chatId, otherUid, callback) {
  return onValue(ref(db, `typing/${chatId}/${otherUid}`), snapshot => callback(Boolean(snapshot.val())));
}

export async function sendMessage(chatId, text) {
  if (!auth.currentUser) throw new Error('You must be signed in.');
  const cleanText = text.trim();
  if (!cleanText) return;

  const chatSnapshot = await get(ref(db, `chats/${chatId}`));
  const chat = chatSnapshot.val();
  if (!chat?.members?.[auth.currentUser.uid]) throw new Error('You are not a member of this conversation.');
  const otherUid = Object.keys(chat.members).find(uid => uid !== auth.currentUser.uid);
  if (!otherUid) throw new Error('This conversation does not have another member.');

  const recipientProfileSnapshot = await get(ref(db, `publicProfiles/${otherUid}`));
  const recipientProfile = recipientProfileSnapshot.val() || {};
  const messageRef = push(ref(db, `messages/${chatId}`));
  const createdAt = Date.now();
  const message = {
    senderId: auth.currentUser.uid,
    text: cleanText,
    type: 'text',
    createdAt,
    serverCreatedAt: serverTimestamp(),
    readBy: { [auth.currentUser.uid]: true }
  };

  const senderPreview = {
    chatId,
    otherUid,
    otherName: recipientProfile.displayName || 'Main user',
    lastMessage: cleanText,
    lastSenderId: auth.currentUser.uid,
    updatedAt: createdAt,
    unreadCount: 0
  };
  const recipientPreview = {
    chatId,
    otherUid: auth.currentUser.uid,
    otherName: auth.currentUser.displayName || 'Main user',
    lastMessage: cleanText,
    lastSenderId: auth.currentUser.uid,
    updatedAt: createdAt
  };

  const writes = {};
  writes[`messages/${chatId}/${messageRef.key}`] = message;
  writes[`chats/${chatId}/lastMessage`] = cleanText;
  writes[`chats/${chatId}/lastSenderId`] = auth.currentUser.uid;
  writes[`chats/${chatId}/updatedAt`] = serverTimestamp();
  writes[`userChats/${auth.currentUser.uid}/${chatId}`] = senderPreview;
  writes[`userChats/${otherUid}/${chatId}`] = recipientPreview;
  await update(ref(db), writes);
}

export async function markRead(chatId, messageId) {
  if (!auth.currentUser || !messageId) return;
  const uid = auth.currentUser.uid;
  await update(ref(db, `messages/${chatId}/${messageId}/readBy`), { [uid]: true });
  await update(ref(db, `userChats/${uid}/${chatId}`), { unreadCount: 0 });
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
