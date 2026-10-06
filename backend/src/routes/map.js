import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { loadLiveLights } from '../services/liveLights.js';

export const mapRouter = Router();

const bad = (res, message) => res.status(400).json({ error: { code: 'INVALID_INPUT', message } });

// GET /api/map/lights - every light with its position (null = not placed) and live status.
// roads: which road maps each light is drawn on, so the GPS map can filter by road.
mapRouter.get('/lights', requireAuth, requirePermission('control', 'view'), asyncHandler(async (req, res) => {
  const [lights, [roadRows]] = await Promise.all([
    loadLiveLights(null),
    pool.query('SELECT id, name, layout_json, geo_path FROM roads ORDER BY name'),
  ]);
  const roadsOf = new Map();
  const roads = roadRows.map((r) => {
    const layout = typeof r.layout_json === 'string' ? JSON.parse(r.layout_json) : r.layout_json;
    const ids = [...new Set((layout.lights ?? []).map((l) => l.receiverId))];
    for (const id of ids) roadsOf.set(id, [...(roadsOf.get(id) ?? []), r.id]);
    const path = typeof r.geo_path === 'string' ? JSON.parse(r.geo_path) : r.geo_path;
    return { id: r.id, name: r.name, path: path ?? null };
  });
  res.json({ lights: lights.map((l) => ({ ...l, roadIds: roadsOf.get(l.receiverId) ?? [] })), roads, serverTime: new Date().toISOString() });
}));

// PUT /api/map/lights/:id/position  { latitude, longitude }  (both null = take it off the map)
mapRouter.put('/lights/:id/position', requireAuth, requirePermission('devices', 'edit'), asyncHandler(async (req, res) => {
  const { latitude, longitude } = req.body ?? {};
  const clear = latitude === null && longitude === null;
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!clear) {
    if (latitude === null || longitude === null || latitude === '' || longitude === '' || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return bad(res, 'latitude and longitude must both be numbers');
    }
    if (lat < -90 || lat > 90) return bad(res, 'latitude must be between -90 and 90');
    if (lon < -180 || lon > 180) return bad(res, 'longitude must be between -180 and 180');
  }
  const [r] = await pool.query('UPDATE receivers SET latitude = ?, longitude = ? WHERE id = ?', clear ? [null, null, req.params.id] : [lat.toFixed(6), lon.toFixed(6), req.params.id]);
  if (r.affectedRows === 0) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Light not found' } });
  res.json({ updated: true });
}));

// PUT /api/map/roads/:id/path  { points: [[lat, lon], ...] }  (points: null = remove the drawn route)
const MAX_POINTS = 1000;
mapRouter.put('/roads/:id/path', requireAuth, requirePermission('control', 'design'), asyncHandler(async (req, res) => {
  const { points } = req.body ?? {};
  let stored = null;
  if (points !== null) {
    if (!Array.isArray(points) || points.length < 2 || points.length > MAX_POINTS) {
      return bad(res, `a route needs between 2 and ${MAX_POINTS} points`);
    }
    for (const p of points) {
      const ok = Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n));
      if (!ok || Math.abs(p[0]) > 90 || Math.abs(p[1]) > 180) return bad(res, 'every point must be [latitude, longitude] with valid values');
    }
    stored = JSON.stringify(points.map(([lat, lon]) => [Number(lat.toFixed(6)), Number(lon.toFixed(6))]));
  }
  const [r] = await pool.query('UPDATE roads SET geo_path = ? WHERE id = ?', [stored, req.params.id]);
  if (r.affectedRows === 0) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Road not found' } });
  res.json({ updated: true });
}));
