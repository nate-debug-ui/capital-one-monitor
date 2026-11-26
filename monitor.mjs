import {emptyState,success,failure} from './core.mjs';
import {updatePrimaryHealth} from './watchdog.mjs';
import {pathToFileURL} from 'node:url';
const {GITHUB_TOKEN:token,GITHUB_REPOSITORY:repo,GITHUB_REF_NAME:branch='main',MONITOR_OWNER:owner} = process.env;
const base = `https://api.github.com/repos/${repo}`;
async function api(path,method='GET',body) {
  const r = await fetch(base+path,{method,headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
  if (!r.ok) {const e = new Error(`GitHub ${method} ${path}: ${r.status}`);e.status=r.status;throw e;}
  return r.status === 204 ? null : r.json();
}
let sha;
async function loadState() {
  let state;
  try {
    const file = await api(`/contents/state.json?ref=${encodeURIComponent(branch)}`);
    sha=file.sha;
    state=JSON.parse(Buffer.from(file.content,'base64').toString());
    if (state.version!==1 || !Array.isArray(state.pending) || !Array.isArray(state.previous) || !state.seen || typeof state.initialized !== 'boolean' || !Number.isInteger(state.failures)) throw new Error('Invalid persisted state; refusing to reset baseline');
  } catch(e) {if(e.status===404) state=emptyState();else throw e;}
  return state;
}
async function save(state) {
  const r = await api('/contents/state.json','PUT',{message:'Persist monitor checkpoint [skip ci]',branch,sha,content:Buffer.from(JSON.stringify(state,null,2)+'\n').toString('base64')});
  sha=r.content.sha;
}
const escape = s => String(s).replace(/[\\`*_{}\[\]<>#@]/g,c=>`\\${c}`);
async function flush(state) {
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
    await save(state);
  }
}
// Save the scan and its alerts together before attempting any issue delivery.
export async function runMonitor({state, role, scan, saveState, deliver}) {
  const beforeScan = state;
  if (role === 'watchdog') {
    const snapshot = JSON.stringify(state);
    updatePrimaryHealth(state, {beforeScan, backup:true, scanSucceeded:false, now:new Date()});
    if (JSON.stringify(state) !== snapshot) await saveState(state);
    await deliver(state);
    return;
  }

  const backup = role === 'backup';
  let scanError;
  try {
    state = success(beforeScan, await scan());
    if (backup) {
      // Only a successful primary run ends a primary failure episode.
      state.failures = beforeScan.failures;
      state.failureEpisode = beforeScan.failureEpisode;
    }
    console.log(`Reliable ${role} scan: ${state.previous.length} distinct events.`);
  } catch (error) {
    scanError = error;
    state = backup ? structuredClone(beforeScan) : failure(beforeScan, error.message);
    console.error(`Unreliable ${role} scan: ${error.message}`);
  }
  updatePrimaryHealth(state, {beforeScan, backup, scanSucceeded:!scanError, now:new Date()});
  await saveState(state);
  await deliver(state);
  if (scanError) throw scanError;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!token || !repo || !owner) throw new Error('Missing GitHub configuration');
  const role = process.env.MONITOR_ROLE || 'primary';
  if (!['primary', 'backup', 'watchdog'].includes(role)) throw new Error('Invalid monitor role');
  await runMonitor({
    state: await loadState(),
    role,
    scan: async () => (await import('./scrape.mjs')).scrape(),
    saveState: save,
    deliver: flush
  });
}
