import { auth, firestore, doc, setDoc, firestoreServerTimestamp } from './firebase.js';
import { firebaseConfig } from './firebase-config.js';
import { sendMediaMessage } from './media-message-service.js';

const endpoint = `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net/uploadMedia`;
const MAX_MS = 5 * 60 * 1000;
let recorder = null;
let stream = null;
let chunks = [];
let startedAt = 0;
let timer = null;
let activeComposer = null;

function toast(message) { const el = document.getElementById('toast'); if (!el) return; el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2400); }
function styles() { if (document.getElementById('voiceStyles')) return; const style = document.createElement('style'); style.id = 'voiceStyles'; style.textContent = `.voice-record{border:0;background:transparent;font-size:19px;cursor:pointer;padding:6px}.voice-record.recording{background:#b91c1c;color:#fff;border-radius:9px}.voice-timer{font-size:12px;min-width:38px}.voice-preview{display:flex;align-items:center;gap:8px;padding:5px 9px;border-radius:8px;background:rgba(127,127,127,.1)}`; document.head.appendChild(style); }
function format(seconds) { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
async function uploadVoice(file, chatId, duration) {
  const token = await auth.currentUser.getIdToken(); const body = new FormData(); body.append('metadata', JSON.stringify({ conversationId: chatId, durationMs: duration })); body.append('file', file, file.name);
  const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body }); const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || 'Voice upload failed.');
  await setDoc(doc(firestore, 'media', result.cid), { cid: result.cid, ownerId: auth.currentUser.uid, conversationId: chatId, mimeType: file.type, fileName: file.name, size: file.size, durationMs: duration, createdAt: firestoreServerTimestamp() });
  await sendMediaMessage(chatId, result.cid, 'voice', '', { name: file.name, mimeType: file.type, size: file.size });
}
function stopTimer() { clearInterval(timer); timer = null; }
async function stopRecording(cancel = false) {
  if (!recorder) return;
  const duration = Date.now() - startedAt; stopTimer();
  if (cancel) { recorder.onstop = null; recorder.stop(); stream?.getTracks().forEach(track => track.stop()); recorder = null; stream = null; chunks = []; toast('Recording cancelled.'); return; }
  recorder.onstop = async () => {
    stream?.getTracks().forEach(track => track.stop()); const mime = recorder.mimeType || 'audio/webm'; const file = new File(chunks, `voice-${Date.now()}.webm`, { type: mime }); recorder = null; stream = null; chunks = [];
    if (file.size === 0) return toast('No audio was recorded.');
    try { await uploadVoice(file, window.__mainActiveChatId, duration); toast('Voice message sent.'); } catch (error) { toast(error.message || 'Voice message upload failed.'); }
  };
  recorder.stop();
}
async function startRecording(button) {
  if (!auth.currentUser || !window.__mainActiveChatId) return toast('Open a conversation first.');
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('Audio recording is not supported on this browser.');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
    recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined); chunks = []; startedAt = Date.now();
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); }; recorder.start(250); button.classList.add('recording'); button.textContent = '■';
    const timerEl = button.parentElement.querySelector('.voice-timer'); timer = setInterval(() => { const elapsed = Date.now() - startedAt; timerEl.textContent = format(Math.floor(elapsed / 1000)); if (elapsed >= MAX_MS) stopRecording(false); }, 250); toast('Recording… tap again to send.');
  } catch (error) { stream?.getTracks().forEach(track => track.stop()); stream = null; toast(error.name === 'NotAllowedError' ? 'Microphone permission was denied.' : 'Could not access the microphone.'); }
}
function install(composer) {
  if (!composer || composer.dataset.voiceInstalled === '1') return; const input = composer.querySelector('input[id$="MessageInput"], #messageInput'); if (!input) return; composer.dataset.voiceInstalled = '1'; styles();
  const button = document.createElement('button'); button.type = 'button'; button.className = 'voice-record'; button.title = 'Voice message'; button.textContent = '🎙';
  const timerEl = document.createElement('span'); timerEl.className = 'voice-timer'; timerEl.textContent = '0:00';
  button.onclick = () => recorder ? stopRecording(false).finally(() => { button.classList.remove('recording'); button.textContent = '🎙'; timerEl.textContent = '0:00'; }) : startRecording(button);
  composer.insertBefore(button, input); composer.insertBefore(timerEl, input); activeComposer = composer;
}
new MutationObserver(() => document.querySelectorAll('.composer').forEach(install)).observe(document.body, { childList: true, subtree: true });
document.querySelectorAll('.composer').forEach(install);
