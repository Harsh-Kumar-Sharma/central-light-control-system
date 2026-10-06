import { pool } from '../db/pool.js';
import { getSiteSettings } from './scheduleService.js';
import { localParts, localToUtc } from './scheduleTime.js';
import { computeUsage, sumUsage, uptimePercent } from './usage.js';

const MAX_DAYS = 92;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BAD = ['FAILED', 'TIMEOUT', 'NO_ACK', 'INVALID_COMMAND', 'INVALID_PARAMETER', 'DEVICE_OFFLINE', 'TRANSMITTER_OFFLINE', 'DISABLED'];

export async function getReportSettings() {
  const [rows] = await pool.query('SELECT tariff_per_kwh, currency FROM site_settings WHERE id = 1');
  return { tariff: rows[0]?.tariff_per_kwh == null ? null : Number(rows[0].tariff_per_kwh), currency: rows[0]?.currency ?? 'INR' };
}

const addDays = (dateStr, n) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};

// from/to are local calendar dates (inclusive) in the site timezone.
// Returns { error } or { from, to, fromMs, toMs, days: [{ date, startMs, endMs }] }.
export function parseRange(query, settings, now = new Date()) {
  const tz = settings.timezone;
  const today = localParts(now, tz).dateStr;
  const to = DATE_RE.test(query.to ?? '') ? query.to : today;
  const from = DATE_RE.test(query.from ?? '') ? query.from : addDays(to, -6);
  if (from > to) return { error: 'from must be on or before to' };
  const dayList = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    dayList.push(d);
    if (dayList.length > MAX_DAYS) return { error: `Pick at most ${MAX_DAYS} days` };
  }
  const startOf = (d) => {
    const [y, m, dd] = d.split('-').map(Number);
    return localToUtc(y, m, dd, 0, tz).getTime();
  };
  const nowMs = now.getTime();
  const days = dayList.map((date) => ({ date, startMs: startOf(date), endMs: Math.min(startOf(addDays(date, 1)), nowMs) }))
    .filter((d) => d.endMs > d.startMs); // days that have not started yet are dropped
  return { from, to, fromMs: startOf(from), toMs: Math.min(startOf(addDays(to, 1)), nowMs), days };
}

async function receiversFor(roadId) {
  const [rx] = await pool.query(
    `SELECT r.id, r.device_name, r.lora_address, r.relay1_name, r.relay2_name, r.relay1_watts, r.relay2_watts, r.status
     FROM receivers r ORDER BY r.id`
  );
  const [roads] = await pool.query('SELECT id, name, layout_json FROM roads ORDER BY name');
  const roadsOf = new Map();
  let allowed = null;
  for (const road of roads) {
    const layout = typeof road.layout_json === 'string' ? JSON.parse(road.layout_json) : road.layout_json;
    const ids = new Set((layout.lights ?? []).map((l) => l.receiverId));
    for (const id of ids) roadsOf.set(id, [...(roadsOf.get(id) ?? []), road.name]);
    if (roadId && String(road.id) === String(roadId)) allowed = ids;
  }
  const list = roadId ? rx.filter((r) => allowed?.has(r.id)) : rx;
  return { receivers: list.map((r) => ({ ...r, roads: roadsOf.get(r.id) ?? [] })), roads: roads.map((r) => ({ id: r.id, name: r.name })) };
}

async function loadEvents(ids, fromMs, toMs) {
  const byId = new Map(ids.map((id) => [id, []]));
  if (!ids.length) return byId;
  const map = (r) => ({ at: new Date(r.at).getTime(), online: r.online, relay1: r.relay1, relay2: r.relay2, brightness: r.brightness });
  const [baseline] = await pool.query(
    `SELECT l.* FROM light_state_log l
     JOIN (SELECT receiver_id, MAX(id) AS id FROM light_state_log WHERE receiver_id IN (?) AND at < FROM_UNIXTIME(?) GROUP BY receiver_id) x ON x.id = l.id`,
    [ids, fromMs / 1000]
  );
  const [inRange] = await pool.query(
    'SELECT * FROM light_state_log WHERE receiver_id IN (?) AND at >= FROM_UNIXTIME(?) AND at < FROM_UNIXTIME(?) ORDER BY at, id',
    [ids, fromMs / 1000, toMs / 1000]
  );
  for (const r of baseline) byId.get(r.receiver_id).push(map(r));
  for (const r of inRange) byId.get(r.receiver_id).push(map(r));
  return byId;
}

const hours = (ms) => Math.round((ms / 3_600_000) * 100) / 100;
const round2 = (n) => Math.round(n * 100) / 100;

