import { auth, firestore, doc, setDoc, firestoreServerTimestamp } from './firebase.js';
import { firebaseConfig } from './firebase-config.js';
import { sendMediaMessage } from './media-message-service.js';
import { ipfsUrl } from './media-service.js';

const MAX_BYTES = 25 * 1024 * 1024;
const allowed = new Set(['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','audio/mpeg','audio/mp4','audio/webm','audio/ogg','application/pdf','text/plain']);
const endpoint = `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net/uploadMedia`;

function toast(message) { const el = document.getElementById('toast'); if (!el) return; el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2400); }
function typeFor(mime) { if (mime.startsWith('image/')) return 'image'; if (mime.startsWith('video/')) return 'video'; if (mime.startsWith('audio/')) return 'audio'; return 'document'; }
function ensureStyles() { if (document.getElementById('mediaUiStyles')) return; const style = document.createElement('style'); style.id = 'mediaUiStyles'; style.textContent = `.media-attach{border:0;background:transparent;font-size:20px;cursor:pointer;padding:6px}.media-upload-progress{display:none;align-items:center;gap:8px;padding:5px 10px;font-size:12px}.media-upload-progress.visible{display:flex}.media-upload-progress progress{width:120px}.media-local-preview{max-width:120px;max-height:80px;border-radius:8px;object-fit:cover}`; document.head.appendChild(style); }
function upload(file, onProgress) {
  return new Promise(async (resolve, reject) => {
    const token = await auth.currentUser.getIdToken(); const body = new FormData(); body.append('metadata', JSON.stringify({ originalName: file.name, mimeType: file.type, size: file.size })); body.append('file', file, file.name);
    const request = new XMLHttpRequest(); request.open('POST', endpoint); request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)); };
    request.onerror = () => reject(new Error('Network error during upload.')); request.onload = () => { let result = {}; try { result = JSON.parse(request.responseText || '{}'); } catch {} if (request.status >= 200 && request.status < 300) resolve(result); else reject(new Error(result.error || 'Media upload failed.')); }; request.send(body);
  });
}

function installComposer(composer) {
  if (!composer || composer.dataset.mediaInstalled === '1') return; composer.dataset.mediaInstalled = '1'; ensureStyles();
  const input = composer.querySelector('input[id$="MessageInput"], #messageInput'); if (!input) return;
  const attach = document.createElement('button'); attach.type = 'button'; attach.className = 'media-attach'; attach.title = 'Attach media'; attach.setAttribute('aria-label', 'Attach media'); attach.textContent = '＋';
  const file = document.createElement('input'); file.type = 'file'; file.hidden = true; file.accept = 'image/*,video/*,audio/*,.pdf,.txt';
  const progress = document.createElement('div'); progress.className = 'media-upload-progress'; progress.innerHTML = '<span>Uploading</span><progress value="0" max="100"></progress><span class="media-upload-percent">0%</span>';
  attach.onclick = () => file.click(); file.onchange = async () => {
    const selected = file.files?.[0]; file.value = ''; if (!selected) return;
    if (!auth.currentUser) return toast('Sign in to send media.'); if (selected.size > MAX_BYTES) return toast('Maximum file size is 25 MB.'); if (!allowed.has(selected.type)) return toast('That file type is not supported.');
    const chatId = window.__mainActiveChatId; if (!chatId) return toast('Open a conversation first.');
    progress.classList.add('visible'); const progressBar = progress.querySelector('progress'); const percent = progress.querySelector('.media-upload-percent');
    const preview = document.createElement(selected.type.startsWith('image/') ? 'img' : 'div'); if (preview.tagName === 'IMG') { preview.className = 'media-local-preview'; preview.src = URL.createObjectURL(selected); composer.parentElement?.insertBefore(preview, composer); }
    try {
      const result = await upload(selected, value => { progressBar.value = value; percent.textContent = `${value}%`; });
      await setDoc(doc(firestore, 'media', result.cid), { cid: result.cid, ownerId: auth.currentUser.uid, conversationId: chatId, mimeType: selected.type, fileName: selected.name, size: selected.size, createdAt: firestoreServerTimestamp() });
      await sendMediaMessage(chatId, result.cid, typeFor(selected.type), '', { name: selected.name, mimeType: selected.type, size: selected.size });
      toast('Media sent.');
    } catch (error) { toast(error.message || 'Media upload failed.'); } finally { progress.classList.remove('visible'); preview?.remove(); }
  };
  composer.insertBefore(attach, input); composer.appendChild(file); composer.parentElement?.insertBefore(progress, composer);
}

const observer = new MutationObserver(() => document.querySelectorAll('.composer').forEach(installComposer));
observer.observe(document.body, { childList: true, subtree: true });
document.querySelectorAll('.composer').forEach(installComposer);
