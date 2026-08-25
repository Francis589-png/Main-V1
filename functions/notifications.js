import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

export const notifyNewMessage = onDocumentCreated('conversations/{conversationId}/messages/{messageId}', async event => {
  const snapshot = event.data; if (!snapshot) return;
  const db = getFirestore(); const message = snapshot.data(); const conversationId = event.params.conversationId;
  const conversation = await db.doc(`conversations/${conversationId}`).get(); if (!conversation.exists) return;
  const members = await db.collection(`conversations/${conversationId}/members`).get(); const batch = db.batch(); const pushJobs = [];
  for (const member of members.docs) {
    if (member.id === message.senderId) continue;
    const notification = db.collection(`notifications/${member.id}/items`).doc();
    batch.set(notification, { type: 'message', conversationId, messageId: event.params.messageId, senderId: message.senderId, text: message.text || `[${message.type || 'message'}]`, groupName: conversation.data().type === 'group' ? conversation.data().name || 'Group' : '', read: false, createdAt: FieldValue.serverTimestamp() });
    const tokens = await db.collection(`users/${member.id}/pushTokens`).limit(20).get();
    const tokenList = tokens.docs.map(item => item.data().token).filter(Boolean);
    if (tokenList.length) pushJobs.push({ tokens: tokenList, title: conversation.data().type === 'group' ? conversation.data().name || 'Main' : 'Main', body: message.text || `[${message.type || 'message'}]`, conversationId });
  }
  await batch.commit();
  for (const job of pushJobs) { try { await getMessaging().sendEachForMulticast({ tokens: job.tokens, notification: { title: job.title, body: job.body }, data: { conversationId: job.conversationId, messageId: event.params.messageId } }); } catch (error) { console.error('FCM send failed', error); } }
});
