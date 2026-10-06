import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { sendGroupCommand } from '../services/commandService.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const groupsRouter = Router();

// GET /api/groups — all roles can view.
groupsRouter.get('/', requireAuth, requirePermission('groups', 'view'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT g.id, g.name, COUNT(gm.receiver_id) AS member_count
     FROM \`groups\` g LEFT JOIN group_members gm ON gm.group_id = g.id
     GROUP BY g.id, g.name ORDER BY g.id`
  );
  res.json({ groups: rows });
}));

// POST /api/groups — Admin only (SRS §17 Group Management).
groupsRouter.post('/', requireAuth, requirePermission('groups', 'create'), asyncHandler(async (req, res) => {
  const { name, deviceIds } = req.body ?? {};
  if (!name) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'name is required' } });
  }

  const [result] = await pool.query('INSERT INTO `groups` (name) VALUES (?)', [name]);
  const groupId = result.insertId;

  if (Array.isArray(deviceIds) && deviceIds.length > 0) {
    const values = deviceIds.map((id) => [groupId, id]);
    await pool.query('INSERT INTO group_members (group_id, receiver_id) VALUES ?', [values]);
  }

  res.status(201).json({ id: groupId });
}));

// POST /api/groups/:id/commands — FR-GRP (SRS §5.2). Same role gate as
// individual device control.
groupsRouter.post('/:id/commands', requireAuth, requirePermission('groups', 'control'), asyncHandler(async (req, res) => {
  const { type, value, state } = req.body ?? {};
  if (!type) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'type is required' } });
  }

  const result = await sendGroupCommand({
    userId: req.user.sub,
    userRole: req.user.role,
    groupId: req.params.id,
    type,
    payload: { value, state },
  });

  res.status(result.groupExecutionId ? 202 : 400).json(result);
}));
