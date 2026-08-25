import { auth, firestore, collection, query, orderBy, limit, getDocs } from './firebase.js';
import { deleteMessage, toggleReaction, toggleStar, forwardMessage, sendMessage } from './chat-service.js';

const style = document.createElement('style');
style.textContent = `.message-row{position:relative}.message-actions{display:flex;gap:4px;flex-wrap:wrap;margin-top:5px;opacity:.72}.message-actions button{border:0;background:transparent;border-radius:8px;padding:3px 5px;font:inherit;cursor:pointer}.message-actions button:hover{background:rgba(127,127,127,.14)}.message-reply-preview{margin:0 0 7px;padding:7px 10px;border-left:3px solid currentColor;border-radius:7px;background:rgba(127,127,127,.08);font-size:12px;display:flex;justify-content:space-between;gap:8px}.message-reply-preview button{border:0;background:transparent;cursor:pointer}.message-forward-dialog{position:fixed;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.35);z-index:9999}.message-forward-card{width:min(92vw,380px);max-height:70vh;overflow:auto;padding:18px;border-radius:18px;background:var(--panel,#fff);box-shadow:0 18px 60px rgba(0,0,0,.2)}.message-forward-card h3{margin:0 0 12px}.message-forward-item{width:100%;text-align:left;border:0;background:transparent;padding:11px;border-radius:10px;cursor:pointer}.message-forward-item:hover{background:rgba(127,127,127,.1)}`;
document.head.appendChild(style);

let reply = null;
let observer = null;

const toast = message => {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2400);
};

function ensureReplyPreview() {
  const composer = document.querySelector('.composer');
  if (!composer) return;
  let preview = document.getElementById('messageReplyPreview');
  if (!reply) {
    preview?.remove();
    return;
  }
  if (!preview) {
    preview = document.createElement('div');
    preview.id = 'messageReplyPreview';
    preview.className = 'message-reply-preview';
    composer.prepend(preview);
  }
  preview.innerHTML = `<span><strong>Replying</strong><br>${escapeText(reply.text || `[${reply.type || 'message'}]`)}</span><button type="button" aria-label="Cancel reply">×</button>`;
  preview.querySelector('button').onclick = () => { reply = null; ensureReplyPreview(); };
}

function escapeText(value) {
  return String(value ?? '').replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[c]));
}

function decorateMessages() {
  const container = document.getElementById('messages');
  const messages = window.__mainActiveMessages || [];
  if (!container || !messages.length) return;
  [...container.querySelectorAll('.message-row')].forEach((row, index) => {
    if (row.querySelector('.message-actions')) return;
    const message = messages[index];
    if (!message) return;
    row.dataset.messageId = message.id;
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    const own = message.senderId === auth.currentUser?.uid;
    actions.innerHTML = `<button type="button" data-action="reply">↩</button><button type="button" data-action="react">☺</button><button type="button" data-action="copy">⧉</button><button type="button" data-action="forward">↗</button><button type="button" data-action="star">☆</button>${own ? '<button type="button" data-action="delete">⌫</button>' : ''}`;
    actions.querySelectorAll('button').forEach(button => button.addEventListener('click', () => handleAction(button.dataset.action, message)));
    row.appendChild(actions);
  });
  ensureReplyPreview();
}

async function chooseForwardTarget(message) {
  if (!firestore || !auth.currentUser) return;
  const snapshot = await getDocs(query(collection(firestore, 'userConversations', auth.currentUser.uid, 'items'), orderBy('updatedAt', 'desc'), limit(30)));
  const items = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  if (!items.length) return toast('No other conversations are available.');
  const overlay = document.createElement('div');
  overlay.className = 'message-forward-dialog';
  const card = document.createElement('div');
  card.className = 'message-forward-card';
  card.innerHTML = '<h3>Forward message</h3><p>Select a conversation.</p>';
  items.filter(item => item.id !== window.__mainActiveChatId).forEach(item => {
    const button = document.createElement('button');
    button.className = 'message-forward-item';
    button.type = 'button';
    button.textContent = item.type === 'group' ? (item.groupName || 'Group') : (item.otherName || 'Conversation');
    button.onclick = async () => {
      button.disabled = true;
      try {
        await forwardMessage(window.__mainActiveChatId, message.id, item.id);
        overlay.remove();
        toast('Message forwarded.');
      } catch (error) { button.disabled = false; toast(error.message || 'Could not forward message.'); }
    };
    card.appendChild(button);
  });
  const close = document.createElement('button');
  close.type = 'button'; close.textContent = 'Cancel'; close.className = 'message-forward-item'; close.onclick = () => overlay.remove();
  card.appendChild(close); overlay.appendChild(card); document.body.appendChild(overlay);
}

async function handleAction(action, message) {
  const chatId = window.__mainActiveChatId;
  if (!chatId) return;
  try {
    if (action === 'reply') { reply = message; ensureReplyPreview(); document.getElementById('messageInput')?.focus(); return; }
    if (action === 'react') { const emoji = prompt('Reaction emoji', '❤️'); if (emoji) await toggleReaction(chatId, message.id, emoji.trim().slice(0, 8)); return; }
    if (action === 'copy') { await navigator.clipboard.writeText(message.text || ''); toast('Message copied.'); return; }
    if (action === 'star') { await toggleStar(chatId, message.id); toast('Saved.'); return; }
    if (action === 'delete') { if (confirm('Delete this message?')) { await deleteMessage(chatId, message.id); toast('Message deleted.'); } return; }
    if (action === 'forward') { await chooseForwardTarget(message); }
  } catch (error) { toast(error.message || 'Message action failed.'); }
}

document.addEventListener('submit', async event => {
  if (!reply || !event.target?.matches('#messageForm')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const input = document.getElementById('messageInput');
  const text = input?.value.trim();
  if (!text || !window.__mainActiveChatId) return;
  const pending = reply;
  try {
    await sendMessage(window.__mainActiveChatId, text, { replyTo: { messageId: pending.id, senderId: pending.senderId, text: pending.text || '' } });
    input.value = '';
    reply = null;
    ensureReplyPreview();
    toast('Reply sent.');
  } catch (error) { toast(error.message || 'Reply could not be sent.'); }
}, true);

document.addEventListener('click', event => {
  if (event.target.closest('#messageInput')) ensureReplyPreview();
});

observer = new MutationObserver(() => decorateMessages());
observer.observe(document.body, { childList: true, subtree: true });
