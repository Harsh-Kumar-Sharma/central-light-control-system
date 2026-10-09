import { Router } from 'express';
import express from 'express';
import zlib from 'node:zlib';
import { pool } from '../db/pool.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { importCad } from '../services/cadImport.js';
import { loadLiveLights } from '../services/liveLights.js';

export const plansRouter = Router();

const MAX_UPLOAD = '40mb';
const bad = (res, message, status = 400) => res.status(status).json({ error: { code: status === 400 ? 'INVALID_INPUT' : 'ERROR', message } });
const notFound = (res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } });
const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
const header = (req, name) => { try { return decodeURIComponent(String(req.headers[name] ?? '')); } catch { return ''; } };

// Converting a drawing is CPU-heavy, so one at a time.
let converting = false;

// POST /api/plans/upload   body = the raw file;  headers: x-filename, x-plan-name (both URL-encoded)
plansRouter.post(
  '/upload',
  requireAuth,
  requirePermission('plans', 'create'),
  express.raw({ type: () => true, limit: MAX_UPLOAD }),
  asyncHandler(async (req, res) => {
    const file = req.body;
    if (!Buffer.isBuffer(file) || file.length === 0) return bad(res, 'No file received');
    if (converting) return bad(res, 'Another drawing is being converted right now. Try again in a moment.', 409);
    const filename = header(req, 'x-filename') || 'plan';
    const baseName = filename.replace(/\.[^.]+$/, '');
    const name = (header(req, 'x-plan-name').trim() || baseName).slice(0, 150);
    if (!name) return bad(res, 'Give the plan a name');

    converting = true;
    let result;
    try {
      result = await importCad(file, filename);
    } catch (err) {
      if (err.code === 'UNSUPPORTED' || err.code === 'UNREADABLE') return bad(res, err.message, 422);
      throw err;
    } finally {
      converting = false;
    }

    const { geometry, summary, type } = result;
    const gz = zlib.gzipSync(JSON.stringify(geometry), { level: 6 });
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [r] = await conn.query(
        `INSERT INTO plans (name, source_name, source_type, size_bytes, units, geometry_gz, origin_json, bounds_json, layers_json, stats_json, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, filename.slice(0, 255), type, file.length, summary.units, gz, JSON.stringify(summary.origin), JSON.stringify(summary.bounds), JSON.stringify(summary.layers), JSON.stringify(summary.stats), req.user.sub]
      );
      await conn.query('INSERT INTO plan_sources (plan_id, data) VALUES (?, ?)', [r.insertId, file]);
      await conn.commit();
      res.status(201).json({ id: r.insertId, layers: summary.layers.length, hiddenByDefault: summary.layers.filter((l) => l.hidden).length, stats: summary.stats });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

const metaOf = (p) => ({
  id: p.id, name: p.name, source_name: p.source_name, source_type: p.source_type, size_bytes: p.size_bytes, units: p.units,
  created_at: p.created_at, light_count: p.light_count ?? 0,
  bounds: parse(p.bounds_json), origin: parse(p.origin_json), stats: parse(p.stats_json),
});

// GET /api/plans
plansRouter.get('/', requireAuth, requirePermission('plans', 'view'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT p.id, p.name, p.source_name, p.source_type, p.size_bytes, p.units, p.created_at, p.bounds_json, p.origin_json, p.stats_json,
            (SELECT COUNT(*) FROM plan_lights pl WHERE pl.plan_id = p.id) AS light_count
     FROM plans p ORDER BY p.created_at DESC`
  );
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM receivers');
  res.json({ plans: rows.map(metaOf), receiver_count: total });
}));

