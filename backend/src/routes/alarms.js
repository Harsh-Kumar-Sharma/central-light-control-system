import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const alarmsRouter = Router();

const SELECT = `SELECT a.id, a.type, a.severity, a.title, a.detail, a.status, a.raised_at, a.acknowledged_at, a.resolved_at,
                       a.receiver_id, a.transmitter_id, a.schedule_id, u.username AS acknowledged_by
                FROM alarms a LEFT JOIN users u ON u.id = a.acknowledged_by`;

// GET /api/alarms/summary - the numbers behind the bell icon and the dashboard.
alarmsRouter.get('/summary', requireAuth, requirePermission('alarms', 'view'), asyncHandler(async (req, res) => {
  const [[c]] = await pool.query(
    `SELECT COALESCE(SUM(status = 'active'), 0) AS unacknowledged,
            COALESCE(SUM(status <> 'resolved'), 0) AS open,
            COALESCE(SUM(status <> 'resolved' AND severity = 'critical'), 0) AS critical,
            COALESCE(SUM(status <> 'resolved' AND severity = 'warning'), 0) AS warning
     FROM alarms`
  );
  res.json({ unacknowledged: Number(c.unacknowledged), open: Number(c.open), critical: Number(c.critical), warning: Number(c.warning) });
}));

// GET /api/alarms?state=open|resolved|all
alarmsRouter.get('/', requireAuth, requirePermission('alarms', 'view'), asyncHandler(async (req, res) => {
  const state = ['open', 'resolved', 'all'].includes(req.query.state) ? req.query.state : 'open';
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const where = state === 'open' ? "WHERE a.status <> 'resolved'" : state === 'resolved' ? "WHERE a.status = 'resolved'" : '';
  const order = state === 'resolved' ? 'a.resolved_at DESC' : "FIELD(a.severity, 'critical', 'warning', 'info'), a.raised_at DESC";
  const [rows] = await pool.query(`${SELECT} ${where} ORDER BY ${order} LIMIT ?`, [limit]);
  res.json({ alarms: rows });
}));

alarmsRouter.post('/acknowledge-all', requireAuth, requirePermission('alarms', 'acknowledge'), asyncHandler(async (req, res) => {
  const [r] = await pool.query("UPDATE alarms SET status = 'acknowledged', acknowledged_by = ?, acknowledged_at = NOW() WHERE status = 'active'", [req.user.sub]);
  res.json({ acknowledged: r.affectedRows });
}));

alarmsRouter.post('/:id/acknowledge', requireAuth, requirePermission('alarms', 'acknowledge'), asyncHandler(async (req, res) => {
  const [r] = await pool.query(
    "UPDATE alarms SET status = 'acknowledged', acknowledged_by = ?, acknowledged_at = NOW() WHERE id = ? AND status = 'active'",
    [req.user.sub, req.params.id]
  );
  if (r.affectedRows === 0) {
    const [exists] = await pool.query('SELECT status FROM alarms WHERE id = ?', [req.params.id]);
    if (!exists[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Alarm not found' } });
  }
  res.json({ acknowledged: r.affectedRows === 1 });
}));
