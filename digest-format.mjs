export function availability(paragraphs) {
  const lines = paragraphs.map(x => x.normalize('NFKC').replace(/\s+/g,' ').trim().toUpperCase());
  return {soldOut:lines.includes('SOLD OUT'), status:lines.includes('SOLD OUT') ? 'Sold out' : lines.includes('LOW TICKETS') ? 'Low tickets' : lines.includes('GET TICKETS') ? 'Tickets listed' : 'Not marked sold out'};
}
const escape = s => String(s).replace(/[\\`*_{}\[\]<>#@]/g,c=>`\\${c}`);
export function formatDigest(events, now = new Date()) {
  if (!events.length || events.some(e=>typeof e.soldOut !== 'boolean')) throw new Error('Incomplete availability scan');
  const unique = [...new Map(events.map(e=>[e.id,e])).values()];
  const available = unique.filter(e=>!e.soldOut);
  const scanned = new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',dateStyle:'full',timeStyle:'short'}).format(now);
  const lines = available.map((e,i)=>`${i+1}. **[${escape(e.name)}](${e.url})**\n   - Date: ${escape(e.date)}\n   - Location: ${escape(e.location)}\n   - Status: ${escape(e.status)}`);
  return {count:available.length, body:`${available.length} Capital One Exclusives not marked sold out.\n\nChecked ${scanned} (Eastern), across ${unique.length} distinct events.\n\n${lines.length?lines.join('\n\n'):'No Exclusives are currently listed as not sold out.'}\n\nAvailability can change. “Not marked sold out” reflects the listing page; eligibility and ticket availability are confirmed on the event page.`};
}
