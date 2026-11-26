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
test('Telegram parts keep event entries together including a link at the old boundary', () => {
  const events = Array.from({length: 80}, (_, i) =>
    `${i + 1}. Concert\nhttps://entertainment.capitalone.com/events/${6752200+i}\n   - Location: Venue\n   - Status: Low tickets`);
  const text = ['Available events', ...events].join('\n\n');
  const parts = splitMessage(text, 379);
  assert.equal(parts.join(''), text);
  assert.ok(parts.every(p => p.length <= 379));
  for (const event of events) assert.ok(parts.some(p => p.includes(event)));
  const url = 'https://example.com/events/6752217';
  const longEntry = 'A'.repeat(70) + '\n' + url + '\n' + 'B'.repeat(70);
  assert.ok(splitMessage(longEntry, 40).some(part => part.includes(url)));
});

test('relay skips idle Telegram calls and reconciles a lost save after a successful send', async t => {
  const settings = {GITHUB_TOKEN:'test', GITHUB_REPOSITORY:'example/monitor', TELEGRAM_BOT_TOKEN:'test'};
  const previousSettings = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  Object.assign(process.env, settings);
  t.after(() => {
    for (const [key, value] of Object.entries(previousSettings)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  let checkpoint = {version:1, initializedAt:'2026-01-01', route:sealRoute('123','test'), welcomeSent:true, deliveries:{}};
  let sha = '0';
  const issues = [];
  const calls = [];
  let failVerifiedSend = false;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.startsWith('https://api.telegram.org/')) {
      const method = url.split('/').at(-1);
      calls.push(method);
      if (method === 'getMe') return Response.json({ok:true,result:{username:'CapitalOneAlertsBot'}});
      if (method === 'sendMessage' && failVerifiedSend) throw new TypeError('network failure');
      return Response.json({ok:true,result:{message_id:10}});
    }
    if (url.includes('/issues?')) return Response.json(issues);
    if (url.includes('/contents/telegram-state.json?ref=')) {
      const content = Buffer.from(JSON.stringify(checkpoint,null,2)+'\n').toString('base64');
      return Response.json({sha,content});
    }
    assert.equal(options.method, 'PUT');
    const update = JSON.parse(options.body);
    assert.equal(update.sha, sha);
    sha = String(Number(sha)+1);
    checkpoint = JSON.parse(Buffer.from(update.content,'base64'));
    if (checkpoint.deliveries['1']?.next === 1) throw new TypeError('lost save response');
    return Response.json({content:{sha}});
  });
  await import('../telegram.mjs?review=idle');
  assert.deepEqual(calls, []);
  const issue={number:1,title:'New event',html_url:'https://example.com/1',body:'<!-- capital-one-monitor:event-1 -->',user:{login:'github-actions[bot]'}};
  issues.push(issue);
  await import('../telegram.mjs?review=pending');
  await import('../telegram.mjs?review=delivered');
  assert.deepEqual(calls,['getMe','sendMessage']);
  assert.deepEqual(checkpoint.deliveries['1'],{done:true});
  issues.push({...issue, number:2});
  failVerifiedSend = true;
  await assert.rejects(import('../telegram.mjs?review=unconfirmed'), /Telegram sendMessage: network/);
  assert.deepEqual(calls,['getMe','sendMessage','getMe','sendMessage']);
  assert.equal(checkpoint.deliveries['2'].next,0);
});
