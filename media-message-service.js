import { auth, firestore, collection, doc, getDoc, setDoc, updateDoc, firestoreServerTimestamp } from './firebase.js';

export async function sendMediaMessage(chatId, mediaId, type, caption = '', extra = {}) {
  if (!firestore || !auth.currentUser) throw new Error('You must be signed in.');
  const uid = auth.currentUser.uid;
  if (!(await getDoc(doc(firestore, 'conversations', chatId, 'members', uid))).exists()) throw new Error('You are not a member of this conversation.');
  const messageRef = doc(collection(firestore, 'conversations', chatId, 'messages'));
  await setDoc(messageRef, {
    senderId: uid,
    type,
    text: String(caption || '').trim(),
    mediaId,
    mediaName: extra.name || null,
    mediaMime: extra.mimeType || null,
    mediaSize: extra.size || null,
    replyTo: null,
    forwardedFrom: null,
    createdAt: firestoreServerTimestamp(),
    deliveredAt: { [uid]: firestoreServerTimestamp() },
    readBy: { [uid]: firestoreServerTimestamp() },
    reactions: {},
    starredBy: {}
  });
  await updateDoc(doc(firestore, 'conversations', chatId), {
    lastMessage: caption?.trim() || `[${type}]`,
    lastSenderId: uid,
    lastMessageAt: firestoreServerTimestamp(),
    updatedAt: firestoreServerTimestamp()
  });
  return messageRef.id;
}
