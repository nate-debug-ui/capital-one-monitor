import test from 'node:test';
import assert from 'node:assert/strict';
import {availability,formatDigest} from '../digest-format.mjs';
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
