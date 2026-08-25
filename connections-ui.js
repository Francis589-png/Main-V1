import { auth, db, ref, onValue, onAuthStateChanged } from './firebase.js';
import { acceptConnection, declineConnection, disconnect } from './connections.js';

const esc = value => String(value ?? '').replace(/[&<>\"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[char]));
let installed = false;
let profiles = {};
let connections = {};
let stopProfiles = null;
let stopConnections = null;

const toast = message => {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2400);
};

const cleanup = () => {
  stopProfiles?.();
  stopConnections?.();
  stopProfiles = null;
  stopConnections = null;
};

function injectButton() {
  const explore = document.getElementById('explorePeopleButton');
  if (!explore || document.getElementById('connectionsButton')) return;
  const button = document.createElement('button');
  button.id = 'connectionsButton';
  button.type = 'button';
  button.textContent = 'Connections';
  button.className = 'secondary-action';
  button.addEventListener('click', renderConnections);
  explore.parentElement?.appendChild(button);
}

function renderConnections() {
  const content = document.getElementById('content');
  const title = document.getElementById('viewTitle');
  const panel = document.getElementById('conversationPanel');
  if (!content || !auth.currentUser) return;
  document.body.classList.remove('chat-open');
  title.textContent = 'Connections';
  panel.innerHTML = '<div class="conversation-empty"><div class="empty-orb">M</div><h2>Connections</h2><p>Manage your real Main connections and requests.</p></div>';
  content.innerHTML = '<button class="back-link" id="connectionsBack" type="button">← Chats</button><div class="connection-tabs" role="tablist"><button class="connection-tab active" data-mode="incoming" type="button">Requests</button><button class="connection-tab" data-mode="outgoing" type="button">Sent</button><button class="connection-tab" data-mode="connected" type="button">Connected</button></div><div id="connectionList"><div class="empty-state"><strong>Loading connections…</strong><span>Connecting to Main.</span></div></div>';
  document.getElementById('connectionsBack').onclick = () => {
    cleanup();
    document.querySelector('[data-view="chats"]')?.click();
  };

  let mode = 'incoming';
  const list = document.getElementById('connectionList');
  const draw = () => {
    const me = auth.currentUser.uid;
    let items = Object.values(connections)
      .filter(connection => connection?.userA && connection?.userB)
      .map(connection => {
        const uid = connection.userA === me ? connection.userB : connection.userA;
        return { ...connection, uid, profile: profiles[uid] };
      })
      .filter(connection => connection.profile);

    if (mode === 'incoming') items = items.filter(connection => connection.status === 'pending' && connection.requestedBy !== me);
    if (mode === 'outgoing') items = items.filter(connection => connection.status === 'pending' && connection.requestedBy === me);
    if (mode === 'connected') items = items.filter(connection => connection.status === 'connected');

    if (!items.length) {
      const titleText = mode === 'incoming' ? 'No connection requests' : mode === 'outgoing' ? 'No pending requests' : 'No connections yet';
      list.innerHTML = `<div class="empty-state"><strong>${titleText}</strong><span>Real Main connections will appear here.</span></div>`;
      return;
    }

    list.innerHTML = items.map(connection => {
      const name = connection.profile.displayName || 'Main user';
      const actionMarkup = mode === 'incoming'
        ? '<button class="connect-action accept" data-action="accept" type="button">Accept</button><button class="connect-action decline" data-action="decline" type="button">Decline</button>'
        : mode === 'outgoing'
          ? '<span class="connection-state">Pending</span>'
          : '<button class="connect-action disconnect" data-action="disconnect" type="button">Disconnect</button>';
      return `<article class="connection-card" data-uid="${esc(connection.uid)}"><span class="chat-avatar">${esc(name.charAt(0).toUpperCase())}</span><div class="chat-main"><strong class="chat-name">${esc(name)}</strong><span class="chat-preview">${connection.profile.mood ? esc(connection.profile.mood) : 'Main user'}</span></div><div class="connection-actions">${actionMarkup}</div></article>`;
    }).join('');

    list.querySelectorAll('[data-action]').forEach(button => {
      button.onclick = async () => {
        const uid = button.closest('.connection-card')?.dataset.uid;
        if (!uid) return;
        button.disabled = true;
        try {
          if (button.dataset.action === 'accept') await acceptConnection(uid);
          else if (button.dataset.action === 'decline') await declineConnection(uid);
          else await disconnect(uid);
          toast(button.dataset.action === 'accept' ? 'Connected.' : button.dataset.action === 'decline' ? 'Request declined.' : 'Disconnected.');
        } catch (error) {
          toast(error.message || 'Connection update failed.');
        } finally {
          button.disabled = false;
        }
      };
    });
  };

  stopProfiles = onValue(ref(db, 'publicProfiles'), snapshot => { profiles = snapshot.val() || {}; draw(); });
  stopConnections = onValue(ref(db, `connectionsByUser/${auth.currentUser.uid}`), snapshot => { connections = snapshot.val() || {}; draw(); });
  document.querySelectorAll('.connection-tab').forEach(button => {
    button.onclick = () => {
      mode = button.dataset.mode;
      document.querySelectorAll('.connection-tab').forEach(tab => tab.classList.toggle('active', tab === button));
      draw();
    };
  });
}

function install() {
  if (installed) return;
  installed = true;
  const observer = new MutationObserver(injectButton);
  observer.observe(document.getElementById('content') || document.body, { childList: true, subtree: true });
  injectButton();
}

onAuthStateChanged(auth, user => {
  if (user) install();
  else { installed = false; cleanup(); }
});
