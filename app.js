import {
  configured, auth, db, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, updateProfile, ref, set, serverTimestamp
} from './firebase.js';
import {
  sendMessage, ensureDirectChat, watchUserChats, watchPublicProfiles,
  watchMessages, watchPresence, watchTyping, updatePresence, markTyping,
  markRead, conversationId, watchChat
} from './chat-service.js';

const $ = id => document.getElementById(id);
const content = $('content');
const viewTitle = $('viewTitle');
const panel = $('conversationPanel');
const toast = $('toast');
const authScreen = $('authScreen');
const app = $('app');

let authMode = 'login';
let stopChats = null;
let stopProfiles = null;
let stopMessages = null;
let stopPresence = null;
let stopTyping = null;
let typingTimer = null;

const esc = value => String(value ?? '').replace(/[&<>\"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;'
}[char]));

function toastMsg(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastMsg.timer);
  toastMsg.timer = setTimeout(() => toast.classList.remove('show'), 2400);
}

function timeAgo(value) {
  if (!value) return '';
  const minutes = Math.floor((Date.now() - Number(value)) / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d` : new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

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

function cleanupConversation() {
  [stopMessages, stopPresence, stopTyping].forEach(stop => typeof stop === 'function' && stop());
  stopMessages = stopPresence = stopTyping = null;
  clearTimeout(typingTimer);
  typingTimer = null;
}

function cleanup() {
  cleanupConversation();
  [stopChats, stopProfiles].forEach(stop => typeof stop === 'function' && stop());
  stopChats = stopProfiles = null;
}

function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === 'signup';
  $('authTitle').textContent = signup ? 'Create your account' : 'Welcome back';
  $('authSubtitle').textContent = signup ? 'Create your Main account.' : 'Sign in to continue.';
  $('nameField').hidden = !signup;
  $('nameInput').required = signup;
  $('passwordInput').autocomplete = signup ? 'new-password' : 'current-password';
  $('authSubmit').textContent = signup ? 'Create account' : 'Sign in';
  $('authSwitch').textContent = signup ? 'Already have an account? Sign in' : 'Create an account';
  $('authError').textContent = '';
}

async function saveLocation() {
  const user = auth.currentUser;
  if (!user || !navigator.geolocation) return false;
  return new Promise(resolve => navigator.geolocation.getCurrentPosition(async position => {
    try {
      const location = {
        lat: Number(position.coords.latitude.toFixed(2)),
        lng: Number(position.coords.longitude.toFixed(2))
      };
      await set(ref(db, `publicProfiles/${user.uid}/location`), location);
      resolve(true);
    } catch {
      resolve(false);
    }
  }, () => resolve(false), { enableHighAccuracy: false, maximumAge: 300000, timeout: 8000 }));
}

function distanceKm(a, b) {
  if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(a.lng) || !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return null;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function handleAuth(event) {
  event.preventDefault();
  const email = $('emailInput').value.trim();
  const password = $('passwordInput').value;
  const name = $('nameInput').value.trim();
  $('authSubmit').disabled = true;
  $('authError').textContent = '';
  try {
    if (!configured) throw new Error('Firebase is not configured.');
    if (authMode === 'signup') {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      if (name) await updateProfile(credential.user, { displayName: name });
      const displayName = name || email.split('@')[0];
      await set(ref(db, `users/${credential.user.uid}`), {
        uid: credential.user.uid,
        email: credential.user.email,
        displayName,
        createdAt: serverTimestamp()
      });
      await set(ref(db, `publicProfiles/${credential.user.uid}`), {
        uid: credential.user.uid,
        email: credential.user.email,
        displayName,
        photoURL: credential.user.photoURL || '',
        mood: ''
      });
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (error) {
    $('authError').textContent = error.message === 'Firebase is not configured.' ? error.message : authError(error);
  } finally {
    $('authSubmit').disabled = false;
  }
}

function showAuth() {
  cleanup();
  document.body.classList.remove('chat-open');
  authScreen.hidden = false;
  app.hidden = true;
}

function showApp(user) {
  authScreen.hidden = true;
  app.hidden = false;
  $('profileButton').textContent = (user?.displayName || user?.email || 'M').charAt(0).toUpperCase();
  updatePresence(true).catch(() => {});
  saveLocation();
  navigate('chats');
}

function emptyConversation() {
  cleanupConversation();
  document.body.classList.remove('chat-open');
  panel.innerHTML = '<div class="conversation-empty"><div class="empty-orb">M</div><h2>Your conversations</h2><p>Select a conversation from your chats to start messaging.</p></div>';
}

function renderChats() {
  cleanup();
  document.body.classList.remove('chat-open');
  viewTitle.textContent = 'Chats';
  content.innerHTML = `
    <div class="search-box"><span>⌕</span><input id="chatSearch" type="search" placeholder="Search people or conversations" aria-label="Search people or conversations"></div>
    <div class="section-heading"><span>Chats</span><button id="explorePeopleButton" type="button">Explore people</button></div>
    <div id="chatList"><div class="empty-state"><strong>Loading your conversations…</strong><span>Connecting to Main.</span></div></div>`;

  const list = $('chatList');
  const search = $('chatSearch');
  let entries = [];

  const draw = query => {
    const items = entries.filter(chat => `${chat.otherName || ''} ${chat.groupName || ''} ${chat.lastMessage || ''}`.toLowerCase().includes(query));
    list.innerHTML = items.length ? items.map(chat => {
      const name = chat.type === 'group' ? (chat.groupName || 'Group') : (chat.otherName || 'Main user');
      return `<button class="chat-card" data-chat="${esc(chat.chatId)}">
        <span class="chat-avatar">${esc(name.charAt(0).toUpperCase())}</span>
        <span class="chat-main"><span class="chat-name">${esc(name)}</span><span class="chat-preview">${esc(chat.lastMessage || 'No messages yet')}</span></span>
        <span class="chat-meta">${timeAgo(chat.updatedAt)}</span>
      </button>`;
    }).join('') : '<div class="empty-state"><strong>No conversations</strong><span>Start a real conversation with someone on Main.</span></div>';
    list.querySelectorAll('[data-chat]').forEach(button => button.onclick = () => openConversation(items.find(item => item.chatId === button.dataset.chat)));
  };

  stopChats = watchUserChats(auth.currentUser.uid, chats => {
    entries = Object.values(chats || {}).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    draw(search.value.trim().toLowerCase());
  });
  search.oninput = () => draw(search.value.trim().toLowerCase());
  $('explorePeopleButton').onclick = renderExplore;
}

function renderExplore() {
  cleanup();
  document.body.classList.remove('chat-open');
  viewTitle.textContent = 'Explore people';
  content.innerHTML = `
    <button class="back-link" id="backToChats" type="button">← Chats</button>
    <div class="search-box"><span>⌕</span><input id="exploreSearch" type="search" placeholder="Search people" aria-label="Search people"></div>
    <div class="explore-tabs"><button class="explore-tab active" data-mode="all" type="button">All people</button><button class="explore-tab" data-mode="nearby" type="button">Nearby</button></div>
    <p id="exploreInfo" class="explore-info">Showing people with a Main account.</p>
    <div id="exploreList"><div class="empty-state"><strong>Loading people…</strong><span>Connecting to Main.</span></div></div>`;
  panel.innerHTML = '<div class="conversation-empty"><div class="empty-orb">M</div><h2>Explore people</h2><p>Find real Main accounts and start a conversation.</p></div>';
  $('backToChats').onclick = renderChats;

  const list = $('exploreList');
  const search = $('exploreSearch');
  const info = $('exploreInfo');
  let profiles = {};
  let mode = 'all';

  const draw = () => {
    const query = search.value.trim().toLowerCase();
    let people = Object.values(profiles).filter(person => person.uid !== auth.currentUser.uid && `${person.displayName || ''} ${person.email || ''}`.toLowerCase().includes(query));
    if (mode === 'nearby') {
      const me = profiles[auth.currentUser.uid]?.location;
      if (!me) {
        list.innerHTML = '<div class="empty-state"><strong>Location is needed for Nearby</strong><span>Allow location access and try Nearby again.</span></div>';
        info.textContent = 'Nearby uses your approximate device location.';
        return;
      }
      people = people.map(person => ({ ...person, distance: distanceKm(me, person.location) })).filter(person => person.distance !== null && person.distance <= 50).sort((a, b) => a.distance - b.distance);
      info.textContent = 'Showing accounts within 50 km of your approximate location.';
    } else {
      info.textContent = 'Showing people with a Main account.';
    }
    list.innerHTML = people.length ? people.map(person => `<button class="chat-card" data-user="${esc(person.uid)}">
      <span class="chat-avatar">${esc((person.displayName || 'M').charAt(0).toUpperCase())}</span>
      <span class="chat-main"><span class="chat-name">${esc(person.displayName || 'Main user')}</span><span class="chat-preview">${person.mood ? esc(person.mood) : 'Main user'}</span></span>
      <span class="chat-meta">${mode === 'nearby' ? `${person.distance < 1 ? '<1' : person.distance.toFixed(1)} km` : 'Chat'}</span>
    </button>`).join('') : '<div class="empty-state"><strong>No people found</strong><span>There are no matching Main accounts.</span></div>';
    list.querySelectorAll('[data-user]').forEach(button => button.onclick = () => openConversation(people.find(person => person.uid === button.dataset.user)));
  };

  stopProfiles = watchPublicProfiles(value => { profiles = value || {}; draw(); });
  search.oninput = draw;
  document.querySelectorAll('.explore-tab').forEach(button => button.onclick = async () => {
    mode = button.dataset.mode;
    document.querySelectorAll('.explore-tab').forEach(tab => tab.classList.toggle('active', tab === button));
    if (mode === 'nearby' && !profiles[auth.currentUser.uid]?.location) await saveLocation();
    draw();
  });
}

function renderMood() {
  cleanup();
  document.body.classList.remove('chat-open');
  viewTitle.textContent = 'Mood';
  content.innerHTML = `<div class="mood-card"><div><p class="eyebrow">YOUR MOOD</p><h2 id="myMood">Loading…</h2><p>Your current mood is shared through your Main profile.</p></div><button class="primary-button mood-button" id="setMoodButton" type="button">Set mood</button></div><div class="section-label">People</div><div id="moodList"><div class="empty-state"><strong>Loading moods…</strong></div></div>`;
  panel.innerHTML = '<div class="conversation-empty"><div class="empty-orb">M</div><h2>Mood</h2><p>See the moods people have chosen to share.</p></div>';
  const list = $('moodList');
  stopProfiles = watchPublicProfiles(profiles => {
    const me = profiles[auth.currentUser.uid];
    $('myMood').textContent = me?.mood || 'No mood set';
    const people = Object.values(profiles).filter(person => person.uid !== auth.currentUser.uid && person.mood);
    list.innerHTML = people.length ? people.map(person => `<button class="chat-card" data-mood-user="${esc(person.uid)}"><span class="chat-avatar">${esc((person.displayName || 'M').charAt(0).toUpperCase())}</span><span class="chat-main"><span class="chat-name">${esc(person.displayName || 'Main user')}</span><span class="chat-preview">${esc(person.mood)}</span></span></button>`).join('') : '<div class="empty-state"><strong>No shared moods yet</strong><span>When people choose a mood, it will appear here.</span></div>';
    list.querySelectorAll('[data-mood-user]').forEach(button => button.onclick = () => openConversation(people.find(person => person.uid === button.dataset.moodUser)));
  });
  $('setMoodButton').onclick = async () => {
    const value = window.prompt('What is your mood?', '');
    if (value === null) return;
    try {
      await set(ref(db, `publicProfiles/${auth.currentUser.uid}/mood`), value.trim().slice(0, 80));
      toastMsg('Mood updated.');
    } catch {
      toastMsg('Could not update your mood.');
    }
  };
}

function renderProfile() {
  cleanup();
  document.body.classList.remove('chat-open');
  viewTitle.textContent = 'Profile';
  const user = auth.currentUser;
  content.innerHTML = `<div class="profile-card"><div class="profile-avatar">${esc((user?.displayName || user?.email || 'M').charAt(0).toUpperCase())}</div><h2>${esc(user?.displayName || 'Main user')}</h2><p>${esc(user?.email || '')}</p><div class="profile-status">Signed in</div><button class="primary-button" id="signOutButton" type="button">Sign out</button></div>`;
  panel.innerHTML = '<div class="conversation-empty"><div class="empty-orb">M</div><h2>Your profile</h2><p>Your Main account is signed in on this device.</p></div>';
  $('signOutButton').onclick = async () => { try { await signOut(auth); } catch { toastMsg('Could not sign out.'); } };
}

function openConversation(chat) {
  if (!chat || !auth.currentUser) return;
  if (chat.type === 'group') return openGroupChat(chat);
  const other = chat.otherUid ? { uid: chat.otherUid, displayName: chat.otherName } : chat;
  openDirectChat(other);
}

function openDirectChat(user) {
  if (!user?.uid || !auth.currentUser || user.uid === auth.currentUser.uid) return;
  cleanupConversation();
  document.body.classList.add('chat-open');
  const myUid = auth.currentUser.uid;
  const chatId = conversationId(myUid, user.uid);
  panel.innerHTML = `<div class="live-chat"><header class="chat-header"><button class="icon-button" id="closeChat" aria-label="Back to chats">←</button><div class="chat-avatar small-avatar">${esc((user.displayName || 'M').charAt(0).toUpperCase())}</div><div class="chat-identity"><strong>${esc(user.displayName || 'Main user')}</strong><small id="chatPresence">Checking status…</small></div></header><div class="messages" id="messages"><div class="empty-state"><strong>Loading messages…</strong></div></div><form class="composer" id="messageForm"><button type="button" class="icon-button" id="emojiButton" aria-label="Emoji">☺</button><input id="messageInput" autocomplete="off" placeholder="Message" maxlength="4000" aria-label="Message"><button type="submit" class="send-button" aria-label="Send message">➤</button></form></div>`;
  $('closeChat').onclick = emptyConversation;
  $('emojiButton').onclick = () => toastMsg('Emoji picker is not enabled yet.');
  bindMessageStream(chatId, myUid, user.uid);
  $('messageForm').onsubmit = event => sendFromComposer(event, chatId, user);
}

function openGroupChat(chat) {
  cleanupConversation();
  document.body.classList.add('chat-open');
  const myUid = auth.currentUser.uid;
  const chatId = chat.chatId;
  panel.innerHTML = `<div class="live-chat"><header class="chat-header"><button class="icon-button" id="closeChat" aria-label="Back to chats">←</button><div class="chat-avatar small-avatar">${esc((chat.groupName || 'G').charAt(0).toUpperCase())}</div><div class="chat-identity"><strong>${esc(chat.groupName || 'Group')}</strong><small id="chatPresence">Group chat</small></div></header><div class="messages" id="messages"><div class="empty-state"><strong>Loading messages…</strong></div></div><form class="composer" id="messageForm"><button type="button" class="icon-button" id="emojiButton" aria-label="Emoji">☺</button><input id="messageInput" autocomplete="off" placeholder="Message" maxlength="4000" aria-label="Message"><button type="submit" class="send-button" aria-label="Send message">➤</button></form></div>`;
  $('closeChat').onclick = emptyConversation;
  $('emojiButton').onclick = () => toastMsg('Emoji picker is not enabled yet.');
  bindMessageStream(chatId, myUid, null);
  $('messageForm').onsubmit = event => sendFromComposer(event, chatId, chat);
}

function bindMessageStream(chatId, myUid, otherUid) {
  const messages = $('messages');
  stopMessages = watchMessages(chatId, items => {
    messages.innerHTML = items.length ? items.map(message => `<div class="message-row ${message.senderId === myUid ? 'mine' : ''}"><div class="message-bubble">${esc(message.text)}<small>${message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending…'} ${message.senderId === myUid ? (message.readBy && Object.keys(message.readBy).length > 1 ? '✓✓' : '✓') : ''}</small></div></div>`).join('') : '<div class="empty-state"><strong>No messages yet</strong><span>Send a message to start this conversation.</span></div>';
    const last = items.at(-1);
    if (last && last.senderId !== myUid) markRead(chatId, last.id).catch(() => {});
    messages.scrollTop = messages.scrollHeight;
  });
  if (otherUid) {
    stopPresence = watchPresence(otherUid, presence => {
      const target = $('chatPresence');
      if (target) target.textContent = presence.online ? 'Online' : presence.lastSeen ? `Last seen ${new Date(presence.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Offline';
    });
    stopTyping = watchTyping(chatId, otherUid, typing => {
      const target = $('chatPresence');
      if (target && typing) target.textContent = 'Typing…';
    });
  }
}

async function sendFromComposer(event, chatId, chat) {
  event.preventDefault();
  const input = $('messageInput');
  const text = input.value.trim();
  if (!text) return;
  input.disabled = true;
  try {
    if (chat.type !== 'group') await ensureDirectChat(chat);
    await sendMessage(chatId, text);
    input.value = '';
    await markTyping(chatId, false);
  } catch (error) {
    toastMsg(error.message || 'Message could not be sent.');
  } finally {
    input.disabled = false;
    input.focus();
  }
  input.oninput = () => {
    markTyping(chatId, true).catch(() => {});
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => markTyping(chatId, false).catch(() => {}), 1200);
  };
}

function navigate(view) {
  document.querySelectorAll('[data-view]').forEach(item => item.classList.toggle('active', item.dataset.view === view));
  if (view === 'chats') renderChats();
  else if (view === 'mood') renderMood();
  else if (view === 'profile') renderProfile();
}

document.querySelectorAll('[data-view]').forEach(item => item.onclick = () => navigate(item.dataset.view));
const doSearch = () => { navigate('chats'); setTimeout(() => $('chatSearch')?.focus(), 0); };
$('searchButton')?.addEventListener('click', doSearch);
$('desktopSearchButton')?.addEventListener('click', doSearch);
$('profileButton')?.addEventListener('click', () => navigate('profile'));
$('authSwitch')?.addEventListener('click', () => setAuthMode(authMode === 'login' ? 'signup' : 'login'));
$('authForm')?.addEventListener('submit', handleAuth);

if (localStorage.getItem('main-theme') === 'dark') document.body.classList.add('dark');

if (!configured) {
  $('firebaseStatus').textContent = 'Firebase setup required before accounts can be created.';
  showAuth();
} else {
  $('firebaseStatus').textContent = 'Firebase authentication ready.';
  onAuthStateChanged(auth, user => user ? showApp(user) : showAuth());
}
