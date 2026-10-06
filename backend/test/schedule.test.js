import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sunTimesUtc } from '../src/services/sun.js';
import { clockText, fireInstant, isDue, localParts, localToUtc, nextRun, isValidTimezone } from '../src/services/scheduleTime.js';

const IST = 'Asia/Kolkata';
const settings = { timezone: IST, latitude: 28.6139, longitude: 77.209 }; // New Delhi
const base = { enabled: 1, days: '1111111', last_run_date: null, offset_minutes: 0 };

test('sunrise/sunset for New Delhi on the June solstice are within 5 min of the almanac', () => {
  const s = fireInstant({ ...base, trigger_type: 'sunrise' }, settings, 2026, 6, 21);
  const e = fireInstant({ ...base, trigger_type: 'sunset' }, settings, 2026, 6, 21);
  const mins = (d) => { const t = clockText(d, IST).split(':'); return Number(t[0]) * 60 + Number(t[1]); };
  assert.ok(Math.abs(mins(s) - (5 * 60 + 23)) <= 5, `sunrise ${clockText(s, IST)}`);
  assert.ok(Math.abs(mins(e) - (19 * 60 + 22)) <= 5, `sunset ${clockText(e, IST)}`);
});

test('winter days are shorter than summer days', () => {
  const len = (m, d) => {
    const rise = fireInstant({ ...base, trigger_type: 'sunrise' }, settings, 2026, m, d);
    const set = fireInstant({ ...base, trigger_type: 'sunset' }, settings, 2026, m, d);
    return (set - rise) / 3600_000;
  };
  assert.ok(len(6, 21) > 13.5 && len(12, 21) < 10.8, `${len(6, 21)} / ${len(12, 21)}`);
});

test('polar night has no sunrise', () => {
  const t = sunTimesUtc(2026, 12, 21, 78, 15);
  assert.equal(t.sunrise, null);
});

test('localToUtc converts wall clock to the right instant (IST = UTC+5:30)', () => {
  assert.equal(localToUtc(2026, 10, 6, 18 * 60 + 30, IST).toISOString(), '2026-10-06T13:00:00.000Z');
  assert.equal(localToUtc(2026, 1, 15, 12 * 60, 'America/New_York').toISOString(), '2026-01-15T17:00:00.000Z');
});

test('a fixed-time schedule is due only inside the catch-up window, once a day', () => {
  const s = { ...base, trigger_type: 'time', time_of_day: '18:30' };
  const at = (hh, mm) => new Date(Date.UTC(2026, 9, 6, hh, mm)); // IST 18:30 = 13:00Z
  assert.equal(isDue(s, settings, at(12, 59)), false, 'a minute early');
  assert.equal(isDue(s, settings, at(13, 0)), true);
  assert.equal(isDue(s, settings, at(13, 15)), true, 'caught up after a short outage');
  assert.equal(isDue(s, settings, at(13, 45)), false, 'too late, skipped');
  assert.equal(isDue({ ...s, last_run_date: '2026-10-06' }, settings, at(13, 0)), false, 'already ran today');
  assert.equal(isDue({ ...s, enabled: 0 }, settings, at(13, 0)), false);
});

test('day mask: a Mon-only schedule does not run on Tuesday (2026-10-06 is a Tuesday)', () => {
  const s = { ...base, days: '1000000', trigger_type: 'time', time_of_day: '18:30' };
  assert.equal(localParts(new Date('2026-10-06T13:00:00Z'), IST).dow, 1);
  assert.equal(isDue(s, settings, new Date('2026-10-06T13:00:00Z')), false);
  const next = nextRun(s, settings, new Date('2026-10-06T13:01:00Z'));
  assert.equal(next.toISOString(), '2026-10-12T13:00:00.000Z'); // next Monday
});

test('sunset offset moves the time; sun schedules need a location', () => {
  const plain = fireInstant({ ...base, trigger_type: 'sunset' }, settings, 2026, 10, 6);
  const early = fireInstant({ ...base, trigger_type: 'sunset', offset_minutes: -15 }, settings, 2026, 10, 6);
  assert.equal(plain - early, 15 * 60_000);
  assert.equal(fireInstant({ ...base, trigger_type: 'sunset' }, { timezone: IST, latitude: null, longitude: null }, 2026, 10, 6), null);
});

test('nextRun rolls to tomorrow once today has passed', () => {
  const s = { ...base, trigger_type: 'time', time_of_day: '06:00' };
  const next = nextRun(s, settings, new Date('2026-10-06T13:00:00Z'));
  assert.equal(next.toISOString(), '2026-10-07T00:30:00.000Z');
});

test('timezone validation', () => {
  assert.ok(isValidTimezone('Asia/Kolkata'));
  assert.ok(!isValidTimezone('Mars/Olympus'));
});
