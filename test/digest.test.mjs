import test from 'node:test';
import assert from 'node:assert/strict';
import {availability,formatDigest,digestIdentity} from '../digest-format.mjs';
test('scheduled and externally dispatched daily digests share the Eastern-date delivery key',()=>{
  const now = new Date('2026-11-06T00:30:00Z');
  const scheduled = digestIdentity({event:'schedule',runId:'1',now});
  const dispatched = digestIdentity({event:'workflow_dispatch',runId:'2',mode:'daily',now});
  assert.deepEqual(scheduled,{date:'2026-11-05',isTest:false,key:'2026-11-05'});
  assert.deepEqual(dispatched,scheduled);
  assert.equal(digestIdentity({event:'workflow_dispatch',runId:'3',mode:'daily',now:new Date('2026-11-06T04:59:00Z')}).key,scheduled.key);
  assert.equal(digestIdentity({event:'workflow_dispatch',runId:'4',mode:'daily',now:new Date('2026-11-06T05:00:00Z')}).key,'2026-11-06');
});
test('manual tests retain separate run keys and invalid delivery modes are rejected',()=>{
  const now = new Date('2026-11-06T12:30:00Z');
  assert.deepEqual(digestIdentity({event:'workflow_dispatch',runId:'123',now}),{date:'2026-11-06',isTest:true,key:'test-123'});
  assert.equal(digestIdentity({event:'workflow_dispatch',runId:'456',mode:'test',now}).key,'test-456');
  assert.throws(()=>digestIdentity({event:'workflow_dispatch',runId:'123',mode:'typo',now}),/Invalid digest delivery mode/);
});
test('availability distinguishes sold out, low tickets, and unlabelled events',()=>{
  assert.equal(availability(['SOLD  OUT']).soldOut,true);
  assert.equal(availability(['Low tickets','Get tickets']).soldOut,false);
  assert.equal(availability(['Get tickets']).status,'Tickets listed');
  assert.equal(availability(['Learn more']).status,'Not marked sold out');
});
test('digest excludes sold out, deduplicates and includes event details',()=>{
  const a={id:'1',name:'Concert',date:'Sep 20 • 8:00pm',location:'Venue • City',url:'https://entertainment.capitalone.com/events/1',soldOut:false,status:'Low tickets'};
  const result=formatDigest([a,a,{...a,id:'2',name:'Unavailable',soldOut:true}]);
  assert.equal(result.count,1);
  assert.ok(result.body.includes(a.url));
  assert.ok(result.body.includes(a.date));
  assert.ok(result.body.includes(a.location));
  assert.ok(!result.body.includes('Unavailable'));
});
test('digest rejects missing availability and reports a valid zero-available result',()=>{
  assert.throws(()=>formatDigest([]));
  assert.throws(()=>formatDigest([{id:'1'}]));
  assert.equal(formatDigest([{id:'1',soldOut:true}]).count,0);
});
