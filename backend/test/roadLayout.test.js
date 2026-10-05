import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLayout, emptyLayout } from '../src/services/roadLayout.js';

const good = () => ({
  version: 1,
  canvas: { width: 1200, height: 700 },
  segments: [{ id: 's1', points: [{ x: 0, y: 0 }, { x: 100, y: 50 }], lanes: 2, curved: true }],
  lights: [{ id: 'l1', receiverId: 5, x: 10.04, y: 20 }],
  labels: [{ id: 't1', text: 'Km 12', x: 5, y: 5, size: 20 }],
});

test('a valid layout passes and numbers are rounded to 1 decimal', () => {
  const r = validateLayout(good());
  assert.equal(r.error, undefined);
  assert.equal(r.layout.lights[0].x, 10);
  assert.equal(r.layout.segments[0].curved, true);
});

test('the empty layout is valid', () => {
  assert.equal(validateLayout(emptyLayout()).error, undefined);
});

test('unknown extra fields are dropped, not stored', () => {
  const input = good();
  input.evil = '<script>';
  input.lights[0].note = 'x';
  const r = validateLayout(input);
  assert.equal(r.layout.evil, undefined);
  assert.equal(r.layout.lights[0].note, undefined);
});

const bad = (mutate, pattern) => {
  const input = good();
  mutate(input);
  const r = validateLayout(input);
  assert.ok(r.error, 'expected an error');
  if (pattern) assert.match(r.error, pattern);
};

test('rejects non-objects', () => {
  assert.ok(validateLayout(null).error);
  assert.ok(validateLayout([]).error);
  assert.ok(validateLayout('x').error);
});
test('rejects a one-point road', () => bad((l) => { l.segments[0].points = [{ x: 1, y: 1 }]; }, /points/));
test('rejects lanes outside 1-8', () => { bad((l) => { l.segments[0].lanes = 0; }, /lanes/); bad((l) => { l.segments[0].lanes = 9; }, /lanes/); });
test('rejects a light without a receiver', () => bad((l) => { l.lights[0].receiverId = 'abc'; }, /receiver/));
test('rejects the same receiver twice on one road', () => bad((l) => { l.lights.push({ id: 'l2', receiverId: 5, x: 1, y: 1 }); }, /more than once/));
test('rejects out-of-range or non-numeric coordinates', () => {
  bad((l) => { l.lights[0].x = 99999; });
  bad((l) => { l.lights[0].y = 'abc'; });
  bad((l) => { l.segments[0].points[0].x = Infinity; });
});
test('rejects duplicate ids and unsafe ids', () => {
  bad((l) => { l.labels.push({ id: 't1', text: 'b', x: 1, y: 1 }); }, /duplicate/);
  bad((l) => { l.lights[0].id = 'has space'; }, /id/);
  bad((l) => { l.lights[0].id = '../etc'; }, /id/);
});
test('rejects empty or over-long label text, and bad sizes', () => {
  bad((l) => { l.labels[0].text = '   '; });
  bad((l) => { l.labels[0].text = 'x'.repeat(81); });
  bad((l) => { l.labels[0].size = 5; });
});
test('rejects a too-small or too-large canvas', () => {
  bad((l) => { l.canvas = { width: 10, height: 10 }; });
  bad((l) => { l.canvas = { width: 7000, height: 700 }; });
});
test('enforces the size limits', () => {
  bad((l) => { l.lights = Array.from({ length: 501 }, (_, i) => ({ id: `l${i}`, receiverId: i + 1, x: 1, y: 1 })); }, /500/);
  bad((l) => { l.segments = Array.from({ length: 201 }, (_, i) => ({ id: `s${i}`, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], lanes: 2 })); }, /200/);
  bad((l) => { l.segments[0].points = Array.from({ length: 61 }, (_, i) => ({ x: i, y: i })); }, /points/);
});
