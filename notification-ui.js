import { auth, firestore, collection, query, orderBy, limit, onSnapshot, doc, updateDoc } from './firebase.js';

let stop = null;
let initialized = false;
const toast = message => { const el = document.getElementById('toast'); if (!el) return; el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2800); };
function installButton() {
  if (document.getElementById('notificationButton')) return;
  const target = document.querySelector('.desktop-topbar .top-actions, .mobile-topbar .top-actions'); if (!target) return;
  const button = document.createElement('button'); button.id = 'notificationButton'; button.className = 'icon-button'; button.type = 'button'; button.setAttribute('aria-label', 'Notifications'); button.textContent = '♢'; button.onclick = () => document.getElementById('notificationPanel')?.remove();
  target.prepend(button);
}
function watch() {
  if (!auth?.currentUser || !firestore || initialized) return; initialized = true;
  stop?.(); const q = query(collection(firestore, 'notifications', auth.currentUser.uid, 'items'), orderBy('createdAt', 'desc'), limit(20)); let first = true;
  stop = onSnapshot(q, snapshot => { const unread = snapshot.docs.filter(item => item.data().read === false); const button = document.getElementById('notificationButton'); if (button) button.textContent = unread.length ? `♢ ${unread.length}` : '♢'; if (!first && unread[0]) toast(unread[0].data().groupName ? `${unread[0].data().groupName}: ${unread[0].data().text}` : unread[0].data().text); first = false; }, () => {});
}
new MutationObserver(installButton).observe(document.body, { childList: true, subtree: true });
if (auth) auth.onAuthStateChanged?.(user => { if (user) { initialized = false; watch(); } else { stop?.(); stop = null; initialized = false; } });
