import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effective, sanitize, has, MODULES } from '../src/services/permissions.js';

test('Admin always has every action, even with a restrictive override', () => {
  const p = effective('Admin', { devices: ['view'] });
  for (const [m, d] of Object.entries(MODULES)) {
    for (const a of Object.keys(d.actions)) assert.ok(has(p, m, a), `${m}.${a}`);
  }
});

test('a user without an override gets the role template', () => {
  const p = effective('Operator', null);
  assert.ok(has(p, 'control', 'control'));
  assert.ok(!has(p, 'devices', 'delete'));
  assert.ok(!has(p, 'users', 'view'));
});

test('an override replaces the template and ignores unknown modules/actions', () => {
  const p = effective('User', JSON.stringify({ control: ['view', 'control', 'nope'], bogus: ['view'] }));
  assert.deepEqual(p, { control: ['view', 'control'] });
  assert.ok(!has(p, 'dashboard', 'view'));
});

test('sanitize handles junk input', () => {
  assert.deepEqual(sanitize(null), {});
  assert.deepEqual(sanitize({ devices: 'view' }), {});
});
