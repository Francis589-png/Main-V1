import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import Busboy from 'busboy';
import { indexMessageSearch } from './message-search.js';
import { notifyNewMessage } from './notifications.js';

initializeApp();
const pinataJwt = defineSecret('PINATA_JWT');
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','audio/mpeg','audio/mp4','audio/webm','audio/ogg','application/pdf','text/plain']);
const cors = response => { response.set('Access-Control-Allow-Origin', '*'); response.set('Access-Control-Allow-Headers', 'Authorization, Content-Type'); response.set('Access-Control-Allow-Methods', 'POST, OPTIONS'); };
function parseMultipart(req) { return new Promise((resolve, reject) => { const contentType = req.headers['content-type'] || ''; const busboy = Busboy({ headers: { 'content-type': contentType }, limits: { files: 1, fileSize: MAX_BYTES } }); const chunks = []; let metadata = {}; let tooLarge = false; busboy.on('field', (name, value) => { if (name === 'metadata') { try { metadata = JSON.parse(value); } catch { metadata = {}; } } }); busboy.on('file', (_name, file, info) => { const parts = []; let size = 0; file.on('data', chunk => { size += chunk.length; parts.push(chunk); }); file.on('limit', () => { tooLarge = true; }); file.on('end', () => chunks.push({ buffer: Buffer.concat(parts), ...info, size })); }); busboy.on('error', reject); busboy.on('finish', () => resolve({ file: chunks[0], metadata, tooLarge })); req.pipe(busboy); }); }
export const uploadMedia = onRequest({ secrets: [pinataJwt], timeoutSeconds: 120, memory: '512MiB', maxInstances: 20 }, async (req, res) => {
  cors(res); if (req.method === 'OPTIONS') return res.status(204).send(''); if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try { const authorization = req.headers.authorization || ''; if (!authorization.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' }); const decoded = await getAuth().verifyIdToken(authorization.slice(7)); const { file, metadata, tooLarge } = await parseMultipart(req); if (!file) return res.status(400).json({ error: 'A file is required' }); if (tooLarge || file.size > MAX_BYTES) return res.status(413).json({ error: 'File exceeds the 25 MB limit' }); if (!ALLOWED_TYPES.has(file.mimeType)) return res.status(415).json({ error: 'File type is not supported' }); const body = new FormData(); body.append('file', new Blob([file.buffer], { type: file.mimeType }), file.filename); body.append('network', 'public'); body.append('name', file.filename); const response = await fetch('https://uploads.pinata.cloud/v3/files', { method: 'POST', headers: { Authorization: `Bearer ${pinataJwt.value()}` }, body }); if (!response.ok) { console.error('Pinata upload failed', response.status, await response.text()); return res.status(502).json({ error: 'Media provider rejected the upload' }); } const result = await response.json(); return res.status(201).json({ cid: result.cid, name: file.filename, mimeType: file.mimeType, size: file.size, ownerId: decoded.uid, metadata }); }
  catch (error) { console.error('uploadMedia error', error); return res.status(500).json({ error: 'Media upload failed' }); }
});
export const indexNewMessage = onDocumentCreated('conversations/{conversationId}/messages/{messageId}', async event => {
  const snapshot = event.data; if (!snapshot) return; const db = getFirestore(); const conversationId = event.params.conversationId; const message = snapshot.data(); const conversation = await db.doc(`conversations/${conversationId}`).get(); if (!conversation.exists) return; const members = await db.collection(`conversations/${conversationId}/members`).get(); const batch = db.batch(); const preview = message.text || `[${message.type || 'message'}]`;
  for (const member of members.docs) { const uid = member.id; const indexRef = db.doc(`userConversations/${uid}/items/${conversationId}`); const data = { chatId: conversationId, type: conversation.data().type, unreadCount: uid === message.senderId ? 0 : FieldValue.increment(1), lastMessage: preview, lastSenderId: message.senderId, updatedAt: FieldValue.serverTimestamp() }; if (conversation.data().type === 'group') { data.groupName = conversation.data().name || 'Group'; data.otherName = data.groupName; } batch.set(indexRef, data, { merge: true }); }
  await batch.commit();
});
export { indexMessageSearch, notifyNewMessage };