// GET /api/plans/:id  - details + layer list with the effective hidden flag
plansRouter.get('/:id', requireAuth, requirePermission('plans', 'view'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, name, source_name, source_type, size_bytes, units, created_at, bounds_json, origin_json, stats_json, layers_json, hidden_layers
     FROM plans WHERE id = ?`,
    [req.params.id]
  );
  if (!rows[0]) return notFound(res);
  const p = rows[0];
  const saved = p.hidden_layers == null ? null : new Set(parse(p.hidden_layers));
  const layers = parse(p.layers_json).map((l) => ({ ...l, hidden: saved ? saved.has(l.name) : Boolean(l.hidden) }));
  res.json({ plan: { ...metaOf(p), layers, customised: saved !== null } });
}));

// GET /api/plans/:id/geometry  - the drawing itself (gzip JSON). It never changes for a given plan.
plansRouter.get('/:id/geometry', requireAuth, requirePermission('plans', 'view'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT geometry_gz, size_bytes FROM plans WHERE id = ?', [req.params.id]);
  if (!rows[0]) return notFound(res);
  const etag = `W/"plan-${req.params.id}-${rows[0].geometry_gz.length}"`;
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  res.set({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Encoding': 'gzip', 'Cache-Control': 'private, max-age=300', ETag: etag });
  res.send(rows[0].geometry_gz);
}));

// GET /api/plans/:id/source  - the original file, as uploaded
plansRouter.get('/:id/source', requireAuth, requirePermission('plans', 'view'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT p.source_name, s.data FROM plans p JOIN plan_sources s ON s.plan_id = p.id WHERE p.id = ?', [req.params.id]);
  if (!rows[0]) return notFound(res);
  res.set({ 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(rows[0].source_name)}` });
  res.send(rows[0].data);
}));

plansRouter.put('/:id', requireAuth, requirePermission('plans', 'edit'), asyncHandler(async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name || name.length > 150) return bad(res, 'name is required (max 150 characters)');
  const [r] = await pool.query('UPDATE plans SET name = ? WHERE id = ?', [name, req.params.id]);
  if (r.affectedRows === 0) return notFound(res);
  res.json({ updated: true });
}));

// PUT /api/plans/:id/layers  { hidden: [names] | null }   (null = back to the file's own defaults)
plansRouter.put('/:id/layers', requireAuth, requirePermission('plans', 'edit'), asyncHandler(async (req, res) => {
  const { hidden } = req.body ?? {};
  if (hidden !== null && !(Array.isArray(hidden) && hidden.length <= 5000 && hidden.every((n) => typeof n === 'string'))) return bad(res, 'hidden must be a list of layer names, or null');
  const [r] = await pool.query('UPDATE plans SET hidden_layers = ? WHERE id = ?', [hidden === null ? null : JSON.stringify(hidden), req.params.id]);
  if (r.affectedRows === 0) return notFound(res);
  res.json({ updated: true });
}));

plansRouter.delete('/:id', requireAuth, requirePermission('plans', 'delete'), asyncHandler(async (req, res) => {
  const [r] = await pool.query('DELETE FROM plans WHERE id = ?', [req.params.id]);
  if (r.affectedRows === 0) return notFound(res);
  res.json({ deleted: true });
}));

// GET /api/plans/:id/lights  - every light with live status, and where it stands on THIS plan (x,y in CAD units, or null)
plansRouter.get('/:id/lights', requireAuth, requirePermission('plans', 'view'), asyncHandler(async (req, res) => {
  const [[plan]] = await pool.query('SELECT id FROM plans WHERE id = ?', [req.params.id]);
  if (!plan) return notFound(res);
  const [lights, [placed]] = await Promise.all([
    loadLiveLights(null),
    pool.query('SELECT receiver_id, x, y FROM plan_lights WHERE plan_id = ?', [req.params.id]),
  ]);
  const at = new Map(placed.map((p) => [p.receiver_id, { x: p.x, y: p.y }]));
  res.json({ lights: lights.map((l) => ({ ...l, plan: at.get(l.receiverId) ?? null })), serverTime: new Date().toISOString() });
}));

// PUT /api/plans/:id/lights/:receiverId  { x, y }  (both null = take it off the plan)
plansRouter.put('/:id/lights/:receiverId', requireAuth, requirePermission('plans', 'place'), asyncHandler(async (req, res) => {
  const { x, y } = req.body ?? {};
  const [[plan]] = await pool.query('SELECT id FROM plans WHERE id = ?', [req.params.id]);
  if (!plan) return notFound(res);
  const [[rx]] = await pool.query('SELECT id FROM receivers WHERE id = ?', [req.params.receiverId]);
  if (!rx) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Light not found' } });
  if (x === null && y === null) {
    await pool.query('DELETE FROM plan_lights WHERE plan_id = ? AND receiver_id = ?', [req.params.id, req.params.receiverId]);
    return res.json({ updated: true });
  }
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e12 || Math.abs(y) > 1e12) {
    return bad(res, 'x and y must both be numbers');
  }
  await pool.query(
    'INSERT INTO plan_lights (plan_id, receiver_id, x, y) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE x = VALUES(x), y = VALUES(y)',
    [req.params.id, req.params.receiverId, x, y]
  );
  res.json({ updated: true });
}));
