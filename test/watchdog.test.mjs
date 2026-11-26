import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState, success, failure} from '../core.mjs';
import {updatePrimaryHealth} from '../watchdog.mjs';

const start = Date.parse('2026-11-26T10:00:00Z');
const at = minutes => new Date(start + minutes * 60000);
const event = {id: '1', name: 'Concert'};

function scan(beforeScan, minute, {backup = false, ok = true} = {}) {
  const now = at(minute);
  const state = ok ? success(beforeScan, [event], now.toISOString())
    : failure(beforeScan, 'page unavailable', now.toISOString());
  updatePrimaryHealth(state, {beforeScan, backup, scanSucceeded: ok, now});
  return state;
}

test('backup scans share the legacy baseline without masking an overdue primary or duplicating warnings', () => {
  let state = success(emptyState(), [event], at(0).toISOString());
  state = scan(state, 60, {backup: true});
  assert.equal(state.lastPrimarySuccess, at(0).toISOString());
  assert.deepEqual(state.pending, []);
  state = scan(state, 65, {backup: true});
  state = scan(state, 125, {backup: true});
  assert.equal(state.lastSuccess, at(125).toISOString());
  assert.deepEqual(state.pending.map(x => x.key), [`overdue-${at(0).toISOString()}`]);
  state = scan(state, 130);
  state = scan(state, 150);
  assert.deepEqual(state.pending.map(x => x.key), [
    `overdue-${at(0).toISOString()}`, `recovered-${at(0).toISOString()}`,
  ]);
  assert.equal(state.lastPrimarySuccess, at(150).toISOString());
});

test('the first backup can establish a baseline and still detect a primary that has never succeeded', () => {
  let state = scan(emptyState(), 0, {backup: true});
  state = scan(state, 60, {ok: false});
  assert.deepEqual(state.pending, []);
  state = scan(state, 120, {backup: true});
  assert.equal(state.lastPrimarySuccess, null);
  assert.equal(state.pending[0].key, `overdue-${at(0).toISOString()}`);
});
