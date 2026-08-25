import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

export const notifyNewMessage = onDocumentCreated('conversations/{conversationId}/messages/{messageId}', async event => {
  const snapshot = event.data; if (!snapshot) return;
  const db = getFirestore(); const message = snapshot.data(); const conversationId = event.params.conversationId;
  const conversation = await db.doc(`conversations/${conversationId}`).get(); if (!conversation.exists) return;
  const members = await db.collection(`conversations/${conversationId}/members`).get(); const batch = db.batch();
  for (const member of members.docs) {
    if (member.id === message.senderId) continue;
    const notification = db.collection(`notifications/${member.id}/items`).doc();
    batch.set(notification, { type: 'message', conversationId, messageId: event.params.messageId, senderId: message.senderId, text: message.text || `[${message.type || 'message'}]`, groupName: conversation.data().type === 'group' ? conversation.data().name || 'Group' : '', read: false, createdAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();
});
