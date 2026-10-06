// Turns a device's reply to a status query into { relay1, relay2, brightness,
// rssi, snr } (null = not reported). The firmware's real reply format isn't
// documented, so this accepts the PRD's JSON shape {relay1, relay2,
// brightness} plus common variants, and falls back to scanning plain text.
// Returns null when nothing recognisable was found.

const TRUE_WORDS = new Set(['on', '1', 'true', 'high', 'yes']);
const FALSE_WORDS = new Set(['off', '0', 'false', 'low', 'no']);

function toBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1 ? true : v === 0 ? false : null;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (TRUE_WORDS.has(s)) return true;
    if (FALSE_WORDS.has(s)) return false;
  }
  return null;
}

// Device brightness is a 0–100 level; anything outside is treated as "not reported".
function toBrightness(v) {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n) : null;
}

const toNumber = (v) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

// Sensor readings that may ride along in the same reply. Each has a plausible range;
// anything outside it is treated as "not reported" rather than stored as nonsense.
//   ambient  lux     (outside light)        voltage  V      current  A
//   power    W       energy   kWh           temperature  C   motion  on/off
// "lux" alone is ambiguous: older firmware uses it for the dimming level. It counts as the
// dimming level (legacy) unless the reply also has an explicit brightness/dim/level key,
// or the number is above 100 (a dimming level never is) - then it is ambient light.
const SENSOR_RANGE = { ambient: [0, 200000], voltage: [0, 1000], current: [0, 1000], power: [0, 1000000], energy: [0, 1e9], temperature: [-60, 200] };
const SENSOR_ALIASES = {
  ambient: ['ambient', 'ambientlux', 'ambientlight', 'illuminance', 'ldr', 'luxsensor', 'lightlevel'],
  voltage: ['voltage', 'volt', 'volts', 'vac', 'v'],
  current: ['current', 'amp', 'amps', 'ampere', 'amperes'],
  power: ['power', 'watt', 'watts', 'pwr', 'activepower'],
  energy: ['energy', 'kwh'],
  temperature: ['temperature', 'temp'],
  motion: ['motion', 'pir', 'presence', 'occupancy'],
};
const inRange = (name, n) => (n !== null && n >= SENSOR_RANGE[name][0] && n <= SENSOR_RANGE[name][1] ? n : null);
const emptySensors = () => ({ ambient: null, motion: null, voltage: null, current: null, power: null, energy: null, temperature: null });
export const hasSensors = (sensors) => Object.values(sensors ?? {}).some((v) => v !== null);

const KEY_ALIASES = {
  relay1: ['relay1', 'r1'],
  relay2: ['relay2', 'r2'],
  brightness: ['brightness', 'dim', 'dimming', 'level'],
  rssi: ['rssi'],
  snr: ['snr'],
};
const normalizeKey = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');

function fromObject(obj) {
  // Look one level into wrappers such as {status:{...}} / {data:{...}}.
  const flat = { ...obj };
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) Object.assign(flat, value);
  }
  const out = { relay1: null, relay2: null, brightness: null, rssi: null, snr: null, sensors: emptySensors() };
  let luxRaw = null;
  for (const [rawKey, value] of Object.entries(flat)) {
    const key = normalizeKey(rawKey);
    if (KEY_ALIASES.relay1.includes(key)) out.relay1 = toBool(value) ?? out.relay1;
    else if (KEY_ALIASES.relay2.includes(key)) out.relay2 = toBool(value) ?? out.relay2;
    else if (KEY_ALIASES.brightness.includes(key)) out.brightness = toBrightness(value) ?? out.brightness;
    else if (KEY_ALIASES.rssi.includes(key)) out.rssi = toNumber(value) ?? out.rssi;
    else if (KEY_ALIASES.snr.includes(key)) out.snr = toNumber(value) ?? out.snr;
    else if (key === 'lux') luxRaw = toNumber(value);
    else {
      for (const [name, aliases] of Object.entries(SENSOR_ALIASES)) {
        if (!aliases.includes(key)) continue;
        if (name === 'motion') out.sensors.motion = toBool(value) ?? out.sensors.motion;
        else out.sensors[name] = inRange(name, toNumber(value)) ?? out.sensors[name];
      }
    }
  }
  if (luxRaw !== null) {
    const explicitBrightness = Object.keys(flat).some((k) => KEY_ALIASES.brightness.includes(normalizeKey(k)));
    if (explicitBrightness || luxRaw > 100) out.sensors.ambient = inRange('ambient', luxRaw) ?? out.sensors.ambient;
    else out.brightness = toBrightness(luxRaw) ?? out.brightness;
  }
  // An ACK such as {"message":"ACK:R1ON"} also states a relay, via the text rules.
  if (typeof obj.message === 'string') {
    const fromText = fromPlainText(obj.message);
    if (fromText) for (const k of ['relay1', 'relay2', 'brightness']) if (out[k] === null) out[k] = fromText[k];
  }
  return out;
}

