import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { clockText, fireInstant, isValidTimezone, localParts } from '../services/scheduleTime.js';
import { describeTiming, executeSchedule, getSiteSettings } from '../services/scheduleService.js';

export const schedulesRouter = Router();

const bad = (res, message) => res.status(400).json({ error: { code: 'INVALID_INPUT', message } });
const notFound = (res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Schedule not found' } });

const GROUPS_TABLE = '`groups`'; // GROUPS is a reserved word in MySQL 8
const TARGET_TABLE = { road: 'roads', group: GROUPS_TABLE, receiver: 'receivers', tunnel: 'tunnels' };

// Returns { value } with the cleaned fields, or { error }.
async function validate(body, { partial }) {
  const b = body ?? {};
  const v = {};
  const has = (k) => b[k] !== undefined;

  if (!partial || has('name')) {
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (!name || name.length > 100) return { error: 'name is required (max 100 characters)' };
    v.name = name;
  }
  if (!partial || has('target_type') || has('target_id')) {
    if (!TARGET_TABLE[b.target_type]) return { error: 'target_type must be road, group, receiver or tunnel' };
    const id = Number(b.target_id);
    if (!Number.isInteger(id) || id <= 0) return { error: 'target_id is required' };
    const [rows] = await pool.query(`SELECT id FROM ${TARGET_TABLE[b.target_type]} WHERE id = ?`, [id]);
    if (rows.length === 0) return { error: `That ${b.target_type} does not exist` };
    Object.assign(v, { target_type: b.target_type, target_id: id });
  }
  if (!partial || has('action')) {
    if (!['on', 'off', 'brightness', 'tunnel_mode'].includes(b.action)) return { error: 'action must be on, off, brightness or tunnel_mode' };
    v.action = b.action;
    if ((b.target_type === 'tunnel') !== (b.action === 'tunnel_mode')) return { error: 'a tunnel is switched with a tunnel mode, and a tunnel mode only applies to a tunnel' };
    if (b.action === 'tunnel_mode') {
      if (!['day', 'evening', 'night', 'off'].includes(b.mode)) return { error: 'mode must be day, evening, night or off' };
      v.mode = b.mode;
    } else {
      v.mode = null;
    }
    if (b.action === 'brightness') {
      const n = Number(b.brightness);
      if (!Number.isInteger(n) || n < 1 || n > 99) return { error: 'brightness must be a whole number 1-99' };
      v.brightness = n;
    } else {
      v.brightness = null;
    }
    v.relay = ['1', '2', 'both'].includes(String(b.relay)) ? String(b.relay) : 'both';
  }
  if (!partial || has('trigger_type')) {
    if (!['time', 'sunrise', 'sunset'].includes(b.trigger_type)) return { error: 'trigger_type must be time, sunrise or sunset' };
    v.trigger_type = b.trigger_type;
    if (b.trigger_type === 'time') {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time_of_day ?? '')) return { error: 'time_of_day must be HH:MM (24 hour)' };
      v.time_of_day = b.time_of_day;
      v.offset_minutes = 0;
    } else {
      const off = Number(b.offset_minutes ?? 0);
      if (!Number.isInteger(off) || off < -180 || off > 180) return { error: 'offset_minutes must be between -180 and 180' };
      v.offset_minutes = off;
      v.time_of_day = null;
    }
  }
  if (!partial || has('days')) {
    if (!/^[01]{7}$/.test(b.days ?? '1111111') || b.days === '0000000') return { error: 'pick at least one day' };
    v.days = b.days ?? '1111111';
  }
  if (has('enabled')) v.enabled = b.enabled ? 1 : 0;
  return { value: v };
}

// Today's run counts as already done when the schedule is created or changed
// after its time has passed, so saving "18:30" at 19:00 doesn't fire at once.
async function stampIfPassed(id) {
  const [rows] = await pool.query('SELECT * FROM schedules WHERE id = ?', [id]);
  const s = rows[0];
  if (!s) return;
  const settings = await getSiteSettings();
  const now = new Date();
  const p = localParts(now, settings.timezone);
  const at = fireInstant(s, settings, p.year, p.month, p.day);
  const passed = at && at.getTime() <= now.getTime();
  await pool.query('UPDATE schedules SET last_run_date = ? WHERE id = ?', [passed ? p.dateStr : null, id]);
}

const TARGET_NAME_SQL = `
  CASE s.target_type
    WHEN 'road' THEN (SELECT name FROM roads WHERE id = s.target_id)
    WHEN 'group' THEN (SELECT name FROM ${GROUPS_TABLE} WHERE id = s.target_id)
    WHEN 'tunnel' THEN (SELECT name FROM tunnels WHERE id = s.target_id)
    ELSE (SELECT device_name FROM receivers WHERE id = s.target_id)
  END`;

// GET /api/schedules/settings - site position + timezone, and today's sun times.
schedulesRouter.get('/settings', requireAuth, requirePermission('schedules', 'view'), asyncHandler(async (req, res) => {
  const settings = await getSiteSettings();
  let sun = null;
  if (settings.latitude != null && settings.longitude != null) {
    const p = localParts(new Date(), settings.timezone);
    const at = (type) => fireInstant({ trigger_type: type, offset_minutes: 0 }, settings, p.year, p.month, p.day);
    const rise = at('sunrise');
    const set = at('sunset');
    sun = { sunrise: rise ? clockText(rise, settings.timezone) : null, sunset: set ? clockText(set, settings.timezone) : null };
  }
  res.json({ settings, sun });
}));