export async function buildOverview(query) {
  const settings = await getSiteSettings();
  const range = parseRange(query, settings);
  if (range.error) return { error: range.error };
  const { tariff, currency } = await getReportSettings();
  const { receivers, roads } = await receiversFor(query.roadId);
  const ids = receivers.map((r) => r.id);
  const events = await loadEvents(ids, range.fromMs, range.toMs);

  const usages = [];
  const lights = receivers.map((r) => {
    const watts = { w1: r.relay1_watts, w2: r.relay2_watts };
    const ev = events.get(r.id);
    const u = computeUsage(ev, range.fromMs, range.toMs, watts);
    usages.push({ id: r.id, u, ev, watts });
    const kwh = u.hasRating ? round2(u.wh / 1000) : null;
    return {
      id: r.id, name: r.device_name, address: r.lora_address, roads: r.roads, enabled: r.status === 'active',
      relay1_watts: r.relay1_watts, relay2_watts: r.relay2_watts,
      uptime: uptimePercent(u) == null ? null : round2(uptimePercent(u)),
      lit_hours: hours(u.litMs), kwh,
      cost: kwh != null && tariff != null ? round2(kwh * tariff) : null,
      rated: u.hasRating,
    };
  });

  const total = sumUsage(usages.map((x) => x.u));
  const rated = lights.filter((l) => l.rated).length;
  const knownMs = total.onlineMs + total.offlineMs;
  const kwh = round2(total.wh / 1000);
  const savedKwh = round2((total.fullWh - total.wh) / 1000);

  const daily = range.days.map((d) => {
    const parts = usages.map((x) => computeUsage(x.ev, d.startMs, d.endMs, x.watts));
    const s = sumUsage(parts);
    return { date: d.date, kwh: round2(s.wh / 1000), lit_hours: hours(s.litMs) };
  });

  const [[cmd]] = await pool.query(
    `SELECT COUNT(*) AS total, COALESCE(SUM(status IN (?)), 0) AS failed, COALESCE(SUM(user_role = 'Scheduler'), 0) AS by_schedule
     FROM commands WHERE created_at >= FROM_UNIXTIME(?) AND created_at < FROM_UNIXTIME(?)`,
    [BAD, range.fromMs / 1000, range.toMs / 1000]
  );
  const [[alm]] = await pool.query(
    `SELECT COUNT(*) AS raised, COALESCE(SUM(severity = 'critical'), 0) AS critical,
            COALESCE(SUM(status = 'resolved'), 0) AS resolved,
            AVG(CASE WHEN status = 'resolved' THEN TIMESTAMPDIFF(MINUTE, raised_at, resolved_at) END) AS avg_minutes
     FROM alarms WHERE raised_at >= FROM_UNIXTIME(?) AND raised_at < FROM_UNIXTIME(?)`,
    [range.fromMs / 1000, range.toMs / 1000]
  );

  return {
    range: { from: range.from, to: range.to, timezone: settings.timezone },
    roads,
    settings: { tariff, currency },
    totals: {
      lights: lights.length, rated, unrated: lights.length - rated,
      kwh, saved_kwh: savedKwh,
      cost: tariff != null ? round2(kwh * tariff) : null,
      saved_cost: tariff != null ? round2(savedKwh * tariff) : null,
      lit_hours: hours(total.litMs),
      uptime: knownMs > 0 ? round2((total.onlineMs / knownMs) * 100) : null,
      history_gap_hours: hours(total.unknownMs),
    },
    lights,
    daily,
    commands: { total: Number(cmd.total), failed: Number(cmd.failed), by_schedule: Number(cmd.by_schedule), by_person: Number(cmd.total) - Number(cmd.by_schedule) },
    alarms: {
      raised: Number(alm.raised), critical: Number(alm.critical), resolved: Number(alm.resolved),
      avg_resolve_minutes: alm.avg_minutes == null ? null : Math.round(Number(alm.avg_minutes)),
    },
  };
}

/* ---------------- CSV ---------------- */
const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
// BOM so Excel reads UTF-8 correctly.
export const toCsv = (header, rows) => `﻿${[header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;

export async function buildCsv(kind, query) {
  const settings = await getSiteSettings();
  const range = parseRange(query, settings);
  if (range.error) return { error: range.error };

  if (kind === 'lights') {
    const o = await buildOverview(query);
    const cur = o.settings.currency;
    return {
      filename: `lights_${o.range.from}_${o.range.to}.csv`,
      body: toCsv(
        ['Light', 'Address', 'Roads', 'Relay 1 watts', 'Relay 2 watts', 'Uptime %', 'Hours lit', 'Est. energy kWh', `Est. cost ${cur}`],
        o.lights.map((l) => [l.name, l.address, l.roads.join(' / '), l.relay1_watts, l.relay2_watts, l.uptime, l.lit_hours, l.kwh, l.cost])
      ),
    };
  }
  if (kind === 'commands') {
    const [rows] = await pool.query(
      `SELECT c.created_at, r.device_name, c.command, c.parameter, c.command_string, c.status, u.username, c.user_role
       FROM commands c JOIN receivers r ON r.id = c.receiver_id JOIN users u ON u.id = c.user_id
       WHERE c.created_at >= FROM_UNIXTIME(?) AND c.created_at < FROM_UNIXTIME(?) ORDER BY c.created_at DESC LIMIT 20000`,
      [range.fromMs / 1000, range.toMs / 1000]
    );
    return {
      filename: `commands_${range.from}_${range.to}.csv`,
      body: toCsv(['Time (UTC)', 'Light', 'Command', 'Parameter', 'Sent text', 'Status', 'User', 'Role'],
        rows.map((r) => [r.created_at, r.device_name, r.command, r.parameter, r.command_string, r.status, r.username, r.user_role])),
    };
  }
  if (kind === 'alarms') {
    const [rows] = await pool.query(
      `SELECT a.raised_at, a.type, a.severity, a.title, a.detail, a.status, a.resolved_at, u.username AS ack_by
       FROM alarms a LEFT JOIN users u ON u.id = a.acknowledged_by
       WHERE a.raised_at >= FROM_UNIXTIME(?) AND a.raised_at < FROM_UNIXTIME(?) ORDER BY a.raised_at DESC`,
      [range.fromMs / 1000, range.toMs / 1000]
    );
    return {
      filename: `alarms_${range.from}_${range.to}.csv`,
      body: toCsv(['Raised (UTC)', 'Type', 'Severity', 'Title', 'Detail', 'Status', 'Resolved (UTC)', 'Acknowledged by'],
        rows.map((r) => [r.raised_at, r.type, r.severity, r.title, r.detail, r.status, r.resolved_at, r.ack_by])),
    };
  }
  return { error: 'kind must be lights, commands or alarms' };
}
