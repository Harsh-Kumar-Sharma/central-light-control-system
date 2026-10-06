import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validateLayout, emptyLayout } from '../services/roadLayout.js';
import { loadLiveLights } from '../services/liveLights.js';

export const roadsRouter = Router();

const bad = (res, message) => res.status(400).json({ error: { code: 'INVALID_INPUT', message } });
const notFound = (res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Road not found' } });

function cleanName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  return name && name.length <= 100 ? name : null;
}

// Every receiver a layout points at must exist (a deleted one would leave a dead light).
async function missingReceivers(layout) {
  const ids = layout.lights.map((l) => l.receiverId);
  if (ids.length === 0) return [];
  const [rows] = await pool.query('SELECT id FROM receivers WHERE id IN (?)', [ids]);
  const found = new Set(rows.map((r) => r.id));
  return ids.filter((id) => !found.has(id));
}

// GET /api/roads — all roles can view.
roadsRouter.get('/', requireAuth, requirePermission('control', 'view'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, name, JSON_LENGTH(JSON_EXTRACT(layout_json, '$.lights')) AS light_count, updated_at
     FROM roads ORDER BY name`
  );
  res.json({ roads: rows });
}));

// GET /api/roads/:id
roadsRouter.get('/:id', requireAuth, requirePermission('control', 'view'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT id, name, layout_json, updated_at FROM roads WHERE id = ?', [req.params.id]);
  if (rows.length === 0) return notFound(res);
  const { layout_json: layout, ...road } = rows[0];
  res.json({ road: { ...road, layout: typeof layout === 'string' ? JSON.parse(layout) : layout } });
}));

// GET /api/roads/:id/live — current state of every light on the road, in one query.
roadsRouter.get('/:id/live', requireAuth, requirePermission('control', 'view'), asyncHandler(async (req, res) => {
  const [roads] = await pool.query('SELECT layout_json FROM roads WHERE id = ?', [req.params.id]);
  if (roads.length === 0) return notFound(res);
  const layout = typeof roads[0].layout_json === 'string' ? JSON.parse(roads[0].layout_json) : roads[0].layout_json;
  const ids = (layout.lights ?? []).map((l) => l.receiverId);
  if (ids.length === 0) return res.json({ lights: [], missing: [], serverTime: new Date().toISOString() });

  const lights = await loadLiveLights(ids);
  const found = new Set(lights.map((l) => l.receiverId));
  res.json({ lights, missing: ids.filter((id) => !found.has(id)), serverTime: new Date().toISOString() });
}));

// POST /api/roads — Admin only.
roadsRouter.post('/', requireAuth, requirePermission('control', 'design'), asyncHandler(async (req, res) => {
  const name = cleanName(req.body?.name);
  if (!name) return bad(res, 'name is required (max 100 characters)');
  const v = validateLayout(req.body?.layout ?? emptyLayout());
  if (v.error) return bad(res, v.error);
  const missing = await missingReceivers(v.layout);
  if (missing.length) return bad(res, `receiver(s) not found: ${missing.join(', ')}`);

  try {
    const [result] = await pool.query('INSERT INTO roads (name, layout_json, created_by) VALUES (?, ?, ?)', [name, JSON.stringify(v.layout), req.user.sub]);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: { code: 'CONFLICT', message: 'A road with that name already exists' } });
    throw err;
  }
}));

// PUT /api/roads/:id — Admin only. Send name, layout, or both.
roadsRouter.put('/:id', requireAuth, requirePermission('control', 'design'), asyncHandler(async (req, res) => {
  const sets = [];
  const values = [];
  if ('name' in (req.body ?? {})) {
    const name = cleanName(req.body.name);
    if (!name) return bad(res, 'name is required (max 100 characters)');
    sets.push('name = ?'); values.push(name);
  }
  if ('layout' in (req.body ?? {})) {
    const v = validateLayout(req.body.layout);
    if (v.error) return bad(res, v.error);
    const missing = await missingReceivers(v.layout);
    if (missing.length) return bad(res, `receiver(s) not found: ${missing.join(', ')}`);
    sets.push('layout_json = ?'); values.push(JSON.stringify(v.layout));
  }
  if (sets.length === 0) return bad(res, 'Nothing to update');

  try {
    const [result] = await pool.query(`UPDATE roads SET ${sets.join(', ')} WHERE id = ?`, [...values, req.params.id]);
    if (result.affectedRows === 0) return notFound(res);
    res.json({ updated: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: { code: 'CONFLICT', message: 'A road with that name already exists' } });
    throw err;
  }
}));

// DELETE /api/roads/:id — Admin only. Removes the drawing only; receivers stay.
roadsRouter.delete('/:id', requireAuth, requirePermission('control', 'design'), asyncHandler(async (req, res) => {
  const [result] = await pool.query('DELETE FROM roads WHERE id = ?', [req.params.id]);
  if (result.affectedRows === 0) return notFound(res);
  res.json({ deleted: true });
}));
