import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const auditRouter = Router();

// GET /api/audit — command audit trail (SRS §5.4 FR-AUDIT). Admin sees all,
// Operator sees a limited view (SRS §8.2: View Logs = Yes/Limited/No) —
// "limited" is scoped here to the operator's own commands; the exact
// definition of "limited" was not specified further, so this is a
// documented interpretation, not a confirmed requirement.
auditRouter.get('/', requireAuth, requirePermission('logs', 'view','view_all'), asyncHandler(async (req, res) => {
  const requestedLimit = Number(req.query.limit);
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 500) : 100;
  const params = [];
  let whereClause = '';

  if (!req.permissions.logs?.includes('view_all')) {
    whereClause = 'WHERE c.user_id = ?';
    params.push(req.user.sub);
  }

  const [rows] = await pool.query(
    `SELECT c.id, c.created_at, c.user_id, u.username, c.user_role, c.transmitter_id, c.receiver_id,
            r.device_name, c.command, c.parameter, c.command_string, c.status, c.rssi, c.snr,
            c.error_code, c.acknowledged_at, c.group_execution_id
     FROM commands c
     JOIN users u ON u.id = c.user_id
     JOIN receivers r ON r.id = c.receiver_id
     ${whereClause}
     ORDER BY c.created_at DESC
     LIMIT ?`,
    [...params, limit]
  );

  res.json({ commands: rows });
}));
