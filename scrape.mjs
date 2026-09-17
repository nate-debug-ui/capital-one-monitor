import {chromium} from 'playwright';
import {SOURCE, parseCard} from './core.mjs';
import {availability} from './digest-format.mjs';

export async function scrape({includeAvailability = false} = {}) {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000},locale:'en-US'});
    page.setDefaultTimeout(30000);
    const response = await page.goto(SOURCE,{waitUntil:'domcontentloaded',timeout:60000});
    if (!response?.ok()) throw new Error(`Page HTTP ${response?.status()}`);
    const tab = page.getByRole('tab',{name:'Exclusives',exact:true});
    await tab.waitFor({state:'visible'});
    if (await tab.getAttribute('aria-selected') !== 'true') throw new Error('Exclusives tab not selected');
    const selector = 'a[href^="/events/"]';
    await page.locator(selector).first().waitFor({state:'visible',timeout:60000});
    let complete = false;
    for (let n=0;n<100;n++) {
      await page.getByText(/^Loading(?:\.\.\.)?$/).waitFor({state:'hidden'});
      const more = page.getByRole('button',{name:'See more',exact:true});
      if (!await more.isVisible()) {complete=true;break;}
      const count = await page.locator(selector).count();
      await more.click();
      await page.waitForFunction(({selector,count}) => document.querySelectorAll(selector).length > count,{selector,count});
    }
    if (!complete) throw new Error('Pagination incomplete');
    const read = () => page.locator(selector).evaluateAll(cards => cards.map(a => ({url:a.href, paragraphs:Array.from(a.querySelectorAll('p')).map(p=>p.textContent)})));
    const raw = await read();
    // A second observation catches late rendering changes before persisting a scan.
    await page.waitForTimeout(1200);
    if (JSON.stringify(raw) !== JSON.stringify(await read())) throw new Error('Listings still changing');
    if (!raw.length) throw new Error('No trustworthy event cards');
    return raw.map(card => ({...parseCard(card), ...(includeAvailability ? availability(card.paragraphs) : {})}));
  } finally {await browser.close();}
}
