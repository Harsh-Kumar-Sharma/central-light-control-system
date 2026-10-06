import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { METRICS, clearRulesCache, resolveRuleAlarms } from '../services/sensorService.js';

export const sensorsRouter = Router();

const bad = (res, message) => res.status(400).json({ error: { code: 'INVALID_INPUT', message } });
const num = (v) => (v === null || v === undefined ? null : Number(v));
const RULE_METRICS = ['ambient_lux', 'voltage_v', 'current_a', 'power_w', 'temperature_c'];

// GET /api/sensors/latest - every light with its newest sensor values (sensors: null = never reported any)
sensorsRouter.get('/latest', requireAuth, requirePermission('sensors', 'view'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT r.id, r.device_name, r.lora_address, r.status, ds.online, ds.relay1, ds.relay2,
            s.ambient_lux, s.motion, s.voltage_v, s.current_a, s.power_w, s.energy_kwh, s.temperature_c, s.updated_at
     FROM receivers r
     LEFT JOIN device_status ds ON ds.receiver_id = r.id
     LEFT JOIN device_sensors s ON s.receiver_id = r.id
     ORDER BY r.id`
  );
  res.json({
    metrics: METRICS,
    lights: rows.map((r) => ({
      id: r.id, name: r.device_name, address: r.lora_address, enabled: r.status === 'active',
      online: r.online === null ? null : Boolean(r.online),
      lit: r.relay1 === 1 || r.relay2 === 1,
      sensors: r.updated_at ? {
        ambient_lux: num(r.ambient_lux), motion: r.motion === null ? null : Boolean(r.motion), voltage_v: num(r.voltage_v),
        current_a: num(r.current_a), power_w: num(r.power_w), energy_kwh: num(r.energy_kwh), temperature_c: num(r.temperature_c),
        updated_at: r.updated_at,
      } : null,
    })),
  });
}));

// GET /api/sensors/history?receiverId=&metric=&hours=24
sensorsRouter.get('/history', requireAuth, requirePermission('sensors', 'view'), asyncHandler(async (req, res) => {
  const metric = req.query.metric;
  if (!METRICS[metric]) return bad(res, 'unknown metric');
  const id = Number(req.query.receiverId);
  if (!Number.isInteger(id) || id <= 0) return bad(res, 'receiverId is required');
  const hours = Math.min(Math.max(Number(req.query.hours) || 24, 1), 168);
  const [rows] = await pool.query(
    `SELECT at, ${metric} AS v FROM sensor_readings WHERE receiver_id = ? AND at >= DATE_SUB(NOW(), INTERVAL ? HOUR) AND ${metric} IS NOT NULL ORDER BY at`,
    [id, hours]
  );
  const stride = Math.max(1, Math.ceil(rows.length / 400)); // keep charts light
  const points = rows.filter((_, i) => i % stride === 0 || i === rows.length - 1).map((r) => ({ at: r.at, v: Number(r.v) }));
  res.json({ metric, ...METRICS[metric], hours, points });
}));

/* ---------------- alarm rules ---------------- */
async function validate(b) {
  const out = {};
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name || name.length > 100) return { error: 'name is required (max 100 characters)' };
  out.name = name;
  if (!['threshold', 'lamp_failure'].includes(b.kind)) return { error: 'kind must be threshold or lamp_failure' };
  out.kind = b.kind;
  if (b.kind === 'threshold') {
    if (!RULE_METRICS.includes(b.metric)) return { error: 'pick what to watch' };
    if (!['lt', 'gt'].includes(b.op)) return { error: 'op must be lt (below) or gt (above)' };
    const v = Number(b.value);
    if (b.value === '' || b.value === null || !Number.isFinite(v)) return { error: 'value must be a number' };
    Object.assign(out, { metric: b.metric, op: b.op, value: v });
  } else {
    const v = b.value === '' || b.value === null || b.value === undefined ? 1 : Number(b.value);
    if (!Number.isFinite(v) || v < 0) return { error: 'minimum watts must be 0 or more' };
    Object.assign(out, { metric: null, op: null, value: v });
  }
  out.severity = b.severity === 'critical' ? 'critical' : 'warning';
  if (b.receiver_id === null || b.receiver_id === undefined || b.receiver_id === '') {
    out.receiver_id = null;
  } else {
    const rid = Number(b.receiver_id);
    const [rows] = await pool.query('SELECT id FROM receivers WHERE id = ?', [rid]);
    if (!rows.length) return { error: 'that light does not exist' };
    out.receiver_id = rid;
  }
  out.enabled = b.enabled === false ? 0 : 1;
  return { value: out };
}

sensorsRouter.get('/rules', requireAuth, requirePermission('sensors', 'view'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT sr.*, r.device_name AS light_name FROM sensor_rules sr LEFT JOIN receivers r ON r.id = sr.receiver_id ORDER BY sr.id`
  );
  res.json({ rules: rows.map((r) => ({ ...r, enabled: Boolean(r.enabled), value: num(r.value) })) });
}));

sensorsRouter.post('/rules', requireAuth, requirePermission('sensors', 'configure'), asyncHandler(async (req, res) => {
  const { value, error } = await validate(req.body ?? {});
  if (error) return bad(res, error);
  const cols = Object.keys(value);
  const [r] = await pool.query(`INSERT INTO sensor_rules (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, cols.map((c) => value[c]));
  clearRulesCache();
  res.status(201).json({ id: r.insertId });
}));

sensorsRouter.put('/rules/:id', requireAuth, requirePermission('sensors', 'configure'), asyncHandler(async (req, res) => {
  const body = req.body ?? {};
  const onlyEnabled = Object.keys(body).length === 1 && 'enabled' in body;
  let fields;
  if (onlyEnabled) {
    fields = { enabled: body.enabled ? 1 : 0 };
  } else {
    const v = await validate(body);
    if (v.error) return bad(res, v.error);
    fields = v.value;
  }
  const cols = Object.keys(fields);
  const [r] = await pool.query(`UPDATE sensor_rules SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => fields[c]), req.params.id]);
  if (r.affectedRows === 0) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rule not found' } });
  await resolveRuleAlarms(req.params.id); // re-judged on the next reading
  res.json({ updated: true });
}));

sensorsRouter.delete('/rules/:id', requireAuth, requirePermission('sensors', 'configure'), asyncHandler(async (req, res) => {
  await resolveRuleAlarms(req.params.id);
  const [r] = await pool.query('DELETE FROM sensor_rules WHERE id = ?', [req.params.id]);
  if (r.affectedRows === 0) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rule not found' } });
  clearRulesCache();
  res.json({ deleted: true });
}));
