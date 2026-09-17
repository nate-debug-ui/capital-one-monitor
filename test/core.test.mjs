import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCard,emptyState,success,failure,inWindow} from '../core.mjs';
const a={id:'7082329',name:"Eater - A Welcome Home Party for Alfie's",date:'Sep 17 • 6:30pm',location:"Alfie's • Washington, DC",url:'https://entertainment.capitalone.com/events/7082329'};
test('observed event markup parses and canonicalizes URL',()=>{
  assert.deepEqual(parseCard({url:a.url+'?utm_source=foo#bar',paragraphs:['EXCLUSIVE ACCESS','SOLD OUT',a.name,`${a.date} • ${a.location}`,'Learn more']}),a);
});
test('unreliable cards are rejected',()=>{
  assert.throws(()=>parseCard({url:a.url,paragraphs:['Loading']}));
  assert.throws(()=>parseCard({url:'https://evil.example/events/7082329',paragraphs:['EXCLUSIVE ACCESS',a.name,`${a.date} • ${a.location}`]}));
});
test('first baseline is silent; duplicates and reordered edited details do not alert',()=>{
  const b={...a,id:'2'};
  const s=success(emptyState(),[a,b,a]);
  assert.equal(s.pending.length,0);
  assert.equal(s.previous.length,2);
  assert.equal(success(s,[{...b,name:'Changed',date:'Nov 9',location:'Moved'},a,b]).pending.length,0);
});
test('new event alerts once; removed and reappearing events stay silent',()=>{
  const s=success(emptyState(),[a]);
  const b={...a,id:'2'};
  const n=success(s,[b]);
  assert.equal(n.pending.length,1);
  n.pending=[];
  assert.equal(success(n,[a,b]).pending.length,0);
});
test('failed scans preserve baseline and warn only at third failure per episode',()=>{
  const baseline=success(emptyState(),[a]);
  let s=baseline;
  for(let i=1;i<=5;i++) {s=failure(s,'blocked','2026-09-17T12:00:00Z');assert.equal(s.pending.length,i>=3?1:0);}
  assert.deepEqual(s.previous,baseline.previous);
  assert.deepEqual(s.seen,baseline.seen);
  assert.equal(s.lastSuccess,baseline.lastSuccess);
  s=success(s,[a]);
  assert.equal(s.failures,0);
  assert.equal(s.failureEpisode,null);
  assert.throws(()=>success(s,[]));
});
test('pending notifications survive subsequent scans',()=>{
  let s=success(emptyState(),[a]);
  s=success(s,[a,{...a,id:'2'}]);
  assert.deepEqual(success(s,[a]).pending,s.pending);
});
test('Eastern window honors summer, winter, DST transitions and endpoints',()=>{
  for(const [day,offset] of [['2026-07-01',4],['2026-01-01',5],['2026-03-08',4],['2026-11-01',5]]) {
    const at=(h,m=0)=>new Date(`${day}T${String(h+offset).padStart(2,'0')}:${String(m).padStart(2,'0')}:00Z`);
    assert.equal(inWindow(at(7,59)),false);
    assert.equal(inWindow(at(8)),true);
    assert.equal(inWindow(at(17,40)),true);
    assert.equal(inWindow(at(18)),true);
    assert.equal(inWindow(at(18,1)),false);
  }
});
