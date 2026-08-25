import { auth, firestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, limit, firestoreServerTimestamp } from './firebase.js';

const requireFirestore = () => {
  if (!firestore) throw new Error('Firestore is not configured.');
  return firestore;
};

export async function getGroup(groupId) {
  const fs = requireFirestore();
  const snapshot = await getDoc(doc(fs, 'conversations', groupId));
  if (!snapshot.exists() || snapshot.data().type !== 'group') return null;
  const members = await getDocs(query(collection(fs, 'conversations', groupId, 'members'), limit(200)));
  return { id: snapshot.id, ...snapshot.data(), members: members.docs.map(item => ({ uid: item.id, ...item.data() })) };
}

export async function renameGroup(groupId, name) {
  const fs = requireFirestore();
  const cleanName = String(name || '').trim().slice(0, 80);
  if (!cleanName) throw new Error('Group name is required.');
  await updateDoc(doc(fs, 'conversations', groupId), { name: cleanName, updatedAt: firestoreServerTimestamp() });
}

export async function addGroupMember(groupId, uid) {
  const fs = requireFirestore();
  const me = auth.currentUser;
  if (!me || !uid) throw new Error('A valid member is required.');
  const memberRef = doc(fs, 'conversations', groupId, 'members', uid);
  if ((await getDoc(memberRef)).exists()) return;
  const group = await getDoc(doc(fs, 'conversations', groupId));
  if (!group.exists() || group.data().type !== 'group') throw new Error('Group not found.');
  await setDoc(memberRef, { uid, role: 'member', joinedAt: firestoreServerTimestamp(), lastReadMessageId: '', lastReadAt: null });
  await setDoc(doc(fs, 'userConversations', uid, 'items', groupId), { chatId: groupId, type: 'group', groupName: group.data().name || 'Group', otherName: group.data().name || 'Group', unreadCount: 0, updatedAt: firestoreServerTimestamp() });
}

export async function removeGroupMember(groupId, uid) {
  const fs = requireFirestore();
  if (!uid) return;
  const member = await getDoc(doc(fs, 'conversations', groupId, 'members', uid));
  if (!member.exists()) return;
  if (member.data().role === 'owner') throw new Error('Transfer ownership before removing the owner.');
  await deleteDoc(doc(fs, 'conversations', groupId, 'members', uid));
  await deleteDoc(doc(fs, 'userConversations', uid, 'items', groupId));
}

export async function setGroupAdmin(groupId, uid, isAdmin) {
  const fs = requireFirestore();
  const memberRef = doc(fs, 'conversations', groupId, 'members', uid);
  const member = await getDoc(memberRef);
  if (!member.exists()) throw new Error('Member not found.');
  if (member.data().role === 'owner') return;
  await updateDoc(memberRef, { role: isAdmin ? 'admin' : 'member' });
}

export async function leaveGroup(groupId) {
  const fs = requireFirestore();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('You must be signed in.');
  const member = await getDoc(doc(fs, 'conversations', groupId, 'members', uid));
  if (!member.exists()) return;
  if (member.data().role === 'owner') throw new Error('The owner must transfer ownership before leaving.');
  await deleteDoc(doc(fs, 'conversations', groupId, 'members', uid));
  await deleteDoc(doc(fs, 'userConversations', uid, 'items', groupId));
}
