import { readFile } from 'node:fs/promises';
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const projectId = 'main-v1-rules-test';
const env = await initializeTestEnvironment({ projectId, firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') } });

beforeEach(async () => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'conversations/c1'), { chatId: 'c1', type: 'direct', createdBy: 'alice', createdAt: new Date() });
    await setDoc(doc(db, 'conversations/c1/members/alice'), { uid: 'alice', role: 'owner' });
    await setDoc(doc(db, 'conversations/c1/members/bob'), { uid: 'bob', role: 'member' });
    await setDoc(doc(db, 'conversations/c1/messages/m1'), { senderId: 'alice', type: 'text', text: 'hello', createdAt: new Date(), deliveredAt: { alice: new Date() }, readBy: { alice: new Date() }, reactions: {}, starredBy: {} });
  });
});

test('conversation members can read but outsiders cannot', async () => {
  await assertSucceeds(env.authenticatedContext('alice').firestore().get(doc(env.authenticatedContext('alice').firestore(), 'conversations/c1')));
  await assertSucceeds(env.authenticatedContext('bob').firestore().get(doc(env.authenticatedContext('bob').firestore(), 'conversations/c1')));
  await assertFails(env.authenticatedContext('mallory').firestore().get(doc(env.authenticatedContext('mallory').firestore(), 'conversations/c1')));
});

test('message sender can delete their message but another member cannot', async () => {
  await assertSucceeds(deleteDoc(doc(env.authenticatedContext('alice').firestore(), 'conversations/c1/messages/m1')));
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'conversations/c1/messages/m2'), { senderId: 'alice', type: 'text', text: 'again', createdAt: new Date(), deliveredAt: { alice: new Date() }, readBy: { alice: new Date() }, reactions: {}, starredBy: {} });
  });
  await assertFails(deleteDoc(doc(env.authenticatedContext('bob').firestore(), 'conversations/c1/messages/m2')));
});

test('members can only modify their own delivery and read state', async () => {
  const bob = env.authenticatedContext('bob').firestore();
  await assertSucceeds(updateDoc(doc(bob, 'conversations/c1/messages/m1'), { 'deliveredAt.bob': new Date() }));
  await assertSucceeds(updateDoc(doc(bob, 'conversations/c1/messages/m1'), { 'readBy.bob': new Date() }));
  const alice = env.authenticatedContext('alice').firestore();
  await assertFails(updateDoc(doc(alice, 'conversations/c1/messages/m1'), { 'readBy.bob': new Date() }));
});

test('ordinary members cannot forge admin roles', async () => {
  const bob = env.authenticatedContext('bob').firestore();
  await assertFails(updateDoc(doc(bob, 'conversations/c1/members/bob'), { role: 'admin' }));
  const alice = env.authenticatedContext('alice').firestore();
  await assertSucceeds(updateDoc(doc(alice, 'conversations/c1/members/bob'), { role: 'admin' }));
});

test('push tokens are private to their owner', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  await assertSucceeds(setDoc(doc(alice, 'users/alice/pushTokens/token-a'), { token: 'token-a' }));
  const bob = env.authenticatedContext('bob').firestore();
  await assertFails(deleteDoc(doc(bob, 'users/alice/pushTokens/token-a')));
});

after(async () => env.cleanup());
