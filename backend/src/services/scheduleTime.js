// Pure time logic for schedules (no database), so it can be unit-tested.
import { sunTimesUtc } from './sun.js';

// If the backend was down at the exact moment, still run a schedule that is
// at most this late. Anything later is skipped, not run at a surprising hour.
export const CATCH_UP_MINUTES = 20;

const formatters = new Map();
function formatter(tz) {
  if (!formatters.has(tz)) {
    formatters.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', weekday: 'short',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    }));
  }
  return formatters.get(tz);
}

export function isValidTimezone(tz) {
  try { formatter(tz); return true; } catch { return false; }
}

const DOW = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

// The wall-clock reading of an instant in a timezone.
export function localParts(date, tz) {
  const p = Object.fromEntries(formatter(tz).formatToParts(date).map((x) => [x.type, x.value]));
  const year = Number(p.year);
  const month = Number(p.month);
  const day = Number(p.day);
  return {
    year, month, day,
    minutes: Number(p.hour) * 60 + Number(p.minute),
    dow: DOW[p.weekday], // Mon = 0 ... Sun = 6
    dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

function offsetMs(date, tz) {
  const p = localParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, Math.floor(p.minutes / 60), p.minutes % 60, date.getUTCSeconds());
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// 'minutes after midnight on y-m-d, wall clock in tz' -> the real instant.
export function localToUtc(y, m, d, minutes, tz) {
  const wall = Date.UTC(y, m - 1, d, 0, minutes);
  let guess = wall;
  for (let i = 0; i < 3; i++) guess = wall - offsetMs(new Date(guess), tz);
  return new Date(guess);
}

const parseHHMM = (s) => {
  const m = /^(\d{2}):(\d{2})$/.exec(s ?? '');
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};

// The instant a schedule fires on local calendar date y-m-d, or null (no sun
// that day, location not set, bad time).
export function fireInstant(s, settings, y, m, d) {
  const tz = settings.timezone;
  if (s.trigger_type === 'time') {
    const min = parseHHMM(s.time_of_day);
    return min == null ? null : localToUtc(y, m, d, min, tz);
  }
  const lat = settings.latitude == null ? null : Number(settings.latitude);
  const lon = settings.longitude == null ? null : Number(settings.longitude);
  if (lat == null || lon == null) return null;
  const want = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  // The sun event can land on the neighbouring UTC day, so try all three.
  for (const shift of [0, -1, 1]) {
    const day = new Date(Date.UTC(y, m - 1, d + shift));
    const t = sunTimesUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), lat, lon);
    const at = s.trigger_type === 'sunrise' ? t.sunrise : t.sunset;
    if (at && localParts(at, tz).dateStr === want) {
      return new Date(at.getTime() + (Number(s.offset_minutes) || 0) * 60_000);
    }
  }
  return null;
}

export const runsOnDow = (s, dow) => s.days?.[dow] === '1';

// Should this schedule run right now?
export function isDue(s, settings, now) {
  if (!s.enabled) return false;
  const p = localParts(now, settings.timezone);
  if (!runsOnDow(s, p.dow) || s.last_run_date === p.dateStr) return false;
  const at = fireInstant(s, settings, p.year, p.month, p.day);
  if (!at) return false;
  const lateMin = (now.getTime() - at.getTime()) / 60_000;
  return lateMin >= 0 && lateMin <= CATCH_UP_MINUTES;
}

// The next instant it will fire, looking up to 8 days ahead; null if never.
export function nextRun(s, settings, now) {
  if (!s.enabled) return null;
  const p = localParts(now, settings.timezone);
  for (let i = 0; i < 9; i++) {
    const day = new Date(Date.UTC(p.year, p.month - 1, p.day + i));
    const dow = (day.getUTCDay() + 6) % 7;
    if (!runsOnDow(s, dow)) continue;
    const at = fireInstant(s, settings, day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate());
    if (at && at.getTime() > now.getTime()) return at;
  }
  return null;
}

// "HH:MM" wall clock of an instant, in the site timezone.
export function clockText(date, tz) {
  const p = localParts(date, tz);
  return `${String(Math.floor(p.minutes / 60)).padStart(2, '0')}:${String(p.minutes % 60).padStart(2, '0')}`;
}
