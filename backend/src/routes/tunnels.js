import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { MODES, ZONE_KINDS, applyMode, jobOf, loadTunnels, replaceZones } from '../services/tunnelService.js';

export const tunnelsRouter = Router();

const bad = (res, message) => res.status(400).json({ error: { code: 'INVALID_INPUT', message } });
const notFound = (res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tunnel not found' } });

function cleanTunnel(b) {
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name || name.length > 100) return { error: 'name is required (max 100 characters)' };
  const description = typeof b.description === 'string' && b.description.trim() ? b.description.trim().slice(0, 255) : null;
  let length = null;
  if (b.length_m !== undefined && b.length_m !== null && b.length_m !== '') {
    length = Number(b.length_m);
    if (!Number.isInteger(length) || length < 0 || length > 100000) return { error: 'length must be a whole number of metres (0-100000)' };
  }
  return { value: { name, description, length_m: length } };
}

// GET /api/tunnels
tunnelsRouter.get('/', requireAuth, requirePermission('tunnels', 'view'), asyncHandler(async (req, res) => {
  res.json({ tunnels: await loadTunnels() });
}));

tunnelsRouter.post('/', requireAuth, requirePermission('tunnels', 'create'), asyncHandler(async (req, res) => {
  const { value, error } = cleanTunnel(req.body ?? {});
  if (error) return bad(res, error);
  try {
    const [r] = await pool.query('INSERT INTO tunnels (name, description, length_m, created_by) VALUES (?, ?, ?, ?)', [value.name, value.description, value.length_m, req.user.sub]);
    res.status(201).json({ id: r.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: { code: 'CONFLICT', message: 'A tunnel with that name already exists' } });
    throw err;
  }
}));

tunnelsRouter.put('/:id', requireAuth, requirePermission('tunnels', 'edit'), asyncHandler(async (req, res) => {
  const { value, error } = cleanTunnel(req.body ?? {});
  if (error) return bad(res, error);
  try {
    const [r] = await pool.query('UPDATE tunnels SET name = ?, description = ?, length_m = ? WHERE id = ?', [value.name, value.description, value.length_m, req.params.id]);
    if (r.affectedRows === 0) return notFound(res);
    res.json({ updated: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: { code: 'CONFLICT', message: 'A tunnel with that name already exists' } });
    throw err;
  }
}));

tunnelsRouter.delete('/:id', requireAuth, requirePermission('tunnels', 'delete'), asyncHandler(async (req, res) => {
  if (jobOf(req.params.id)) return res.status(409).json({ error: { code: 'BUSY', message: 'A mode change is running for this tunnel. Wait for it to finish.' } });
  const [inUse] = await pool.query("SELECT COUNT(*) AS n FROM schedules WHERE target_type = 'tunnel' AND target_id = ?", [req.params.id]);
  if (inUse[0].n > 0) {
    return res.status(409).json({ error: { code: 'IN_USE', message: `${inUse[0].n} schedule(s) use this tunnel. Delete or change them first.` } });
  }
  const [r] = await pool.query('DELETE FROM tunnels WHERE id = ?', [req.params.id]);
  if (r.affectedRows === 0) return notFound(res);
  res.json({ deleted: true });
}));

const level = (v, fallback) => {
  const n = v === undefined || v === null || v === '' ? fallback : Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
};

// PUT /api/tunnels/:id/zones  { zones: [{ name, kind, day_brightness, evening_brightness, night_brightness, receiverIds: [] }] }
tunnelsRouter.put('/:id/zones', requireAuth, requirePermission('tunnels', 'edit'), asyncHandler(async (req, res) => {
  const [[t]] = await pool.query('SELECT id FROM tunnels WHERE id = ?', [req.params.id]);
  if (!t) return notFound(res);
  if (jobOf(req.params.id)) return res.status(409).json({ error: { code: 'BUSY', message: 'A mode change is running for this tunnel. Wait for it to finish.' } });
  const list = req.body?.zones;
  if (!Array.isArray(list) || list.length > 20) return bad(res, 'zones must be a list (at most 20)');

  const zones = [];
  const seen = new Set();
  for (const z of list) {
    const name = typeof z?.name === 'string' ? z.name.trim() : '';
    if (!name || name.length > 100) return bad(res, 'every zone needs a name (max 100 characters)');
    const kind = ZONE_KINDS.includes(z.kind) ? z.kind : 'custom';
    const day = level(z.day_brightness, 99);
    const evening = level(z.evening_brightness, 70);
    const night = level(z.night_brightness, 50);
    if (day === null || evening === null || night === null) return bad(res, `brightness in "${name}" must be a whole number 1-99`);
    const ids = Array.isArray(z.receiverIds) ? z.receiverIds.map(Number) : [];
    for (const id of ids) {
      if (!Number.isInteger(id) || id <= 0) return bad(res, `"${name}" has an invalid light`);
      if (seen.has(id)) return bad(res, 'a light can only be in one zone of a tunnel');
      seen.add(id);
    }
    zones.push({ name, kind, day_brightness: day, evening_brightness: evening, night_brightness: night, receiverIds: ids });
  }
  if (seen.size) {
    const [found] = await pool.query('SELECT id FROM receivers WHERE id IN (?)', [[...seen]]);
    if (found.length !== seen.size) return bad(res, 'one of the lights does not exist');
  }
  await replaceZones(req.params.id, zones);
  res.json({ updated: true });
}));

// POST /api/tunnels/:id/mode  { mode: day|evening|night|off }  - starts the change and returns at once
tunnelsRouter.post('/:id/mode', requireAuth, requirePermission('tunnels', 'control'), asyncHandler(async (req, res) => {
  const mode = req.body?.mode;
  if (!MODES.includes(mode)) return bad(res, `mode must be one of ${MODES.join(', ')}`);
  const [[t]] = await pool.query('SELECT id FROM tunnels WHERE id = ?', [req.params.id]);
  if (!t) return notFound(res);
  if (jobOf(req.params.id)) return res.status(409).json({ error: { code: 'BUSY', message: 'A mode change is already running for this tunnel' } });
  const [[zl]] = await pool.query('SELECT COUNT(*) AS n FROM tunnel_zone_lights WHERE tunnel_id = ?', [req.params.id]);
  if (zl.n === 0) return bad(res, 'This tunnel has no lights in its zones yet');

  // Fire and forget; the UI watches the job through GET /api/tunnels.
  applyMode(req.params.id, mode, { userId: req.user.sub, userRole: 'Tunnel' })
    .catch((err) => console.error(`Tunnel ${req.params.id} mode change failed:`, err.message));
  res.status(202).json({ started: true });
}));
