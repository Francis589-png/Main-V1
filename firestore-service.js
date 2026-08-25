import {
  firestore,
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp
} from './firebase.js';

const requireFirestore = () => {
  if (!firestore) throw new Error('Firestore is not configured.');
  return firestore;
};

export async function ensureUserProfile(user, profile = {}) {
  const db = requireFirestore();
  const userRef = doc(db, 'users', user.uid);
  const existing = await getDoc(userRef);
  const base = {
    uid: user.uid,
    username: profile.username || user.email?.split('@')[0] || `user_${user.uid.slice(0, 8)}`,
    displayName: profile.displayName || user.displayName || user.email?.split('@')[0] || 'Main user',
    photoCID: profile.photoCID || '',
    bio: profile.bio || '',
    online: true,
    lastSeen: serverTimestamp(),
    createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  await setDoc(userRef, base, { merge: true });
  return base;
}

export async function getUserProfile(uid) {
  const db = requireFirestore();
  const snapshot = await getDoc(doc(db, 'users', uid));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function updateUserProfile(uid, changes) {
  const db = requireFirestore();
  const allowed = ['username', 'displayName', 'photoCID', 'bio'];
  const data = Object.fromEntries(Object.entries(changes).filter(([key]) => allowed.includes(key)));
  data.updatedAt = serverTimestamp();
  await updateDoc(doc(db, 'users', uid), data);
}

export async function createConversation({ type = 'direct', memberIds, name = '', createdBy }) {
  const db = requireFirestore();
  const conversationRef = doc(collection(db, 'conversations'));
  await setDoc(conversationRef, {
    type,
    name: name.trim(),
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastMessage: '',
    lastSenderId: ''
  });
  await Promise.all(memberIds.map((uid, index) => setDoc(
    doc(db, 'conversations', conversationRef.id, 'members', uid),
    { uid, role: index === 0 ? 'owner' : 'member', joinedAt: serverTimestamp() }
  )));
  return conversationRef.id;
}

export function watchConversationMessages(conversationId, callback, pageSize = 40) {
  const db = requireFirestore();
  const q = query(
    collection(db, 'conversations', conversationId, 'messages'),
    orderBy('createdAt', 'desc'),
    limit(pageSize)
  );
  return onSnapshot(q, snapshot => {
    const messages = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).reverse();
    callback(messages);
  }, error => callback([], error));
}

export async function sendFirestoreMessage(conversationId, senderId, data) {
  const db = requireFirestore();
  const message = {
    senderId,
    type: data.type || 'text',
    text: data.text || '',
    replyTo: data.replyTo || null,
    mediaId: data.mediaId || null,
    createdAt: serverTimestamp(),
    deliveredTo: {},
    readBy: {},
    reactions: {}
  };
  const messageRef = await addDoc(collection(db, 'conversations', conversationId, 'messages'), message);
  await updateDoc(doc(db, 'conversations', conversationId), {
    lastMessage: message.text || `[${message.type}]`,
    lastSenderId: senderId,
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return messageRef.id;
}

export async function markMessageRead(conversationId, messageId, uid) {
  const db = requireFirestore();
  await updateDoc(doc(db, 'conversations', conversationId, 'messages', messageId), {
    [`readBy.${uid}`]: serverTimestamp()
  });
}
