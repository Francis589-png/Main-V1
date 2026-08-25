import { onDocumentCreated } from 'firebase-functions/v2/firestore';

const tokenize = value => [...new Set(String(value || '').toLowerCase().split(/[^a-z0-9@._-]+/).filter(Boolean).flatMap(token => token.length > 1 ? Array.from({ length: Math.min(token.length, 24) }, (_, index) => token.slice(0, index + 1)) : [token]))].slice(0, 200);

export const indexMessageSearch = onDocumentCreated('conversations/{conversationId}/messages/{messageId}', async event => {
  const snapshot = event.data;
  if (!snapshot) return;
  const data = snapshot.data();
  await snapshot.ref.set({ searchTokens: tokenize(data.text) }, { merge: true });
});
