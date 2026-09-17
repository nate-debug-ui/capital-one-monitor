import test from 'node:test';
import assert from 'node:assert/strict';
import {sealRoute,openRoute,selectPrivateStart,splitMessage,issueText,isMonitorIssue} from '../telegram-utils.mjs';
test('route is encrypted, authenticated, and bound to bot token',()=>{
  const route=sealRoute('123456789','test-token');
  assert.equal(openRoute(route,'test-token'),'123456789');
  assert.ok(!JSON.stringify(route).includes('123456789'));
  assert.throws(()=>openRoute(route,'different-token'));
  assert.notDeepEqual(route,sealRoute('123456789','test-token'));
});
test('pairing accepts one private Start and rejects ambiguous or group routing',()=>{
  const update=id=>({message:{chat:{type:'private',id},from:{id,is_bot:false},text:'/start'}});
  assert.equal(selectPrivateStart([update(123),update(123)]),'123');
  assert.throws(()=>selectPrivateStart([]));
  assert.throws(()=>selectPrivateStart([update(123),update(456)]));
  const group=update(123);group.message.chat.type='group';
  assert.throws(()=>selectPrivateStart([group]));
});
test('long digest splits without losing content or breaking emoji',()=>{
  const text=('Event 🏟️\n').repeat(1500);
  const parts=splitMessage(text);
  assert.equal(parts.join(''),text);
  assert.ok(parts.every(p=>p.length<=3800));
  assert.ok(parts.every(p=>!/[\uD800-\uDBFF]$/.test(p)));
});
test('only marked bot notifications qualify and text preserves URLs',()=>{
  const issue={title:'Digest',body:'**[Concert](https://example.com/event)**\n<!-- capital-one-digest:2026-09-17 -->',html_url:'https://github.com/example/repo/issues/1',user:{login:'github-actions[bot]'}};
  assert.equal(isMonitorIssue(issue),true);
  assert.equal(isMonitorIssue({...issue,user:{login:'stranger'}}),false);
  assert.equal(isMonitorIssue({...issue,pull_request:{}}),false);
  assert.ok(issueText(issue).includes('https://example.com/event'));
  assert.ok(!issueText(issue).includes('<!--'));
});
