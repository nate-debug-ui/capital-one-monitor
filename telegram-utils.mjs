import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
const keyFor = token => createHash('sha256').update('capital-one-telegram-route-v1\0'+token).digest();
export function sealRoute(chatId,token) {
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',keyFor(token),iv);
  const encrypted=Buffer.concat([cipher.update(String(chatId),'utf8'),cipher.final()]);
  return {iv:iv.toString('base64'),data:encrypted.toString('base64'),tag:cipher.getAuthTag().toString('base64')};
}
export function openRoute(route,token) {
  const decipher=createDecipheriv('aes-256-gcm',keyFor(token),Buffer.from(route.iv,'base64'));
  decipher.setAuthTag(Buffer.from(route.tag,'base64'));
  const id=Buffer.concat([decipher.update(Buffer.from(route.data,'base64')),decipher.final()]).toString('utf8');
  if(!/^\d+$/.test(id)) throw new Error('Invalid private chat route');
  return id;
}
export function selectPrivateStart(updates) {
  const ids=new Set(updates.map(u=>u.message).filter(m=>m?.chat?.type==='private' && m.from?.id===m.chat.id && !m.from?.is_bot && /^\/start(?:\s|$)/.test(m.text||'')).map(m=>String(m.chat.id)));
  if(ids.size!==1) throw new Error(`Setup requires exactly one private chat with a recent Start message. Candidates: ${ids.size}; updates: ${updates.length}; private messages: ${updates.filter(u=>u.message?.chat?.type==='private').length}; Start messages: ${updates.filter(u=>/^\/start(?:\s|$)/.test(u.message?.text||'')).length}.`);
  return [...ids][0];
}
export function splitMessage(text,limit=3800) {
  const parts=[];
  let pending='';
  for(const char of text) {
    if(pending.length+char.length>limit) {parts.push(pending);pending='';}
    pending+=char;
  }
  if(pending)parts.push(pending);
  return parts;
}
export function issueText(issue) {
  const body=(issue.body||'').replace(/<!--[\s\S]*?-->/g,'').replace(/\[([^\]]+)\]\((https:\/\/[^)]+)\)/g,'$1\n$2').replace(/\*\*/g,'').replace(/\\([\\`*_{}\[\]<>#@])/g,'$1').trim();
  return `${issue.title}\n\n${body}\n\n${issue.html_url}`;
}
export function isMonitorIssue(issue) {
  return issue.user?.login==='github-actions[bot]' && !issue.pull_request && /<!-- capital-one-(?:monitor|digest):[^ ]+ -->/.test(issue.body||'');
}
