import { db, auth, get, onValue, push, ref, serverTimestamp, set, update } from './firebase.js';

export function conversationId(uidA, uidB) { return [uidA, uidB].sort().join('_'); }
export function groupId() { return push(ref(db, 'chats')).key; }

export async function ensureDirectChat(otherUser) {
  if (!auth.currentUser || !otherUser?.uid || otherUser.uid === auth.currentUser.uid) throw new Error('A valid other user is required.');
  const myUid = auth.currentUser.uid, chatId = conversationId(myUid, otherUser.uid);
  await update(ref(db, `chats/${chatId}`), { type:'direct', members:{[myUid]:true,[otherUser.uid]:true}, updatedAt:serverTimestamp() });
  await update(ref(db, `userChats/${myUid}/${chatId}`), {chatId,otherUid:otherUser.uid,otherName:otherUser.displayName||'Main user',type:'direct'});
  await update(ref(db, `userChats/${otherUser.uid}/${chatId}`), {chatId,otherUid:myUid,otherName:auth.currentUser.displayName||'Main user',type:'direct'});
  return chatId;
}

export async function createGroup(name, members) {
  const me=auth.currentUser;
  if(!me) throw new Error('You must be signed in.');
  const cleanName=String(name||'').trim().slice(0,80);
  const unique=[me.uid,...(members||[]).filter(uid=>uid&&uid!==me.uid)];
  if(!cleanName) throw new Error('Enter a group name.');
  if(unique.length<2) throw new Error('A group needs at least one other person.');
  const chatId=groupId(), memberMap=Object.fromEntries(unique.map(uid=>[uid,true])), writes={};
  writes[`chats/${chatId}`]={chatId,type:'group',name:cleanName,createdBy:me.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),members:memberMap};
  for(const uid of unique) writes[`userChats/${uid}/${chatId}`]={chatId,type:'group',groupName:cleanName,otherName:cleanName,updatedAt:Date.now(),unreadCount:0};
  await update(ref(db),writes); return chatId;
}

export function watchUserChats(uid, callback){return onValue(ref(db,`userChats/${uid}`),s=>callback(s.val()||{}));}
export function watchChat(chatId,callback){return onValue(ref(db,`chats/${chatId}`),s=>callback(s.val()||null));}
export function watchPublicProfiles(callback){return onValue(ref(db,'publicProfiles'),s=>callback(s.val()||{}));}
export function watchMessages(chatId,callback){return onValue(ref(db,`messages/${chatId}`),s=>{const v=s.val()||{};callback(Object.entries(v).map(([id,message])=>({id,...message})).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)));});}
export function watchPresence(uid,callback){return onValue(ref(db,`presence/${uid}`),s=>callback(s.val()||{online:false}));}
export function watchTyping(chatId,otherUid,callback){return onValue(ref(db,`typing/${chatId}/${otherUid}`),s=>callback(Boolean(s.val()));}

export async function sendMessage(chatId,text){
  if(!auth.currentUser) throw new Error('You must be signed in.');
  const cleanText=String(text||'').trim(); if(!cleanText)return;
  const chatSnapshot=await get(ref(db,`chats/${chatId}`)),chat=chatSnapshot.val();
  if(!chat?.members?.[auth.currentUser.uid])throw new Error('You are not a member of this conversation.');
  const recipientIds=Object.keys(chat.members).filter(uid=>uid!==auth.currentUser.uid),messageRef=push(ref(db,`messages/${chatId}`)),createdAt=Date.now();
  const message={senderId:auth.currentUser.uid,text:cleanText,type:'text',createdAt,serverCreatedAt:serverTimestamp(),readBy:{[auth.currentUser.uid]:true}},writes={};
  writes[`messages/${chatId}/${messageRef.key}`]=message; writes[`chats/${chatId}/lastMessage`]=cleanText; writes[`chats/${chatId}/lastSenderId`]=auth.currentUser.uid; writes[`chats/${chatId}/updatedAt`]=serverTimestamp();
  if(chat.type==='group'){
    for(const uid of Object.keys(chat.members)) writes[`userChats/${uid}/${chatId}`]={chatId,type:'group',groupName:chat.name,otherName:chat.name,lastMessage:cleanText,lastSenderId:auth.currentUser.uid,updatedAt:createdAt,unreadCount:uid===auth.currentUser.uid?0:(Number(((await get(ref(db,`userChats/${uid}/${chatId}/unreadCount`))).val()))||0)+1};
  }else{
    const otherUid=recipientIds[0];
    const profile=(await get(ref(db,`publicProfiles/${otherUid}`))).val()||{};
    writes[`userChats/${auth.currentUser.uid}/${chatId}`]={chatId,otherUid,otherName:profile.displayName||'Main user',lastMessage:cleanText,lastSenderId:auth.currentUser.uid,updatedAt:createdAt,unreadCount:0};
    writes[`userChats/${otherUid}/${chatId}`]={chatId,otherUid:auth.currentUser.uid,otherName:auth.currentUser.displayName||'Main user',lastMessage:cleanText,lastSenderId:auth.currentUser.uid,updatedAt:createdAt,unreadCount:(Number(((await get(ref(db,`userChats/${otherUid}/${chatId}/unreadCount`))).val()))||0)+1};
  }
  await update(ref(db),writes);
}
export async function markRead(chatId,messageId){if(!auth.currentUser||!messageId)return;const uid=auth.currentUser.uid;await update(ref(db,`messages/${chatId}/${messageId}/readBy`),{[uid]:true});await update(ref(db,`userChats/${uid}/${chatId}`),{unreadCount:0});}

export async function markTyping(chatId,typing){if(!auth.currentUser)return;await set(ref(db,`typing/${chatId}/${auth.currentUser.uid}`),typing?Date.now():null);}
export async function updatePresence(online){if(!auth.currentUser)return;await update(ref(db,`presence/${auth.currentUser.uid}`),{online,lastSeen:Date.now()});}
