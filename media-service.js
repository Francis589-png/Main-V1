import { auth } from './firebase.js';

const DEFAULT_FUNCTION_URL = 'https://us-central1-main-v1.cloudfunctions.net/uploadMedia';

export async function uploadMedia(file, metadata = {}, endpoint = DEFAULT_FUNCTION_URL) {
  if (!auth?.currentUser) throw new Error('You must be signed in to upload media.');
  if (!(file instanceof File)) throw new Error('Invalid file.');
  const token = await auth.currentUser.getIdToken();
  const body = new FormData();
  body.append('metadata', JSON.stringify(metadata));
  body.append('file', file, file.name);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Media upload failed.');
  return result;
}

export function ipfsUrl(cid, gateway = 'https://gateway.pinata.cloud/ipfs/') {
  if (!cid) return '';
  return `${gateway}${encodeURIComponent(cid)}`;
}
