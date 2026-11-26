import {SOURCE, parseCard} from './core.mjs';
import {availability} from './digest-format.mjs';

const selector = 'a[href^="/events/"]';

function isListingResponse(response, pageNumber) {
  const url = new URL(response.url());
  const filter = url.searchParams.get('tag_filter') || '';
  return url.origin === 'https://entertainment-bff.capitalone.com'
    && url.pathname === '/events'
    && /\bC1_EXCLUSIVE\b/.test(filter)
    && Number(url.searchParams.get('page')) === pageNumber;
}

// Observe the same public responses the tab requests. They tell us how many
// pages to wait for, even if a late See more button is temporarily invisible.
async function fetchPage(page, pageNumber, action) {
  const [response] = await Promise.all([
    page.waitForResponse(r => isListingResponse(r, pageNumber), {timeout:60000}), action()
  ]);
  if (!response.ok()) throw new Error(`Listings HTTP ${response.status()} on page ${pageNumber}`);
  const data = await response.json();
  if (data.page !== pageNumber || !Number.isSafeInteger(data.number_of_pages)
      || data.number_of_pages < pageNumber || !Number.isSafeInteger(data.total)
      || data.total < 1 || !Array.isArray(data.items) || !data.items.length) {
    throw new Error(`Incomplete listings response for page ${pageNumber}`);
  }
  return data;
}

// Capital One's public listing client suppresses rows that match this name
// in the event or its performers. Its API total still counts them. If the
// page does render one, include it like every other visible card.
function normallyRendered(item) {
  const suppressed = /taylor\s*swift/i;
  return !suppressed.test(item.name) && !item.performers?.some(p => suppressed.test(p.name));
}

async function readCards(page) {
  return page.locator(selector).evaluateAll(cards => cards.map(a => ({
    url: a.href,
    paragraphs: Array.from(a.querySelectorAll('p'), p => p.textContent)
  })));
}

export async function scanListings(page, {includeAvailability = false} = {}) {
  page.setDefaultTimeout(30000);
  const first = await fetchPage(page, 1, async () => {
    const document = await page.goto(SOURCE, {waitUntil:'domcontentloaded',timeout:60000});
    if (!document?.ok()) throw new Error(`Page HTTP ${document?.status()}`);
  });
  const tab = page.getByRole('tab', {name:'Exclusives',exact:true});
  await tab.waitFor({state:'visible'});
  if (await tab.getAttribute('aria-selected') !== 'true') throw new Error('Exclusives tab not selected');

  const more = page.getByRole('button', {name:'See more',exact:true});
  const loading = page.getByText(/^Loading(?:\.\.\.)?$/);
  const cards = page.locator(selector);
  await cards.first().waitFor({state:'visible',timeout:60000});
  const fetched = [...first.items];
  for (let n = 2; n <= first.number_of_pages; n++) {
    await loading.waitFor({state:'hidden'});
    const batch = await fetchPage(page, n, () => more.click());
    if (batch.number_of_pages !== first.number_of_pages || batch.total !== first.total) {
      throw new Error('Listings changed during pagination');
    }
    fetched.push(...batch.items);
  }
  if (fetched.length !== first.total) throw new Error('Incomplete listings page count');
  await loading.waitFor({state:'hidden'});
  await more.waitFor({state:'hidden'});
  const raw = await readCards(page);
  await page.waitForTimeout(1200);
  if (await more.isVisible() || JSON.stringify(raw) !== JSON.stringify(await readCards(page))) {
    throw new Error('Listings still changing');
  }
  if (!raw.length) throw new Error('No trustworthy event cards');
  const ids = new Set(fetched.map(item => String(item.id)));
  const events = raw.map(card => {
    const event = parseCard(card);
    if (!ids.has(event.id)) throw new Error('Rendered card missing from fetched listings');
    return includeAvailability ? {...event, ...availability(card.paragraphs)} : event;
  });
  const rendered = new Set(events.map(event => event.id));
  if (fetched.some(item => normallyRendered(item) && !rendered.has(String(item.id)))) {
    throw new Error('Complete event data did not render on the Exclusives tab');
  }
  return events;
}

export async function scrape(options) {
  const {chromium} = await import('playwright');
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000},locale:'en-US'});
    return await scanListings(page, options);
  } finally {
    await browser.close();
  }
}
