import { auth } from './firebase.js';
import { ensureDirectChat } from './chat-service.js';
import { searchUsers, searchConversations, searchMessages } from './search-service.js';

const style = document.createElement('style'); style.textContent = `.search-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:10000;display:grid;place-items:start center;padding:7vh 14px}.search-card{width:min(680px,100%);max-height:80vh;overflow:auto;background:var(--panel,#fff);border-radius:20px;padding:18px;box-shadow:0 24px 70px rgba(0,0,0,.22)}.search-head{display:flex;gap:8px}.search-head input{flex:1}.search-results{margin-top:12px;display:grid;gap:6px}.search-result{width:100%;text-align:left;border:0;background:transparent;padding:11px;border-radius:10px;cursor:pointer}.search-result:hover{background:rgba(127,127,127,.1)}.search-tabs{display:flex;gap:6px;margin-top:10px}.search-tabs button{border:0;border-radius:10px;padding:7px 10px;cursor:pointer;background:rgba(127,127,127,.1)}.search-empty{padding:20px;text-align:center;opacity:.7}`; document.head.appendChild(style);
let overlay = null;
function esc(value) { return String(value ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c])); }
function openSearch() {
  if (overlay) return; overlay = document.createElement('div'); overlay.className = 'search-overlay';
  overlay.innerHTML = `<div class="search-card"><div class="search-head"><input id="mainSearchInput" placeholder="Search people, conversations or messages" autocomplete="off"><button id="searchClose" type="button">×</button></div><div class="search-tabs"><button data-search-kind="users">People</button><button data-search-kind="conversations">Chats</button><button data-search-kind="messages">Messages</button></div><div id="mainSearchResults" class="search-results"><div class="search-empty">Start typing to search.</div></div></div>`;
  document.body.appendChild(overlay); overlay.querySelector('#searchClose').onclick = closeSearch; overlay.addEventListener('click', event => { if (event.target === overlay) closeSearch(); });
  const input = overlay.querySelector('#mainSearchInput'); let kind = 'users'; let timer;
  overlay.querySelectorAll('[data-search-kind]').forEach(button => button.onclick = () => { kind = button.dataset.searchKind; run(); });
  input.oninput = () => { clearTimeout(timer); timer = setTimeout(run, 220); }; input.focus();
  async function run() {
    const term = input.value.trim(); const result = overlay.querySelector('#mainSearchResults'); if (!term) { result.innerHTML = '<div class="search-empty">Start typing to search.</div>'; return; }
    result.innerHTML = '<div class="search-empty">Searching…</div>';
    try {
      const items = kind === 'users' ? await searchUsers(term) : kind === 'conversations' ? await searchConversations(term) : window.__mainActiveChatId ? await searchMessages(window.__mainActiveChatId, term) : [];
      if (!items.length) { result.innerHTML = '<div class="search-empty">No results.</div>'; return; }
      result.innerHTML = items.map(item => {
        if (kind === 'users') return `<button class="search-result" data-user="${esc(item.uid)}"><strong>${esc(item.displayName || item.username || 'Main user')}</strong><br><small>@${esc(item.username || '')}</small></button>`;
        if (kind === 'messages') return `<button class="search-result" data-message="${esc(item.id)}"><strong>${esc(item.text || `[${item.type || 'message'}]`)}</strong></button>`;
        return `<button class="search-result" data-chat="${esc(item.chatId)}"><strong>${esc(item.type === 'group' ? item.groupName || 'Group' : item.otherName || 'Conversation')}</strong><br><small>${esc(item.lastMessage || '')}</small></button>`;
      }).join('');
      result.querySelectorAll('[data-user]').forEach(button => button.onclick = async () => { const user = items.find(item => item.uid === button.dataset.user); if (!user || !auth.currentUser) return; try { const chatId = await ensureDirectChat(user); closeSearch(); setTimeout(() => document.querySelector(`[data-chat="${CSS.escape(chatId)}"]`)?.click(), 400); } catch (error) { result.innerHTML = `<div class="search-empty">${esc(error.message || 'Could not start chat.')}</div>`; } });
      result.querySelectorAll('[data-chat]').forEach(button => button.onclick = () => { closeSearch(); document.querySelector(`[data-chat="${CSS.escape(button.dataset.chat)}"]`)?.click(); });
      result.querySelectorAll('[data-message]').forEach(button => button.onclick = () => { closeSearch(); document.querySelector(`[data-message-id="${CSS.escape(button.dataset.message)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    } catch (error) { result.innerHTML = `<div class="search-empty">${esc(error.message || 'Search failed.')}</div>`; }
  }
}
function closeSearch() { overlay?.remove(); overlay = null; }
document.addEventListener('click', event => { if (event.target.closest('#searchButton, #desktopSearchButton')) { event.preventDefault(); openSearch(); } });
