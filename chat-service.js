import {
  db,
  auth,
  get,
  onValue,
  ref,
  set,
  update,
  firestore,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  firestoreServerTimestamp
} from './firebase.js';

const requireFirestore = () => {
  if (!firestore) throw new Error('Firestore is not configured.');
  return firestore;
};

const millis = value => {
  if (typeof value === 'number') return value;
  if (value?.toMillis) return value.toMillis();
  if (value?.seconds) return value.seconds * 1000;
  return 0;
};

export function conversationId(uidA, uidB) { return [uidA, uidB].sort().join('_'); }

async function writeConversationIndex(uid, chatId, data) {
  const db = requireFirestore();
  await setDoc(doc(db, 'userConversations', uid, 'items', chatId), {
    chatId,
    ...data,
    updatedAt: firestoreServerTimestamp()
  }, { merge: true });
}

export async function ensureDirectChat(otherUser) {
  const fs = requireFirestore();
  const me = auth.currentUser;
  if (!me || !otherUser?.uid || otherUser.uid === me.uid) throw new Error('A valid other user is required.');

  const chatId = conversationId(me.uid, otherUser.uid);
  const conversationRef = doc(fs, 'conversations', chatId);
  const existing = await getDoc(conversationRef);

  if (!existing.exists()) {
    await setDoc(conversationRef, {
      chatId,
      type: 'direct',
      name: '',
      createdBy: me.uid,
      createdAt: firestoreServerTimestamp(),
      updatedAt: firestoreServerTimestamp(),
      lastMessage: '',
      lastSenderId: '',
      lastMessageAt: null
    });
  }

  const meMember = doc(fs, 'conversations', chatId, 'members', me.uid);
  const otherMember = doc(fs, 'conversations', chatId, 'members', otherUser.uid);
  const meSnapshot = await getDoc(meMember);
  if (!meSnapshot.exists()) {
    await setDoc(meMember, { uid: me.uid, role: 'owner', joinedAt: firestoreServerTimestamp(), lastReadMessageId: '', lastReadAt: null });
  }
  const otherSnapshot = await getDoc(otherMember);
  if (!otherSnapshot.exists()) {
    await setDoc(otherMember, { uid: otherUser.uid, role: 'member', joinedAt: firestoreServerTimestamp(), lastReadMessageId: '', lastReadAt: null });
  }

  await Promise.all([
    writeConversationIndex(me.uid, chatId, {
      type: 'direct',
      otherUid: otherUser.uid,
      otherName: otherUser.displayName || 'Main user',
      unreadCount: 0
    }),
    writeConversationIndex(otherUser.uid, chatId, {
      type: 'direct',
      otherUid: me.uid,
      otherName: me.displayName || 'Main user',
      unreadCount: 0
    })
  ]);

  return chatId;
}

export async function createGroup(name, members) {
  const fs = requireFirestore();
  const me = auth.currentUser;
  if (!me) throw new Error('You must be signed in.');
  const cleanName = String(name || '').trim().slice(0, 80);
  const unique = [...new Set([me.uid, ...(members || []).filter(uid => uid && uid !== me.uid)])];
  if (!cleanName) throw new Error('Enter a group name.');
  if (unique.length < 2) throw new Error('A group needs at least one other person.');

  const conversationRef = doc(collection(fs, 'conversations'));
  await setDoc(conversationRef, {
    chatId: conversationRef.id,
    type: 'group',
    name: cleanName,
    createdBy: me.uid,
    createdAt: firestoreServerTimestamp(),
    updatedAt: firestoreServerTimestamp(),
    lastMessage: '',
    lastSenderId: '',
    lastMessageAt: null
  });

  await setDoc(doc(fs, 'conversations', conversationRef.id, 'members', me.uid), {
    uid: me.uid, role: 'owner', joinedAt: firestoreServerTimestamp(), lastReadMessageId: '', lastReadAt: null
  });
  for (const uid of unique.filter(item => item !== me.uid)) {
    await setDoc(doc(fs, 'conversations', conversationRef.id, 'members', uid), {
      uid, role: 'member', joinedAt: firestoreServerTimestamp(), lastReadMessageId: '', lastReadAt: null
    });
  }
  await Promise.all(unique.map(uid => writeConversationIndex(uid, conversationRef.id, {
    type: 'group', groupName: cleanName, otherName: cleanName, unreadCount: 0
  })));
  return conversationRef.id;
}

export function watchUserChats(uid, callback) {
  const fs = requireFirestore();
  const q = query(
    collection(fs, 'userConversations', uid, 'items'),
    orderBy('updatedAt', 'desc'),
    limit(50)
  );
  return onSnapshot(q, snapshot => {
    const chats = {};
    snapshot.forEach(item => {
      const data = item.data();
      chats[item.id] = { chatId: item.id, ...data, updatedAt: millis(data.updatedAt) };
    });
    callback(chats);
  }, error => callback({}, error));
}

