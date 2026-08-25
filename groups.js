import { auth, db, ref, onValue, get, firestore, doc, getDoc } from './firebase.js';
import { createGroup, watchMessages, sendMessage, markRead, markTyping } from './chat-service.js';
import { getGroup, renameGroup, addGroupMember, removeGroupMember, setGroupAdmin, leaveGroup } from './group-service.js';

let installed = false;
let profiles = {};
let connections = {};
let stopProfiles = null;
let stopConnections = null;
let stopGroup = null;
let typingTimer = null;
let typingActive = false;
const esc = value => String(value ?? '').replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[c]));
const toast = message => { const el = document.getElementById('toast'); if (!el) return; el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2400); };
const stopChat = () => { stopGroup?.(); stopGroup = null; clearTimeout(typingTimer); typingActive = false; };
const connectedPeople = () => Object.values(connections).filter(c => c?.status === 'connected').map(c => profiles[c.userA === auth.currentUser.uid ? c.userB : c.userA]).filter(Boolean);

function inject() {
  const heading = document.querySelector('.section-heading');
  if (!heading || document.getElementById('newGroupButton')) return;
  const button = document.createElement('button'); button.id = 'newGroupButton'; button.type = 'button'; button.className = 'secondary-action'; button.textContent = 'New group'; button.onclick = renderCreateGroup; heading.appendChild(button);
}
function watch() {
  if (!auth.currentUser || !db) return;
  stopProfiles?.(); stopConnections?.();
  stopProfiles = onValue(ref(db, 'publicProfiles'), snapshot => { profiles = snapshot.val() || {}; inject(); });
  stopConnections = onValue(ref(db, `connectionsByUser/${auth.currentUser.uid}`), snapshot => { connections = snapshot.val() || {}; inject(); });
}

function install() {
  if (installed) return; installed = true;
  new MutationObserver(inject).observe(document.body, { childList: true, subtree: true });
  document.getElementById('content')?.addEventListener('click', interceptChat, true);
  watch(); auth?.onAuthStateChanged?.(user => user ? watch() : null);
}

function renderCreateGroup() {
  stopChat(); document.body.classList.remove('chat-open'); document.getElementById('viewTitle').textContent = 'New group';
  const content = document.getElementById('content'); const panel = document.getElementById('conversationPanel');
  panel.innerHTML = '<div class="conversation-empty"><div class="empty-orb">M</div><h2>Create a group</h2><p>Add people to a real group conversation.</p></div>';
  content.innerHTML = '<button class="back-link" id="groupBack">← Chats</button><div class="group-form"><label for="groupName">Group name</label><input id="groupName" maxlength="80" placeholder="Group name"><p class="section-label">Connected people</p><div id="groupMembers"></div><button id="createGroupSubmit" class="primary-button" type="button">Create group</button></div>';
  document.getElementById('groupBack').onclick = () => window.dispatchEvent(new CustomEvent('main:navigate', { detail: 'chats' }));
  const list = document.getElementById('groupMembers'); const people = connectedPeople();
  list.innerHTML = people.length ? people.map(user => `<label class="group-person"><input type="checkbox" value="${esc(user.uid)}"><span class="chat-avatar small-avatar">${esc((user.displayName || 'M').charAt(0).toUpperCase())}</span><span class="chat-main"><strong class="chat-name">${esc(user.displayName || 'Main user')}</strong><span class="chat-preview">${user.mood ? esc(user.mood) : 'Connected'}</span></span></label>`).join('') : '<div class="empty-state"><strong>No connections yet</strong><span>Connect with people before creating a group.</span></div>';
  document.getElementById('createGroupSubmit').onclick = async () => {
    const name = document.getElementById('groupName').value.trim(); const members = [...list.querySelectorAll('input:checked')].map(input => input.value); const button = document.getElementById('createGroupSubmit'); button.disabled = true;
    try { const id = await createGroup(name, members); toast('Group created.'); openGroup(id); } catch (error) { toast(error.message || 'Could not create group.'); } finally { button.disabled = false; }
  };
}

function interceptChat(event) {
  const card = event.target.closest?.('[data-chat]'); if (!card || !firestore) return;
  const chatId = card.dataset.chat; if (!chatId) return;
  getDoc(doc(firestore, 'conversations', chatId)).then(snapshot => {
    if (snapshot.exists() && snapshot.data().type === 'group') { event.preventDefault(); event.stopImmediatePropagation(); openGroup(chatId); }
  }).catch(() => {});
}

