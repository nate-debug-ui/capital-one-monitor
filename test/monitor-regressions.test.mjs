import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState, parseCard, success} from '../core.mjs';
import {runMonitor} from '../monitor.mjs';
import {scanListings} from '../scrape.mjs';

function card(id) {
  return {url:`https://entertainment.capitalone.com/events/${id}`,
    paragraphs:['EXCLUSIVE ACCESS',`Event ${id}`,'Sep 21 • 9:00am • Venue • City, NY']};
}

test('an unavailable Issues API still allows discovery and persistence of short-lived events', async () => {
  const events = [1,2,3].map(id => parseCard(card(id)));
  const previous = success(success(emptyState(), [events[0]]), events.slice(0,2));
  let saved;
  await assert.rejects(runMonitor({state:previous,role:'primary',
    scan:async () => events,
    saveState: async state => {saved=structuredClone(state);},
    deliver: async () => {throw new Error('Issues API unavailable');}
  }), /Issues API unavailable/);
  assert.equal(saved.previous.length,3);
  assert.deepEqual(saved.pending.map(a=>a.key),['event-2','event-3']);
});

test('a failed scan keeps the baseline, records the failure, and fails the job', async () => {
  const before=success(emptyState(),[parseCard(card(1))]);
  let saved;
  await assert.rejects(runMonitor({state:before,role:'primary',
    scan:async()=>{throw new Error('listings timed out');},
    saveState:async state=>{saved=structuredClone(state);}, deliver:async()=>{}
  }),/listings timed out/);
  assert.equal(saved.failures,1);
  assert.deepEqual(saved.previous,before.previous);
  assert.equal(saved.lastSuccess,before.lastSuccess);
});

test('backup success preserves the primary failure episode and shared alert identity', async () => {
  const before=success(emptyState(),[parseCard(card(1))]);
  before.failures=2;
  before.failureEpisode=before.lastSuccess;
  let saved;
  await runMonitor({state:before, role:'backup',scan:async()=>[parseCard(card(1)),parseCard(card(2))],
    saveState:async s=>{saved=structuredClone(s);},deliver:async()=>{}});
  assert.equal(saved.failures,2);
  assert.equal(saved.failureEpisode,before.failureEpisode);
  assert.equal(saved.lastPrimarySuccess,before.lastSuccess);
  assert.deepEqual(saved.pending.map(a=>a.key),['event-2']);
  assert.deepEqual(success(saved,[parseCard(card(2))]).pending,saved.pending);
});

// Initially only the first card is visible, and the next-page control is
// delayed. Playwright's click waits for it; isVisible alone would miss it.
function pagedListing({incomplete=false, missingCard=false, suppressed=false}={}) {
  let pageNumber=0;
  let release;
  const waitForResponse = predicate => new Promise(resolve=>{
    release=n=>{
      const result={url:()=>`https://entertainment-bff.capitalone.com/events?tag_filter=C1_EXCLUSIVE&page=${n}`,ok:()=>true,
        json:async()=>({page:n,number_of_pages:2,total:incomplete?3:2,items:[{id:n, name:suppressed && n===2 ? "The Taylor Swift Tribute" : "Concert"}]})};
      assert.ok(predicate(result));
      resolve(result);
    };
  });
  const load=n=>{pageNumber=n;release(n);};
  const hidden={waitFor:async()=>{}};
  const more={...hidden, isVisible:async()=>false,click:async()=>load(2)};
  const cards={first:()=>hidden,evaluateAll:async()=>Array.from({length:missingCard?1:pageNumber},(_,i)=>card(i+1))};
  return {setDefaultTimeout(){},waitForResponse,
    goto:async()=>{load(1);return {ok:()=>true};},
    getByRole:role=>role==='tab'?{...hidden,getAttribute:async()=>'true'}:more,
    getByText:()=>hidden,locator:()=>cards,waitForTimeout:async()=>{}};
}

test('delayed pagination control cannot terminate a scan early', async () => {
  const result=await scanListings(pagedListing());
  assert.deepEqual(result.map(e=>e.id),['1','2']);
});
test('missing server-side page contents prevent a partial baseline', async () => {
  await assert.rejects(scanListings(pagedListing({incomplete:true})),/Incomplete listings page count/);
});
test('blank event names cannot enter a successful baseline', () => {
  const blank=card(1);
  blank.paragraphs[1]=' ';
  assert.throws(()=>parseCard(blank), /Missing event name/);
});

test('collected pages with an unrendered visible event are rejected', async () => {
  await assert.rejects(scanListings(pagedListing({missingCard:true})), /did not render/);
  const cards=await scanListings(pagedListing({missingCard:true,suppressed:true}));
  assert.deepEqual(cards.map(c=>c.id),['1']);
});
