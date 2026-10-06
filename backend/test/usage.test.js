import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeUsage, uptimePercent, sumUsage } from '../src/services/usage.js';

const H = 3_600_000;
const ev = (hours, o) => ({ at: hours * H, online: 1, relay1: 0, relay2: 0, brightness: null, ...o });

test('hours lit and energy: 100 W for 4 h = 400 Wh', () => {
  const events = [ev(0, {}), ev(2, { relay1: 1 }), ev(6, { relay1: 0 })];
  const u = computeUsage(events, 0, 10 * H, { w1: 100, w2: 50 });
  assert.equal(u.litMs, 4 * H);
  assert.equal(u.wh, 400);
  assert.equal(u.fullWh, 400);
});

test('both relays add up, an unrated relay counts as zero', () => {
  const events = [ev(0, { relay1: 1, relay2: 1 })];
  assert.equal(computeUsage(events, 0, 2 * H, { w1: 100, w2: 50 }).wh, 300);
  assert.equal(computeUsage(events, 0, 2 * H, { w1: 100, w2: null }).wh, 200);
  assert.equal(computeUsage(events, 0, 2 * H, {}).hasRating, false);
});

test('dimming scales power and reports the saving against full power', () => {
  const events = [ev(0, { relay1: 1, brightness: 40 })];
  const u = computeUsage(events, 0, 10 * H, { w1: 100 });
  assert.equal(u.fullWh, 1000);
  assert.equal(u.wh, 400);
});

test('state from before the window carries into it', () => {
  const events = [ev(-5, { relay1: 1 }), ev(3, { relay1: 0 })];
  const u = computeUsage(events, 0, 10 * H, { w1: 100 });
  assert.equal(u.litMs, 3 * H);
});

test('uptime ignores time before the first record', () => {
  const events = [ev(4, {}), ev(6, { online: 0 }), ev(8, { online: 1 })];
  const u = computeUsage(events, 0, 10 * H, { w1: 1 });
  assert.equal(u.unknownMs, 4 * H);
  assert.equal(u.offlineMs, 2 * H);
  assert.equal(u.onlineMs, 4 * H);
  assert.equal(Math.round(uptimePercent(u)), 67);
});

test('a window with no history at all has no uptime figure', () => {
  const u = computeUsage([], 0, 5 * H, { w1: 100 });
  assert.equal(u.unknownMs, 5 * H);
  assert.equal(uptimePercent(u), null);
});

test('offline does not switch the lamp off in the estimate; sum adds lights up', () => {
  const a = computeUsage([ev(0, { relay1: 1, online: 0 })], 0, 2 * H, { w1: 100 });
  assert.equal(a.wh, 200);
  const total = sumUsage([a, a]);
  assert.equal(total.wh, 400);
});

test('empty or reversed windows are zero', () => {
  assert.equal(computeUsage([ev(0, { relay1: 1 })], 5 * H, 5 * H, { w1: 100 }).wh, 0);
  assert.equal(computeUsage([ev(0, { relay1: 1 })], 5 * H, 1 * H, { w1: 100 }).wh, 0);
});
