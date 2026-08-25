import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import Busboy from 'busboy';

initializeApp();
const pinataJwt = defineSecret('PINATA_JWT');
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm',
  'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/ogg',
  'application/pdf', 'text/plain'
]);

const cors = response => {
  response.set('Access-Control-Allow-Origin', '*');
  response.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
};

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    const busboy = Busboy({ headers: { 'content-type': contentType }, limits: { files: 1, fileSize: MAX_BYTES } });
    const chunks = [];
    let metadata = {};
    let tooLarge = false;

    busboy.on('field', (name, value) => {
      if (name === 'metadata') {
        try { metadata = JSON.parse(value); } catch { metadata = {}; }
      }
    });
    busboy.on('file', (_name, file, info) => {
      const parts = [];
      let size = 0;
      file.on('data', chunk => { size += chunk.length; parts.push(chunk); });
      file.on('limit', () => { tooLarge = true; });
      file.on('end', () => chunks.push({ buffer: Buffer.concat(parts), ...info, size }));
    });
    busboy.on('error', reject);
    busboy.on('finish', () => resolve({ file: chunks[0], metadata, tooLarge }));
    req.pipe(busboy);
  });
}

export const uploadMedia = onRequest(
  { secrets: [pinataJwt], timeoutSeconds: 120, memory: '512MiB', maxInstances: 20 },
  async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
      const authorization = req.headers.authorization || '';
      if (!authorization.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
      const token = authorization.slice(7);
      const decoded = await getAuth().verifyIdToken(token);
      const { file, metadata, tooLarge } = await parseMultipart(req);
      if (!file) return res.status(400).json({ error: 'A file is required' });
      if (tooLarge || file.size > MAX_BYTES) return res.status(413).json({ error: 'File exceeds the 25 MB limit' });
      if (!ALLOWED_TYPES.has(file.mimeType)) return res.status(415).json({ error: 'File type is not supported' });

      const body = new FormData();
      body.append('file', new Blob([file.buffer], { type: file.mimeType }), file.filename);
      body.append('network', 'public');
      body.append('name', file.filename);

      const response = await fetch('https://uploads.pinata.cloud/v3/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${pinataJwt.value()}` },
        body
      });
      if (!response.ok) {
        const detail = await response.text();
        console.error('Pinata upload failed', response.status, detail);
        return res.status(502).json({ error: 'Media provider rejected the upload' });
      }

      const result = await response.json();
      return res.status(201).json({
        cid: result.cid,
        name: file.filename,
        mimeType: file.mimeType,
        size: file.size,
        ownerId: decoded.uid,
        metadata
      });
    } catch (error) {
      console.error('uploadMedia error', error);
      return res.status(500).json({ error: 'Media upload failed' });
    }
  }
);
