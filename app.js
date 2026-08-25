import { configured, auth, db, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile, ref, set, serverTimestamp } from './firebase.js';
import { sendMessage, ensureDirectChat, watchUserChats, watchPublicProfiles, watchMessages, watchPresence, watchTyping, updatePresence, markTyping, markRead, conversationId } from './chat-service.js';

const $ = id => document.getElementById(id);
const state = { authMode: 'login', stops: {}, typingTimer: null, sending: false };
const esc = value => String(value ?? '').replace(/[&<>\"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[char]));
const toast = message => { const el = $('toast'); if (!el) return; el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2400); };
const stop = key => { if (typeof state.stops[key] === 'function') state.stops[key](); state.stops[key] = null; };
function cleanup() { Object.keys(state.stops).forEach(stop); clearTimeout(state.typingTimer); state.typingTimer = null; }
function authError(error) {
  return ({
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/email-already-in-use': 'That email is already registered.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Use a stronger password.',
    'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
    'auth/operation-not-allowed': 'Email/password sign-in is not enabled in Firebase.',
    'auth/network-request-failed': 'Network error. Check your connection and try again.'
  }[error?.code] || 'Something went wrong. Please try again.');
}
function setAuthMode(mode) {
  state.authMode = mode;
  const signup = mode === 'signup';
  $('authTitle').textContent = signup ? 'Create your account' : 'Welcome back';
  $('authSubtitle').textContent = signup ? 'Create your Main account.' : 'Sign in to continue.';
  $('nameField').hidden = !signup;
  $('nameInput').required = signup;
  $('authSubmit').textContent = signup ? 'Create account' : 'Sign in';
  $('authSwitch').textContent = signup ? 'Already have an account? Sign in' : 'Create an account';
  $('authError').textContent = '';
}
async function handleAuth(event) {
  event.preventDefault();
  const email = $('emailInput').value.trim();
  const password = $('passwordInput').value;
  const name = $('nameInput').value.trim();
  $('authSubmit').disabled = true;
  try {
    if (!configured) throw Error('Firebase is not configured.');
    if (state.authMode === 'signup') {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      if (name) await updateProfile(credential.user, { displayName: name });
      const displayName = name || email.split('@')[0];
      await set(ref(db, `users/${credential.user.uid}`), { uid: credential.user.uid, email: credential.user.email, displayName, createdAt: serverTimestamp() });
      await set(ref(db, `publicProfiles/${credential.user.uid}`), { uid: credential.user.uid, email: credential.user.email, displayName, photoURL: credential.user.photoURL || '', mood: '' });
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (error) {
    $('authError').textContent = error.message === 'Firebase is not configured.' ? error.message : authError(error);
  } finally {
    $('authSubmit').disabled = false;
  }
}
async function saveLocation() {
  const user = auth.currentUser;
  if (!user || !navigator.geolocation) return false;
  return new Promise(resolve => navigator.geolocation.getCurrentPosition(async position => {
    try { await set(ref(db, `publicProfiles/${user.uid}/location`), { lat: +position.coords.latitude.toFixed(2), lng: +position.coords.longitude.toFixed(2) }); resolve(true); }
    catch { resolve(false); }
  }, () => resolve(false), { enableHighAccuracy: false, maximumAge: 300000, timeout: 8000 }));
}
function distance(a, b) {
  if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(a.lng) || !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return null;
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians;
  const dLng = (b.lng - a.lng) * radians;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function showAuth() { cleanup(); document.body.classList.remove('chat-open'); $('authScreen').hidden = false; $('app').hidden = true; }
function showApp(user) { $('authScreen').hidden = true; $('app').hidden = false; $('profileButton').textContent = (user.displayName || user.email || 'M').charAt(0).toUpperCase(); updatePresence(true).catch(() => {}); saveLocation(); navigate('chats'); }
function emptyConversation() { stop('messages'); stop('presence'); stop('typing'); document.body.classList.remove('chat-open'); $('conversationPanel').innerHTML = '<div class="conversation-empty"><div class="empty-orb">M</div><h2>Your conversations</h2><p>Select a conversation to start messaging.</p></div>'; }

function renderChats() {
  cleanup();
  document.body.classList.remove('chat-open');
  $('viewTitle').textContent = 'Chats';
  $('content').innerHTML = '<div class="search-box"><span>⌕</span><input id="chatSearch" type="search" placeholder="Search people or conversations"></div><div class="section-heading"><span>Chats</span><button id="explorePeopleButton" type="button">Explore people</button></div><div id="chatList"><div class="empty-state"><strong>Loading your conversations…</strong><span>Connecting to Main.</span></div></div>';
  const list = $('chatList');
  const search = $('chatSearch');
  let chats = [];
  const draw = () => {
    const query = search.value.trim().toLowerCase();
    const items = chats.filter(chat => `${chat.otherName || ''} ${chat.groupName || ''} ${chat.lastMessage || ''}`.toLowerCase().includes(query));
    list.innerHTML = items.length ? items.map(chat => {
      const name = chat.type === 'group' ? (chat.groupName || 'Group') : (chat.otherName || 'Main user');
      return `<button class="chat-card" data-chat="${esc(chat.chatId)}" type="button"><span class="chat-avatar">${esc(name.charAt(0).toUpperCase())}</span><span class="chat-main"><span class="chat-name">${esc(name)}</span><span class="chat-preview">${esc(chat.lastMessage || 'No messages yet')}</span></span>${chat.unreadCount ? `<span class="unread-badge">${chat.unreadCount}</span>` : ''}</button>`;
    }).join('') : '<div class="empty-state"><strong>No conversations</strong><span>Start a real conversation from Explore people.</span></div>';
    list.querySelectorAll('[data-chat]').forEach(button => { button.onclick = () => openChat(items.find(chat => chat.chatId === button.dataset.chat)); });
  };
  state.stops.chats = watchUserChats(auth.currentUser.uid, value => { chats = Object.values(value || {}).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); draw(); });
  search.oninput = draw;
  $('explorePeopleButton').onclick = renderExplore;
  emptyConversation();
}

function renderExplore() {
  cleanup();
  document.body.classList.remove('chat-open');
  $('viewTitle').textContent = 'Explore people';
  $('content').innerHTML = '<button class="back-link" id="backToChats" type="button">← Chats</button><div class="search-box"><span>⌕</span><input id="exploreSearch" type="search" placeholder="Search people"></div><div class="explore-tabs"><button class="explore-tab active" data-mode="all" type="button">All people</button><button class="explore-tab" data-mode="nearby" type="button">Nearby</button></div><p id="exploreInfo" class="explore-info">Showing real Main accounts.</p><div id="exploreList"><div class="empty-state"><strong>Loading people…</strong></div></div>';
  $('backToChats').onclick = () => navigate('chats');
  const list = $('exploreList');
  const search = $('exploreSearch');
  const info = $('exploreInfo');
  let profiles = {};
  let mode = 'all';
  const draw = () => {
    let people = Object.values(profiles).filter(user => user.uid !== auth.currentUser.uid && `${user.displayName || ''} ${user.email || ''}`.toLowerCase().includes(search.value.trim().toLowerCase()));
    if (mode === 'nearby') {
      const me = profiles[auth.currentUser.uid]?.location;
      if (!me) { list.innerHTML = '<div class="empty-state"><strong>Location permission required</strong><span>Allow location access to find nearby accounts.</span></div>'; return; }
      people = people.map(user => ({ ...user, distance: distance(me, user.location) })).filter(user => user.distance !== null && user.distance <= 50).sort((a, b) => a.distance - b.distance);
      info.textContent = 'Showing accounts within 50 km of your approximate location.';
    } else info.textContent = 'Showing people with a Main account.';
    list.innerHTML = people.length ? people.map(user => `<button class="chat-card" data-user="${esc(user.uid)}" type="button"><span class="chat-avatar">${esc((user.displayName || 'M').charAt(0).toUpperCase())}</span><span class="chat-main"><span class="chat-name">${esc(user.displayName || 'Main user')}</span><span class="chat-preview">${user.mood ? esc(user.mood) : 'Main user'}</span></span><span class="chat-meta">${mode === 'nearby' ? `${user.distance < 1 ? '<1' : user.distance.toFixed(1)} km` : 'Chat'}</span></button>`).join('') : '<div class="empty-state"><strong>No people found</strong><span>No matching real accounts were found.</span></div>';
    list.querySelectorAll('[data-user]').forEach(button => { button.onclick = () => openChat(people.find(user => user.uid === button.dataset.user)); });
  };
  state.stops.profiles = watchPublicProfiles(value => { profiles = value || {}; draw(); });
  search.oninput = draw;
  document.querySelectorAll('.explore-tab').forEach(button => {
    button.onclick = async () => {
      mode = button.dataset.mode;
      document.querySelectorAll('.explore-tab').forEach(tab => tab.classList.toggle('active', tab === button));
      if (mode === 'nearby' && !profiles[auth.currentUser.uid]?.location) await saveLocation();
      draw();
    };
  });
}

function openChat(user) {
  if (!user || !auth.currentUser) return;
  cleanup();
  document.body.classList.add('chat-open');
  const uid = auth.currentUser.uid;
  const chatId = conversationId(uid, user.uid);
  const panel = $('conversationPanel');
  panel.innerHTML = `<div class="live-chat"><header class="chat-header"><button class="icon-button" id="closeChat" type="button" aria-label="Back">←</button><div class="chat-avatar small-avatar">${esc((user.displayName || 'M').charAt(0).toUpperCase())}</div><div class="chat-identity"><strong>${esc(user.displayName || 'Main user')}</strong><small id="chatPresence">Checking status…</small></div></header><div class="messages" id="messages"><div class="empty-state"><strong>Loading messages…</strong></div></div><div id="newMessageIndicator" class="new-message-indicator" hidden>New message</div><form class="composer" id="messageForm"><input id="messageInput" autocomplete="off" maxlength="4000" placeholder="Message" aria-label="Message"><button class="send-button" type="submit" aria-label="Send">➤</button></form></div>`;
  $('closeChat').onclick = emptyConversation;
  const messages = $('messages');
  let nearBottom = true;
  messages.addEventListener('scroll', () => { nearBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 96; });
  state.stops.messages = watchMessages(chatId, items => {
    messages.innerHTML = items.length ? items.map(message => `<div class="message-row ${message.senderId === uid ? 'mine' : ''}"><div class="message-bubble">${esc(message.text)}<small>${message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending…'} ${message.senderId === uid ? (message.readBy && Object.keys(message.readBy).length > 1 ? '✓✓' : '✓') : ''}</small></div></div>`).join('') : '<div class="empty-state"><strong>No messages yet</strong><span>Send a message to start this conversation.</span></div>';
    const last = items.at(-1);
    if (last && last.senderId !== uid) markRead(chatId, last.id).catch(() => {});
    if (nearBottom || !last) messages.scrollTop = messages.scrollHeight;
    else $('newMessageIndicator').hidden = false;
  });
  $('newMessageIndicator').onclick = () => { messages.scrollTop = messages.scrollHeight; $('newMessageIndicator').hidden = true; };
  state.stops.presence = watchPresence(user.uid, presence => { $('chatPresence').textContent = presence?.online ? 'Online' : presence?.lastSeen ? `Last seen ${new Date(presence.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Offline'; });
  state.stops.typing = watchTyping(chatId, user.uid, typing => { if (typing) $('chatPresence').textContent = 'Typing…'; });
  const input = $('messageInput');
  $('messageForm').onsubmit = async event => {
    event.preventDefault();
    if (state.sending) return;
    const text = input.value.trim();
    if (!text) return;
    state.sending = true;
    try {
      await ensureDirectChat(user);
      await sendMessage(chatId, text);
      input.value = '';
      await markTyping(chatId, false);
    } catch (error) { toast(error.message || 'Message could not be sent.'); }
    finally { state.sending = false; input.focus(); }
  };
  input.oninput = () => {
    if (!input.value.trim()) return;
    markTyping(chatId, true).catch(() => {});
    clearTimeout(state.typingTimer);
    state.typingTimer = setTimeout(() => markTyping(chatId, false).catch(() => {}), 650);
  };
}

function renderMood() {
  cleanup();
  document.body.classList.remove('chat-open');
  $('viewTitle').textContent = 'Mood';
  $('content').innerHTML = '<div class="mood-card"><div><p class="eyebrow">YOUR MOOD</p><h2 id="myMood">Loading…</h2><p>Your mood is shared through your Main profile.</p></div><button class="primary-button" id="setMoodButton" type="button">Set mood</button></div><div class="section-label">People</div><div id="moodList"></div>';
  const list = $('moodList');
  state.stops.profiles = watchPublicProfiles(profiles => {
    const me = profiles[auth.currentUser.uid];
    $('myMood').textContent = me?.mood || 'No mood set';
    const people = Object.values(profiles || {}).filter(user => user.uid !== auth.currentUser.uid && user.mood);
    if (!people.length) {
      list.innerHTML = '<div class="empty-state"><strong>No shared moods yet</strong></div>';
      return;
    }
    list.innerHTML = people.map(user => `<button class="chat-card" data-mood="${esc(user.uid)}" type="button"><span class="chat-avatar">${esc((user.displayName || 'M').charAt(0).toUpperCase())}</span><span class="chat-main"><span class="chat-name">${esc(user.displayName || 'Main user')}</span><span class="chat-preview">${esc(user.mood)}</span></span></button>`).join('');
    list.querySelectorAll('[data-mood]').forEach(button => { button.onclick = () => openChat(people.find(user => user.uid === button.dataset.mood)); });
  });
  $('setMoodButton').onclick = async () => {
    const value = prompt('What is your mood?', '');
    if (value === null) return;
    try { await set(ref(db, `publicProfiles/${auth.currentUser.uid}/mood`), value.trim().slice(0, 80)); toast('Mood updated.'); }
    catch { toast('Could not update your mood.'); }
  };
}

function renderProfile() {
  cleanup();
  document.body.classList.remove('chat-open');
  $('viewTitle').textContent = 'Profile';
  const user = auth.currentUser;
  $('content').innerHTML = `<div class="profile-card"><div class="profile-avatar">${esc((user?.displayName || user?.email || 'M').charAt(0).toUpperCase())}</div><h2>${esc(user?.displayName || 'Main user')}</h2><p>${esc(user?.email || '')}</p><div class="profile-status">Signed in</div><button class="primary-button" id="signOutButton" type="button">Sign out</button></div>`;
  $('signOutButton').onclick = () => signOut(auth);
}

function navigate(view) {
  document.querySelectorAll('[data-view]').forEach(item => item.classList.toggle('active', item.dataset.view === view));
  if (view === 'chats') renderChats();
  else if (view === 'mood') renderMood();
  else if (view === 'profile') renderProfile();
}

document.querySelectorAll('[data-view]').forEach(item => { item.onclick = () => navigate(item.dataset.view); });
$('authForm').onsubmit = handleAuth;
$('authSwitch').onclick = () => setAuthMode(state.authMode === 'login' ? 'signup' : 'login');
$('profileButton').onclick = () => navigate('profile');
$('searchButton')?.addEventListener('click', () => navigate('chats'));
$('desktopSearchButton')?.addEventListener('click', () => navigate('chats'));
if (localStorage.getItem('main-theme') === 'dark') document.body.classList.add('dark');

if (!configured) {
  $('firebaseStatus').textContent = 'Firebase setup required.';
  showAuth();
} else {
  $('firebaseStatus').textContent = 'Firebase authentication ready.';
  onAuthStateChanged(auth, user => user ? showApp(user) : showAuth());
}