function fromPlainText(text) {
  const out = { relay1: null, relay2: null, brightness: null, rssi: null, snr: null, sensors: emptySensors() };
  // (?<![a-z0-9]) rather than \b so "_R1ON" / "ACK:R1ON" still match.
  const relay = (n) => text.match(new RegExp(`(?:relay[\\s_]*${n}|(?<![a-z0-9])r${n})\\s*[:=_\\s-]*\\s*(on|off|1|0|true|false)(?![a-z0-9])`, 'i'));
  const r1 = relay(1);
  const r2 = relay(2);
  if (r1) out.relay1 = toBool(r1[1]);
  if (r2) out.relay2 = toBool(r2[1]);
  const b = text.match(/(?:brightness|lux|dim(?:ming)?|level)[\s_]*[:=_\s-]*\s*(\d{1,3})(?!\d)/i);
  if (b) out.brightness = toBrightness(Number(b[1]));
  // Sensors in plain text: "voltage=230 power:148 ambient=320 motion:on". "lux 320" (more than 3 digits of
  // dimming level is impossible) is ambient light.
  const val = (names) => { const m = text.match(new RegExp('(?<![a-z0-9])(?:' + names + ')\\s*[:=]\\s*(-?\\d+(?:\\.\\d+)?)', 'i')); return m ? Number(m[1]) : null; };
  out.sensors.ambient = inRange('ambient', val('ambient(?:[\\s_]*lux)?|illuminance|ldr'));
  if (out.sensors.ambient === null) {
    const lux = text.match(/(?<![a-z0-9])lux\s*[:=]?\s*(\d{4,6}|1\d\d|[2-9]\d\d)(?!\d)/i);
    if (lux) { out.sensors.ambient = inRange('ambient', Number(lux[1])); out.brightness = null; }
  }
  out.sensors.voltage = inRange('voltage', val('voltage|volts?|vac'));
  out.sensors.current = inRange('current', val('current|amps?'));
  out.sensors.power = inRange('power', val('power|watts?|pwr'));
  out.sensors.energy = inRange('energy', val('energy|kwh'));
  out.sensors.temperature = inRange('temperature', val('temperature|temp'));
  const motion = text.match(/(?<![a-z0-9])(?:motion|pir|presence)\s*[:=]\s*(on|off|1|0|true|false)(?![a-z0-9])/i);
  if (motion) out.sensors.motion = toBool(motion[1]);
  const rssi = text.match(/rssi\s*[:=]\s*(-?\d+)/i);
  if (rssi) out.rssi = Number(rssi[1]);
  const snr = text.match(/snr\s*[:=]\s*(-?\d+)/i);
  if (snr) out.snr = Number(snr[1]);
  return out;
}

export function parseStatusReply(reply) {
  if (typeof reply !== 'string' || reply.trim() === '') return null;
  const text = reply.trim();

  let parsed = null;
  try {
    const json = JSON.parse(text);
    if (json && typeof json === 'object' && !Array.isArray(json)) parsed = fromObject(json);
  } catch {
    parsed = fromPlainText(text);
  }
  if (!parsed) return null;

  const hasState = parsed.relay1 !== null || parsed.relay2 !== null || parsed.brightness !== null;
  return hasState || hasSensors(parsed.sensors) ? parsed : null;
}

// An acknowledgement of a command, in either shape seen so far:
//   JSON   {"source":2,"message":"ACK:R1ON","rssi":-70,"snr":8}
//   serial LoRa << +OK
//          Reply Address:2,Message:ACK:R1ON
// Returns { command, source, rssi, snr } or null when the reply holds no ACK.
export function parseAckReply(reply) {
  if (typeof reply !== 'string' || reply.trim() === '') return null;
  const text = reply.trim();
  const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);

  try {
    const json = JSON.parse(text);
    if (json && typeof json === 'object' && typeof json.message === 'string' && /^ACK[:=_ ]/i.test(json.message)) {
      return { command: json.message.replace(/^ACK[:=_ ]\s*/i, ''), source: num(json.source), rssi: num(json.rssi), snr: num(json.snr) };
    }
    return null;
  } catch { /* not JSON: fall through to the text forms */ }

  const m = text.match(/Message\s*[:=]\s*ACK[:=_ ]\s*([A-Za-z0-9_]+)/i) ?? text.match(/(?<![A-Za-z0-9])ACK:([A-Za-z0-9_]+)/i);
  if (!m) return null;
  const source = text.match(/Reply\s*Address\s*[:=]\s*(\d+)/i);
  const rssi = text.match(/rssi\s*[:=]\s*(-?\d+)/i);
  const snr = text.match(/snr\s*[:=]\s*(-?\d+)/i);
  return { command: m[1], source: source ? Number(source[1]) : null, rssi: rssi ? Number(rssi[1]) : null, snr: snr ? Number(snr[1]) : null };
}

// True once a reply looks finished, so callers can stop waiting early:
// complete JSON, or a serial-style "Message:<text>" line that has ended.
export function isReplyComplete(text) {
  if (typeof text !== 'string') return false;
  try { JSON.parse(text.trim()); return true; } catch { /* not JSON */ }
  return /Message\s*[:=]\s*[^\r\n]+\r?\n/i.test(text);
}