export function watchChat(chatId, callback) {
  const fs = requireFirestore();
  return onSnapshot(doc(fs, 'conversations', chatId), snapshot => callback(snapshot.exists() ? { chatId: snapshot.id, ...snapshot.data() } : null));
}

export function watchPublicProfiles(callback) {
  const fs = requireFirestore();
  const q = query(collection(fs, 'users'), limit(100));
  return onSnapshot(q, snapshot => {
    const profiles = {};
    snapshot.forEach(item => { profiles[item.id] = { uid: item.id, ...item.data() }; });
    callback(profiles);
  }, error => callback({}));
}

export function watchMessages(chatId, callback) {
  const fs = requireFirestore();
  const q = query(
    collection(fs, 'conversations', chatId, 'messages'),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  return onSnapshot(q, snapshot => {
    const messages = snapshot.docs.map(item => {
      const data = item.data();
      return {
        id: item.id,
        ...data,
        createdAt: millis(data.createdAt),
        deliveredAt: Object.fromEntries(Object.entries(data.deliveredAt || {}).map(([uid, value]) => [uid, millis(value)])),
        readBy: Object.fromEntries(Object.entries(data.readBy || {}).map(([uid, value]) => [uid, millis(value)]))
      };
    }).reverse();
    callback(messages);
  }, error => callback([], error));
}

export function watchPresence(uid, callback) {
  return onValue(ref(db, `presence/${uid}`), snapshot => callback(snapshot.val() || { online: false }));
}

export function watchTyping(chatId, otherUid, callback) {
  return onValue(ref(db, `typing/${chatId}/${otherUid}`), snapshot => {
    const value = snapshot.val();
    callback(Boolean(value && Date.now() - Number(value) < 3000));
  });
}

export async function sendMessage(chatId, text, options = {}) {
  const fs = requireFirestore();
  const me = auth.currentUser;
  if (!me) throw new Error('You must be signed in.');
  const cleanText = String(text || '').trim();
  if (!cleanText) return null;

  const memberSnapshot = await getDoc(doc(fs, 'conversations', chatId, 'members', me.uid));
  if (!memberSnapshot.exists()) throw new Error('You are not a member of this conversation.');

  const messageRef = doc(collection(fs, 'conversations', chatId, 'messages'));
  const message = {
    senderId: me.uid,
    type: options.type || 'text',
    text: cleanText,
    replyTo: options.replyTo || null,
    mediaId: options.mediaId || null,
    createdAt: firestoreServerTimestamp(),
    deliveredAt: { [me.uid]: firestoreServerTimestamp() },
    readBy: { [me.uid]: firestoreServerTimestamp() },
    reactions: {},
    starredBy: {}
  };
  await setDoc(messageRef, message);
  const preview = cleanText || `[${message.type}]`;
  await updateDoc(doc(fs, 'conversations', chatId), {
    lastMessage: preview,
    lastSenderId: me.uid,
    lastMessageAt: firestoreServerTimestamp(),
    updatedAt: firestoreServerTimestamp()
  });

  const membersSnapshot = await getDoc(doc(fs, 'conversations', chatId, 'members', me.uid));
  if (!membersSnapshot.exists()) throw new Error('Conversation membership changed.');
  return messageRef.id;
}

export async function markDelivered(chatId, messageId, uid = auth.currentUser?.uid) {
  const fs = requireFirestore();
  if (!uid || !messageId) return;
  await updateDoc(doc(fs, 'conversations', chatId, 'messages', messageId), {
    [`deliveredAt.${uid}`]: firestoreServerTimestamp()
  });
}

export async function markRead(chatId, messageId) {
  const fs = requireFirestore();
  const uid = auth.currentUser?.uid;
  if (!uid || !messageId) return;
  await updateDoc(doc(fs, 'conversations', chatId, 'messages', messageId), {
    [`readBy.${uid}`]: firestoreServerTimestamp()
  });
  await updateDoc(doc(fs, 'conversations', chatId, 'members', uid), {
    lastReadMessageId: messageId,
    lastReadAt: firestoreServerTimestamp()
  });
  await setDoc(doc(fs, 'userConversations', uid, 'items', chatId), {
    unreadCount: 0,
    updatedAt: firestoreServerTimestamp()
  }, { merge: true });
}

export async function markTyping(chatId, typing) {
  if (!auth.currentUser || !db) return;
  await set(ref(db, `typing/${chatId}/${auth.currentUser.uid}`), typing ? Date.now() : null);
}

export async function updatePresence(online) {
  if (!auth.currentUser || !db) return;
  await update(ref(db, `presence/${auth.currentUser.uid}`), { online, lastSeen: Date.now() });
}
