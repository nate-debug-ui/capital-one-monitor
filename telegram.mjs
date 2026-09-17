import {setTimeout as sleep} from 'node:timers/promises';
import {sealRoute,openRoute,selectPrivateStart,splitMessage,issueText,isMonitorIssue} from './telegram-utils.mjs';
const {TELEGRAM_BOT_TOKEN:botToken,GITHUB_TOKEN:gitToken,GITHUB_REPOSITORY:repo,ALLOW_TELEGRAM_SETUP:setup} = process.env;
if(!botToken || !gitToken || !repo) throw new Error('Missing TELEGRAM_BOT_TOKEN or GitHub configuration');
async function telegram(method,body={}) {
  let r,data;
  try {
    r=await fetch(`https://api.telegram.org/bot${botToken}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    data=await r.json();
  } catch {throw new Error(`Telegram ${method}: network/response failure. Token and response omitted.`);}
  if(!r.ok || !data.ok) throw new Error(`Telegram ${method} failed (${r.status}). Response omitted to protect chat details.`);
  return data.result;
}
async function github(path,method='GET',body) {
  const r=await fetch(`https://api.github.com/repos/${repo}${path}`,{method,headers:{Authorization:`Bearer ${gitToken}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
  if(!r.ok) {const e=new Error(`GitHub ${method} failed (${r.status})`);e.status=r.status;throw e;}
  return r.json();
}
const bot=await telegram('getMe');
if(bot.username?.toLowerCase()!=='capitalonealertsbot') throw new Error('Token is not for the expected CapitalOneAlertsBot.');
let state,sha;
try {
  const f=await github('/contents/telegram-state.json?ref=main');
  sha=f.sha;
  state=JSON.parse(Buffer.from(f.content,'base64').toString('utf8'));
  if(state.version!==1 || !state.route || !state.deliveries || !state.initializedAt) throw new Error('Invalid Telegram checkpoint; refusing to re-pair.');
} catch(e) {if(e.status!==404) throw e;}
const issues=[];
for(let page=1;;page++) {
  const batch=await github(`/issues?state=all&sort=created&direction=asc&per_page=100&page=${page}`);
  issues.push(...batch.filter(isMonitorIssue));
  if(batch.length<100)break;
}
async function save() {
  const result=await github('/contents/telegram-state.json','PUT',{branch:'main',sha,message:'Save Telegram delivery checkpoint [skip ci]',content:Buffer.from(JSON.stringify(state,null,2)+'\n').toString('base64')});
  sha=result.content.sha;
}
if(!state) {
  if(setup!=='true') throw new Error('Telegram route is not configured. Run the one-time setup first.');
  const updates=await telegram('getUpdates',{limit:100,timeout:0,allowed_updates:['message']});
  if(updates.length>=100) throw new Error('Too many setup messages; explicit pairing needed.');
  const chatId=selectPrivateStart(updates);
  state={version:1,initializedAt:new Date().toISOString(),route:sealRoute(chatId,botToken),welcomeSent:false,deliveries:Object.fromEntries(issues.map(i=>[i.number,{done:true,reason:'before-telegram-setup'}]))};
  await save();
}
let chatId;
try {chatId=openRoute(state.route,botToken);}catch{throw new Error('Cannot decrypt Telegram route. Token may have changed; explicit re-pairing is needed.');}
async function send(text) {
  await telegram('sendMessage',{chat_id:chatId,text,link_preview_options:{is_disabled:true}});
  await sleep(1100);
}
if(!state.welcomeSent) {
  await send('Telegram test successful — Capital One Event Alerts is connected.\n\nYou will receive new-event alerts from the five-minute checks (8 AM–6 PM Eastern) and the daily 7:30 AM Eastern availability digest here, as well as by email.\n\nThe morning digest may arrive in several messages.');
  state.welcomeSent=true;
  await save();
  console.log('Telegram connection test delivered. Private chat route stored encrypted.');
}
let delivered=0;
for(const issue of issues) {
  if(state.deliveries[issue.number]?.done) continue;
  // Save a fixed snapshot so edits cannot change chunk boundaries during retries.
  if(!state.deliveries[issue.number]) {
    state.deliveries[issue.number]={parts:splitMessage(issueText(issue)),next:0,done:false};
    await save();
  }
  const item=state.deliveries[issue.number];
  while(item.next<item.parts.length) {
    const prefix=item.parts.length>1?`Part ${item.next+1}/${item.parts.length}\n\n`:'';
    await send(prefix+item.parts[item.next]);
    item.next++;
    await save();
  }
  state.deliveries[issue.number]={done:true};
  await save();
  delivered++;
}
console.log(`Telegram relay complete: ${delivered} new notifications delivered.`);