schedulesRouter.put('/settings', requireAuth, requirePermission('schedules', 'edit'), asyncHandler(async (req, res) => {
  const { latitude, longitude, timezone } = req.body ?? {};
  const lat = latitude === null || latitude === '' ? null : Number(latitude);
  const lon = longitude === null || longitude === '' ? null : Number(longitude);
  if ((lat == null) !== (lon == null)) return bad(res, 'Give both latitude and longitude, or neither');
  if (lat != null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) return bad(res, 'latitude must be between -90 and 90');
  if (lon != null && (!Number.isFinite(lon) || lon < -180 || lon > 180)) return bad(res, 'longitude must be between -180 and 180');
  if (typeof timezone !== 'string' || !isValidTimezone(timezone)) return bad(res, 'timezone must be a valid IANA name, e.g. Asia/Kolkata');
  await pool.query('UPDATE site_settings SET latitude = ?, longitude = ?, timezone = ? WHERE id = 1', [lat, lon, timezone]);
  // Times may have moved: re-evaluate today's "already ran" mark for every schedule.
  const [ids] = await pool.query('SELECT id FROM schedules');
  for (const { id } of ids) await stampIfPassed(id);
  res.json({ updated: true });
}));

// GET /api/schedules/runs - recent executions, newest first.
schedulesRouter.get('/runs', requireAuth, requirePermission('schedules', 'view'), asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const [rows] = await pool.query('SELECT * FROM schedule_runs ORDER BY id DESC LIMIT ?', [limit]);
  res.json({ runs: rows });
}));

schedulesRouter.get('/', requireAuth, requirePermission('schedules', 'view'), asyncHandler(async (req, res) => {
  const settings = await getSiteSettings();
  const [rows] = await pool.query(
    `SELECT s.*, (${TARGET_NAME_SQL}) AS target_name,
            (SELECT JSON_OBJECT('id', r.id, 'ran_at', r.ran_at, 'kind', r.trigger_kind, 'total', r.total, 'ok', r.ok, 'failed', r.failed, 'skipped', r.skipped, 'note', r.note)
             FROM schedule_runs r WHERE r.schedule_id = s.id ORDER BY r.id DESC LIMIT 1) AS last_run
     FROM schedules s ORDER BY s.id`
  );
  const now = new Date();
  res.json({
    schedules: rows.map((s) => ({
      ...s,
      enabled: Boolean(s.enabled),
      last_run: typeof s.last_run === 'string' ? JSON.parse(s.last_run) : s.last_run,
      needs_location: s.trigger_type !== 'time' && (settings.latitude == null || settings.longitude == null),
      ...describeTiming(s, settings, now),
    })),
    timezone: settings.timezone,
  });
}));

schedulesRouter.post('/', requireAuth, requirePermission('schedules', 'create'), asyncHandler(async (req, res) => {
  const { value, error } = await validate(req.body, { partial: false });
  if (error) return bad(res, error);
  const row = { enabled: 1, ...value, created_by: req.user.sub };
  const cols = Object.keys(row);
  const [result] = await pool.query(`INSERT INTO schedules (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, cols.map((c) => row[c]));
  await stampIfPassed(result.insertId);
  res.status(201).json({ id: result.insertId });
}));

schedulesRouter.put('/:id', requireAuth, requirePermission('schedules', 'edit'), asyncHandler(async (req, res) => {
  // Toggling enabled alone sends just { enabled }; everything else is a full edit.
  const onlyEnabled = req.body && Object.keys(req.body).length === 1 && 'enabled' in req.body;
  let fields;
  if (onlyEnabled) {
    fields = { enabled: req.body.enabled ? 1 : 0 };
  } else {
    const { value, error } = await validate(req.body, { partial: false });
    if (error) return bad(res, error);
    fields = value;
    if ('enabled' in req.body) fields.enabled = req.body.enabled ? 1 : 0;
  }

  const cols = Object.keys(fields);
  const [result] = await pool.query(`UPDATE schedules SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => fields[c]), req.params.id]);
  if (result.affectedRows === 0) return notFound(res);
  await stampIfPassed(req.params.id);
  res.json({ updated: true });
}));

schedulesRouter.delete('/:id', requireAuth, requirePermission('schedules', 'delete'), asyncHandler(async (req, res) => {
  const [result] = await pool.query('DELETE FROM schedules WHERE id = ?', [req.params.id]);
  if (result.affectedRows === 0) return notFound(res);
  res.json({ deleted: true });
}));

// POST /api/schedules/:id/run - run it right now (works even when disabled).
schedulesRouter.post('/:id/run', requireAuth, requirePermission('schedules', 'run'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM schedules WHERE id = ?', [req.params.id]);
  if (!rows[0]) return notFound(res);
  // Run as the person who pressed the button, so the audit log names them.
  res.json(await executeSchedule({ ...rows[0], created_by: req.user.sub }, 'manual'));
}));
