const chats = [
  { id: 1, name: 'Sarah Johnson', preview: 'Hey, I’ll send it shortly.', time: '10:42', unread: 2, online: true, initial: 'S' },
  { id: 2, name: 'Mohamed Kamara', preview: 'That sounds good 👍', time: '09:31', unread: 1, online: true, initial: 'M' },
  { id: 3, name: 'Main Developers', preview: 'Francis: Check this out', time: '08:15', unread: 0, group: true, initial: 'M' },
  { id: 4, name: 'Aisha Conteh', preview: 'Photo', time: 'Yesterday', unread: 0, online: false, initial: 'A' }
];

const content = document.getElementById('content');
const viewTitle = document.getElementById('viewTitle');
const conversationPanel = document.getElementById('conversationPanel');
const toast = document.getElementById('toast');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function renderChats() {
  viewTitle.textContent = 'Chats';
  content.innerHTML = `
    <label class="search-box"><span>⌕</span><input id="chatSearch" type="search" placeholder="Search conversations" aria-label="Search conversations"></label>
    <div class="section-label">Recent</div>
    <div id="chatList"></div>
  `;
  const list = document.getElementById('chatList');
  const draw = (items) => {
    list.innerHTML = items.length ? items.map(chat => `
      <button class="chat-card" data-chat="${chat.id}">
        <span class="chat-avatar">${chat.initial}${chat.online ? '<i class="online-dot"></i>' : ''}</span>
        <span class="chat-main"><span class="chat-name">${chat.name}</span><span class="chat-preview">${chat.preview}</span></span>
        <span class="chat-meta"><span>${chat.time}</span>${chat.unread ? `<b class="unread">${chat.unread}</b>` : ''}</span>
      </button>
    `).join('') : '<div class="empty-state"><strong>No conversations found</strong>Try another search.</div>';
    list.querySelectorAll('[data-chat]').forEach(button => button.addEventListener('click', () => openChat(Number(button.dataset.chat))));
  };
  draw(chats);
  document.getElementById('chatSearch').addEventListener('input', (event) => {
    const query = event.target.value.trim().toLowerCase();
    draw(chats.filter(chat => chat.name.toLowerCase().includes(query) || chat.preview.toLowerCase().includes(query)));
  });
}

function openChat(id) {
  const chat = chats.find(item => item.id === id);
  if (!chat) return;
  document.querySelectorAll('.chat-card').forEach(item => item.classList.toggle('selected', Number(item.dataset.chat) === id));
  conversationPanel.innerHTML = `
    <div style="height:100%;display:flex;flex-direction:column">
      <header style="height:76px;padding:16px 22px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--border);background:var(--surface)">
        <button class="icon-button" id="closeChat">←</button>
        <div class="chat-avatar" style="width:40px;height:40px">${chat.initial}${chat.online ? '<i class="online-dot"></i>' : ''}</div>
        <div><strong style="display:block;font-size:13px">${chat.name}</strong><small style="color:var(--muted);font-size:10px">${chat.online ? 'Online' : 'Last seen recently'}</small></div>
        <button class="icon-button" style="margin-left:auto" id="chatMore">⋮</button>
      </header>
      <div style="flex:1;padding:26px;display:flex;flex-direction:column;justify-content:flex-end;gap:8px;overflow:auto">
        <div style="align-self:center;color:var(--muted);font-size:10px;margin-bottom:12px">Today</div>
        <div style="align-self:flex-start;max-width:70%;padding:10px 12px;border-radius:13px 13px 13px 4px;background:var(--surface);border:1px solid var(--border);font-size:12px">Hey Francis 👋<br>How are you?</div>
        <div style="align-self:flex-end;max-width:70%;padding:10px 12px;border-radius:13px 13px 4px 13px;background:var(--accent);color:white;font-size:12px">I'm good. You? <small style="opacity:.7">✓✓</small></div>
        <div style="align-self:flex-start;max-width:70%;padding:10px 12px;border-radius:13px 13px 13px 4px;background:var(--surface);border:1px solid var(--border);font-size:12px">${chat.preview}</div>
      </div>
      <form id="messageForm" style="padding:14px 18px;border-top:1px solid var(--border);background:var(--surface);display:flex;gap:8px">
        <button type="button" class="icon-button" id="attachButton">＋</button>
        <input id="messageInput" autocomplete="off" placeholder="Type a message…" style="min-width:0;flex:1;border:0;outline:0;background:var(--surface-2);border-radius:12px;padding:0 13px;color:var(--text);font-size:12px">
        <button type="submit" class="icon-button" style="background:var(--text);color:white">➤</button>
      </form>
    </div>
  `;
  document.getElementById('closeChat').addEventListener('click', () => {
    conversationPanel.innerHTML = '<div class="conversation-empty"><div class="empty-orb">M</div><h2>Select a conversation</h2><p>Your messages will appear here. Pick a chat to continue.</p></div>';
  });
  document.getElementById('attachButton').addEventListener('click', () => showToast('Media attachments will connect to storage in the backend phase.'));
  document.getElementById('chatMore').addEventListener('click', () => showToast('Conversation actions are coming next.'));
  document.getElementById('messageForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = document.getElementById('messageInput');
    if (!input.value.trim()) return;
    showToast('Message queued — Firebase comes next.');
    input.value = '';
  });
}

function renderGeneric(view, title, description, action) {
  viewTitle.textContent = title;
  content.innerHTML = `
    <div class="view-card"><h2>${title}</h2><p>${description}</p><button class="action-button" id="viewAction">${action}</button></div>
    <div class="view-card"><h2>Designed for the next stage</h2><p>Main V1 keeps this surface intentionally lightweight so businesses, jobs, professional profiles, and networking can be added without rebuilding navigation.</p></div>
  `;
  document.getElementById('viewAction').addEventListener('click', () => showToast(`${title} is ready for the next implementation phase.`));
}

function setActive(view) {
  document.querySelectorAll('[data-view]').forEach(item => item.classList.toggle('active', item.dataset.view === view));
}

function navigate(view) {
  setActive(view);
  if (view === 'chats') renderChats();
  else if (view === 'updates') renderGeneric(view, 'Updates', 'Share moments, photos, and short updates with your network.', 'Create update');
  else if (view === 'communities') renderGeneric(view, 'Communities', 'Find and participate in groups around people, interests, and projects.', 'Create community');
  else if (view === 'calls') renderGeneric(view, 'Calls', 'Your audio and video calling history will live here.', 'Start a call');
  else if (view === 'profile') renderGeneric(view, 'Profile', 'Manage your identity, bio, photo, privacy, and connected communities.', 'Edit profile');
}

document.querySelectorAll('[data-view]').forEach(item => item.addEventListener('click', () => navigate(item.dataset.view)));
document.getElementById('searchButton').addEventListener('click', () => {
  navigate('chats');
  setTimeout(() => document.getElementById('chatSearch')?.focus(), 0);
});
document.getElementById('profileButton').addEventListener('click', () => navigate('profile'));
document.getElementById('themeButton').addEventListener('click', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('main-theme', document.body.classList.contains('dark') ? 'dark' : 'light');
});

if (localStorage.getItem('main-theme') === 'dark') document.body.classList.add('dark');
renderChats();