async function openGroup(chatId) {
  stopChat(); document.body.classList.add('chat-open');
  const panel = document.getElementById('conversationPanel');
  const group = await getGroup(chatId);
  if (!group) { toast('Group is unavailable.'); return; }
  panel.innerHTML = `<div class="live-chat"><header class="chat-header"><button class="icon-button" id="groupClose" aria-label="Back">←</button><div class="chat-avatar small-avatar">${esc((group.name || 'G').charAt(0).toUpperCase())}</div><div class="chat-identity"><strong id="groupTitle">${esc(group.name || 'Group')}</strong><small id="groupMemberCount">${group.members.length} members</small></div><button class="icon-button" id="groupInfo" aria-label="Group information">⋮</button></header><div class="messages" id="groupMessages"><div class="empty-state"><strong>Loading messages…</strong></div></div><form class="composer" id="groupMessageForm"><input id="groupMessageInput" autocomplete="off" maxlength="4000" placeholder="Message" aria-label="Message"><button class="send-button" type="submit" aria-label="Send">➤</button></form></div>`;
  document.getElementById('groupClose').onclick = () => { stopChat(); document.body.classList.remove('chat-open'); window.dispatchEvent(new CustomEvent('main:navigate', { detail: 'chats' })); };
  document.getElementById('groupInfo').onclick = () => showGroupInfo(group);
  const messages = document.getElementById('groupMessages');
  stopGroup = watchMessages(chatId, items => {
    messages.innerHTML = items.length ? items.map(message => {
      const sender = profiles[message.senderId]?.displayName || 'Main user'; const own = message.senderId === auth.currentUser.uid;
      const status = own ? (Object.keys(message.readBy || {}).some(uid => uid !== auth.currentUser.uid) ? '✓✓' : Object.keys(message.deliveredAt || {}).some(uid => uid !== auth.currentUser.uid) ? '✓✓' : '✓') : '';
      return `<div class="message-row ${own ? 'mine' : ''}"><div class="message-bubble">${!own ? `<strong class="group-sender">${esc(sender)}</strong>` : ''}${message.replyTo ? `<div class="message-inline-reply">↩ ${esc(message.replyTo.text || 'Replied message')}</div>` : ''}${esc(message.text || '')}<small>${message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending…'} ${status}</small></div></div>`;
    }).join('') : '<div class="empty-state"><strong>No messages yet</strong><span>Send the first message to this group.</span></div>';
    const last = items.at(-1); if (last && last.senderId !== auth.currentUser.uid) markRead(chatId, last.id).catch(() => {}); messages.scrollTop = messages.scrollHeight;
  });
  const input = document.getElementById('groupMessageInput');
  document.getElementById('groupMessageForm').onsubmit = async event => { event.preventDefault(); const text = input.value.trim(); if (!text) return; input.disabled = true; try { await sendMessage(chatId, text); input.value = ''; if (typingActive) { typingActive = false; await markTyping(chatId, false); } } catch (error) { toast(error.message || 'Message could not be sent.'); } finally { input.disabled = false; input.focus(); } };
  input.oninput = () => { if (!typingActive) { typingActive = true; markTyping(chatId, true).catch(() => {}); } clearTimeout(typingTimer); typingTimer = setTimeout(() => { typingActive = false; markTyping(chatId, false).catch(() => {}); }, 700); };
}

async function showGroupInfo(group) {
  const current = await getGroup(group.id); if (!current) return;
  const me = current.members.find(member => member.uid === auth.currentUser.uid); const admin = ['owner', 'admin'].includes(me?.role);
  const content = document.getElementById('content'); document.getElementById('viewTitle').textContent = 'Group details';
  content.innerHTML = `<button class="back-link" id="groupInfoBack">← Conversation</button><div class="profile-card"><div class="profile-avatar">${esc((current.name || 'G').charAt(0).toUpperCase())}</div><h2>${esc(current.name || 'Group')}</h2><p>${current.members.length} members</p>${admin ? '<button class="primary-button" id="renameGroup">Rename group</button><button class="primary-button" id="addGroupMember">Add member</button>' : ''}<div id="groupMemberList" class="section-list"></div><button class="primary-button" id="leaveGroup">Leave group</button></div>`;
  document.getElementById('groupInfoBack').onclick = () => openGroup(current.id);
  const list = document.getElementById('groupMemberList');
  list.innerHTML = current.members.map(member => { const name = profiles[member.uid]?.displayName || 'Main user'; const controls = admin && member.uid !== auth.currentUser.uid && member.role !== 'owner' ? `<button type="button" data-remove="${esc(member.uid)}">Remove</button><button type="button" data-admin="${esc(member.uid)}">${member.role === 'admin' ? 'Remove admin' : 'Make admin'}</button>` : ''; return `<div class="group-person"><span class="chat-avatar small-avatar">${esc(name.charAt(0).toUpperCase())}</span><span class="chat-main"><strong class="chat-name">${esc(name)}</strong><span class="chat-preview">${esc(member.role)}</span></span><span class="chat-meta">${controls}</span></div>`; }).join('');
  list.querySelectorAll('[data-remove]').forEach(button => button.onclick = async () => { try { await removeGroupMember(current.id, button.dataset.remove); toast('Member removed.'); showGroupInfo(current); } catch (error) { toast(error.message || 'Could not remove member.'); } });
  list.querySelectorAll('[data-admin]').forEach(button => button.onclick = async () => { try { const target = current.members.find(member => member.uid === button.dataset.admin); await setGroupAdmin(current.id, button.dataset.admin, target?.role !== 'admin'); toast('Admin role updated.'); showGroupInfo(current); } catch (error) { toast(error.message || 'Could not update admin role.'); } });
  document.getElementById('renameGroup')?.addEventListener('click', async () => { const name = prompt('New group name', current.name || ''); if (!name) return; try { await renameGroup(current.id, name); toast('Group renamed.'); openGroup(current.id); } catch (error) { toast(error.message || 'Could not rename group.'); } });
  document.getElementById('addGroupMember')?.addEventListener('click', async () => { const people = connectedPeople().filter(person => !current.members.some(member => member.uid === person.uid)); if (!people.length) return toast('No available connected people.'); const selection = prompt(`Enter a member number:\n${people.map((person, index) => `${index + 1}. ${person.displayName || 'Main user'}`).join('\n')}`); const index = Number(selection) - 1; if (!Number.isInteger(index) || !people[index]) return; try { await addGroupMember(current.id, people[index].uid); toast('Member added.'); showGroupInfo(current); } catch (error) { toast(error.message || 'Could not add member.'); } });
  document.getElementById('leaveGroup').onclick = async () => { if (!confirm('Leave this group?')) return; try { await leaveGroup(current.id); toast('You left the group.'); window.dispatchEvent(new CustomEvent('main:navigate', { detail: 'chats' })); } catch (error) { toast(error.message || 'Could not leave group.'); } };
}

window.addEventListener('main:open-group', event => openGroup(event.detail));
if (auth) install();
