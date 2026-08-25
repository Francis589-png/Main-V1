import { firestore, doc, getDoc } from './firebase.js';
import { ipfsUrl } from './media-service.js';

const loaded = new Set();
function escapeText(value) { return String(value ?? '').replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[c])); }
async function renderMedia(row, message) {
  if (!message?.mediaId || loaded.has(message.id) || !firestore) return;
  const snapshot = await getDoc(doc(firestore, 'media', message.mediaId));
  if (!snapshot.exists()) return;
  const media = snapshot.data(); const url = ipfsUrl(media.cid); if (!url) return;
  const bubble = row.querySelector('.message-bubble'); if (!bubble) return;
  const container = document.createElement('div'); container.className = 'message-media';
  if (media.mimeType?.startsWith('image/')) { const image = document.createElement('img'); image.src = url; image.alt = escapeText(media.fileName || 'Image'); image.loading = 'lazy'; image.style.maxWidth = '260px'; image.style.maxHeight = '320px'; image.style.borderRadius = '12px'; container.appendChild(image); }
  else if (media.mimeType?.startsWith('video/')) { const video = document.createElement('video'); video.src = url; video.controls = true; video.preload = 'metadata'; video.style.maxWidth = '280px'; video.style.borderRadius = '12px'; container.appendChild(video); }
  else if (media.mimeType?.startsWith('audio/')) { const audio = document.createElement('audio'); audio.src = url; audio.controls = true; audio.preload = 'metadata'; container.appendChild(audio); }
  else { const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = `Open ${media.fileName || 'document'}`; container.appendChild(link); }
  bubble.prepend(container); loaded.add(message.id);
}
function scan() { const messages = window.__mainActiveMessages || []; const rows = [...document.querySelectorAll('#messages .message-row')]; rows.forEach((row, index) => renderMedia(row, messages[index])); }
new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
