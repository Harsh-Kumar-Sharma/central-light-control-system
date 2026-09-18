import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const dashboardRouter = Router();

// GET /api/dashboard/summary — Main Dashboard feed (SRS §7 FR-UI-002).
// "Active Faults" is defined here as devices currently marked offline —
// no separate fault/alarm model exists yet (that's a later enhancement,
// not specified in the source material).
dashboardRouter.get('/summary', requireAuth, asyncHandler(async (req, res) => {
  const [[transmitterCounts]] = await pool.query(
    `SELECT COUNT(*) AS total, SUM(status = 'active') AS active FROM transmitters`
  );
  const [[receiverCounts]] = await pool.query(`SELECT COUNT(*) AS total FROM receivers`);
  const [[onlineCounts]] = await pool.query(
    `SELECT SUM(online = TRUE) AS online, SUM(online = FALSE) AS offline FROM device_status`
  );
  const [recentCommands] = await pool.query(
    `SELECT c.id, c.created_at, r.device_name, c.command, c.parameter, c.status
     FROM commands c JOIN receivers r ON r.id = c.receiver_id
     ORDER BY c.created_at DESC LIMIT 10`
  );

  res.json({
    transmitters: { total: transmitterCounts.total, active: transmitterCounts.active ?? 0 },
    receivers: {
      total: receiverCounts.total,
      online: onlineCounts.online ?? 0,
      offline: onlineCounts.offline ?? 0,
    },
    activeFaults: onlineCounts.offline ?? 0,
    recentCommands,
  });
}));
