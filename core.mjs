export const SOURCE = 'https://entertainment.capitalone.com/all-events?tab=exclusives';
export function inWindow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hourCycle: 'h23', hour: '2-digit', minute: '2-digit'
  }).formatToParts(now).map(p => [p.type, p.value]));
  const m = Number(parts.hour) * 60 + Number(parts.minute);
  return m >= 480 && m <= 1080;
}
export function parseCard({url, paragraphs}) {
  const u = new URL(url, SOURCE);
  const id = u.pathname.match(/^\/events\/(\d+)\/?$/)?.[1];
  const p = paragraphs.map(x => x.normalize('NFKC').replace(/\s+/g, ' ').trim());
  const detailIndex = p.findIndex(x => /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(x) && x.includes('•'));
  if (u.origin !== new URL(SOURCE).origin || !id || !p.includes('EXCLUSIVE ACCESS') || detailIndex < 1) throw new Error('Unrecognized exclusive card');
  const fields = p[detailIndex].split('•').map(x => x.trim());
  if (fields.length < 4 || fields.some(x => !x)) throw new Error('Incomplete event details');
  const name = p[detailIndex - 1];
  return {id, name, date: fields.slice(0,2).join(' • '), location: fields.slice(2).join(' • '), url: `${u.origin}/events/${id}`};
}
export function emptyState() {
  return {version:1, initialized:false, seen:{}, previous:[], pending:[], failures:0, failureEpisode:null, lastSuccess:null};
}
export function success(old, events, now = new Date().toISOString()) {
  if (!events.length) throw new Error('Empty scan is not a reliable baseline');
  const state = structuredClone(old);
  const unique = [...new Map(events.map(e => [e.id,e])).values()];
  for (const event of unique) {
    if (state.initialized && !Object.hasOwn(state.seen,event.id)) {
      state.pending.push({key:`event-${event.id}`, title:`New Capital One Exclusive: ${event.name}`, event});
    }
    state.seen[event.id] = event;
  }
  state.previous = unique;
  state.initialized = true;
  state.failures = 0;
  state.failureEpisode = null;
  state.lastSuccess = now;
  return state;
}
export function failure(old, message, now = new Date().toISOString()) {
  const state = structuredClone(old);
  state.failures++;
  state.failureEpisode ??= now;
  state.lastError = {at:now, message};
  if (state.failures === 3) state.pending.push({key:`failure-${state.failureEpisode}`, title:'Capital One monitor needs attention', message:'Three consecutive checks failed. The last successful baseline is preserved. Checks will continue. ' + message});
  return state;
}
