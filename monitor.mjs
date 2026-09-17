import {emptyState,success,failure,inWindow} from './core.mjs';
import {scrape} from './scrape.mjs';
const {GITHUB_TOKEN:token,GITHUB_REPOSITORY:repo,GITHUB_REF_NAME:branch='main',MONITOR_OWNER:owner} = process.env;
if (!token || !repo || !owner) throw new Error('Missing GitHub configuration');
if (!inWindow()) { console.log('Outside 08:00–18:00 America/New_York; skipped.'); process.exit(0); }
const base = `https://api.github.com/repos/${repo}`;
async function api(path,method='GET',body) {
  const r = await fetch(base+path,{method,headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
  if (!r.ok) {const e = new Error(`GitHub ${method} ${path}: ${r.status}`);e.status=r.status;throw e;}
  return r.status === 204 ? null : r.json();
}
let sha;
let state;
try {
  const file = await api(`/contents/state.json?ref=${encodeURIComponent(branch)}`);
  sha=file.sha;
  state=JSON.parse(Buffer.from(file.content,'base64').toString());
  if (state.version!==1 || !Array.isArray(state.pending) || !Array.isArray(state.previous) || !state.seen || typeof state.initialized !== 'boolean' || !Number.isInteger(state.failures)) throw new Error('Invalid persisted state; refusing to reset baseline');
} catch(e) {if(e.status===404) state=emptyState();else throw e;}
async function save() {
  const r = await api('/contents/state.json','PUT',{message:'Persist monitor checkpoint [skip ci]',branch,sha,content:Buffer.from(JSON.stringify(state,null,2)+'\n').toString('base64')});
  sha=r.content.sha;
}
const escape = s => String(s).replace(/[\\`*_{}\[\]<>#@]/g,c=>`\\${c}`);
async function flush() {
  if (!state.pending.length) return;
  const markers=new Set();
  for(let page=1;;page++) {
    const issues=await api(`/issues?state=all&per_page=100&page=${page}`);
    for(const issue of issues) {
      if (issue.user?.login === 'github-actions[bot]') {
        const key=issue.body?.match(/<!-- capital-one-monitor:([^ ]+) -->/)?.[1];
        if(key) markers.add(key);
      }
    }
    if(issues.length<100) break;
  }
  while(state.pending.length) {
    const item=state.pending[0];
    if(!markers.has(item.key)) {
      const e=item.event;
      const body = e ? `**${escape(e.name)}**\n\nDate: ${escape(e.date)}\n\nLocation: ${escape(e.location)}\n\n[Event details](${e.url})` : escape(item.message);
      await api('/issues','POST',{title:item.title.slice(0,240),body:`${body}\n\n<!-- capital-one-monitor:${item.key} -->`,assignees:[owner]});
    }
    state.pending.shift();
    await save();
  }
}
// Retry durable notifications before taking another scan. A failed delivery never loses an event.
await flush();
try {state=success(state,await scrape());console.log(`Reliable scan: ${state.previous.length} distinct events.`);}
catch(e) {state=failure(state,e.message);console.log(`Unreliable scan (${state.failures} consecutive): ${e.message}`);}
await save();
await flush();
