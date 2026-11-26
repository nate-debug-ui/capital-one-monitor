export function digestIdentity({event,runId,mode='test',now=new Date()}) {
  if(!['test','daily'].includes(mode)) throw new Error('Invalid digest delivery mode');
  const date = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const isTest = event !== 'schedule' && mode !== 'daily';
  return {date,isTest,key:isTest ? `test-${runId}` : date};
}
export function availability(paragraphs) {
  const lines = paragraphs.map(x => x.normalize('NFKC').replace(/\s+/g,' ').trim().toUpperCase());
  const soldOut = lines.some(line => /^SOLD[ -]OUT(?:$|\s*[-–—:,(]\s*(?:JOIN|WAIT\s?LIST|NOTIFY)\b)/.test(line));
  if (soldOut) return {soldOut: true, status: 'Sold out'};
  if (lines.includes('LOW TICKETS')) return {soldOut: false, status: 'Low tickets'};
  if (lines.includes('GET TICKETS')) return {soldOut: false, status: 'Tickets listed'};
  return {soldOut: false, status: 'Not marked sold out'};
}
const escape = s => String(s).replace(/[\\`*_{}\[\]<>#@]/g,c=>`\\${c}`);
export function formatDigest(events, now = new Date()) {
  if (!events.length || events.some(e=>typeof e.soldOut !== 'boolean')) throw new Error('Incomplete availability scan');
  const rank = event => event.soldOut ? 3 : ({'Low tickets': 2, 'Tickets listed': 1}[event.status] ?? 0);
  const cards = new Map();
  for (const event of events) {
    const previous = cards.get(event.id);
    if (!previous || rank(event) > rank(previous)) {
      cards.set(event.id, event);
    }
  }
  const unique = [...cards.values()];
  const available = unique.filter(e=>!e.soldOut);
  const scanned = new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',dateStyle:'full',timeStyle:'short'}).format(now);
  const lines = available.map((e,i)=>`${i+1}. **[${escape(e.name)}](${e.url})**\n   - Date: ${escape(e.date)}\n   - Location: ${escape(e.location)}\n   - Status: ${escape(e.status)}`);
  return {count:available.length, body:`${available.length} Capital One Exclusives not marked sold out.\n\nChecked ${scanned} (Eastern), across ${unique.length} distinct events.\n\n${lines.length?lines.join('\n\n'):'No Exclusives are currently listed as not sold out.'}\n\nAvailability can change. “Not marked sold out” reflects the listing page; eligibility and ticket availability are confirmed on the event page.`};
}
