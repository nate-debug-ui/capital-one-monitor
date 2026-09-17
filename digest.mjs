import {scrape} from './scrape.mjs';
import {formatDigest} from './digest-format.mjs';
const {GITHUB_TOKEN:token,GITHUB_REPOSITORY:repo,MONITOR_OWNER:owner,GITHUB_EVENT_NAME:event,GITHUB_RUN_ID:runId} = process.env;
if(!token || !repo || !owner || !runId) throw new Error('Missing GitHub configuration');
const now = new Date();
const date = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const isTest = event !== 'schedule';
const key = isTest ? `test-${runId}` : date;
const marker = `<!-- capital-one-digest:${key} -->`;
async function api(path,method='GET',body) {
  const r=await fetch(`https://api.github.com/repos/${repo}${path}`,{method,headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
  if(!r.ok) throw new Error(`GitHub ${method} failed: ${r.status}`);
  return r.json();
}
// Retrying the same run never sends a second digest if the original issue exists.
for(let page=1;;page++) {
  const issues=await api(`/issues?state=all&per_page=100&page=${page}`);
  if(issues.some(i=>i.user?.login==='github-actions[bot]' && i.body?.includes(marker))) {console.log('Digest already delivered.');process.exit(0);}
  if(issues.length<100) break;
}
// A failed or incomplete scan fails the job; it never sends stale or partial listings.
const events = await scrape({includeAvailability:true});
const digest = formatDigest(events,new Date());
const issue=await api('/issues','POST',{title:`${isTest?'TEST — ':''}Capital One Exclusives available — ${date} (${digest.count} events)`,body:`${digest.body}\n\n${marker}`,assignees:[owner]});
console.log(`Digest created: ${issue.html_url}; ${digest.count} events. GitHub sends the configured notification email.`);
