import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { buildCsv, buildOverview, getReportSettings } from '../services/reportService.js';

export const reportsRouter = Router();

const bad = (res, message) => res.status(400).json({ error: { code: 'INVALID_INPUT', message } });

// GET /api/reports/overview?from=YYYY-MM-DD&to=YYYY-MM-DD&roadId=
reportsRouter.get('/overview', requireAuth, requirePermission('reports', 'view'), asyncHandler(async (req, res) => {
  const out = await buildOverview(req.query);
  if (out.error) return bad(res, out.error);
  res.json(out);
}));

// GET /api/reports/export?kind=lights|commands|alarms&from&to&roadId  -> CSV download
reportsRouter.get('/export', requireAuth, requirePermission('reports', 'export'), asyncHandler(async (req, res) => {
  const out = await buildCsv(req.query.kind, req.query);
  if (out.error) return bad(res, out.error);
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${out.filename}"`,
    'Cache-Control': 'no-store',
  });
  res.send(out.body);
}));

reportsRouter.get('/settings', requireAuth, requirePermission('reports', 'view'), asyncHandler(async (req, res) => {
  res.json(await getReportSettings());
}));

reportsRouter.put('/settings', requireAuth, requirePermission('reports', 'configure'), asyncHandler(async (req, res) => {
  const { tariff, currency } = req.body ?? {};
  const t = tariff === null || tariff === '' || tariff === undefined ? null : Number(tariff);
  if (t !== null && (!Number.isFinite(t) || t < 0 || t > 100000)) return bad(res, 'tariff must be a number of 0 or more');
  const cur = typeof currency === 'string' && /^[A-Za-z]{1,8}$/.test(currency.trim()) ? currency.trim().toUpperCase() : 'INR';
  await pool.query('UPDATE site_settings SET tariff_per_kwh = ?, currency = ? WHERE id = 1', [t, cur]);
  res.json({ updated: true });
}));
