import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { sendGroupCommand } from '../services/commandService.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const groupsRouter = Router();

const invalid = (res, message, status = 400) => res.status(status).json({ error: { code: status === 409 ? 'CONFLICT' : 'INVALID_INPUT', message } });

// Group names are what people pick from a list, so two groups must not look the same.
async function nameTaken(name, exceptId = null) {
  const [rows] = await pool.query('SELECT id FROM `groups` WHERE LOWER(name) = LOWER(?) AND id <> ? LIMIT 1', [String(name).trim(), exceptId ?? 0]);
  return rows.length > 0;
}

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
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'name is required' } });
  }
  if (name.length > 128) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'name can be at most 128 characters' } });

  const bad = (message) => res.status(400).json({ error: { code: 'INVALID_INPUT', message } });
  if (deviceIds != null && !Array.isArray(deviceIds)) return bad('deviceIds must be a list');
  const ids = [...new Set((deviceIds ?? []).map(Number))];
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) return bad('deviceIds must be receiver IDs');

  if (await nameTaken(name)) return res.status(409).json({ error: { code: 'CONFLICT', message: 'A group with that name already exists' } });

  // Group and members are created together: a bad member must not leave an empty group behind.
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query('INSERT INTO `groups` (name) VALUES (?)', [name]);
    const groupId = result.insertId;
    if (ids.length > 0) {
      await conn.query('INSERT INTO group_members (group_id, receiver_id) VALUES ?', [ids.map((id) => [groupId, id])]);
    }
    await conn.commit();
    res.status(201).json({ id: groupId });
  } catch (err) {
    await conn.rollback().catch(() => {});
    if (err.code === 'ER_NO_REFERENCED_ROW_2') return bad('One or more devices do not exist');
    throw err;
  } finally {
    conn.release();
  }
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

// GET /api/groups/:id — the group with the ids of its members (for the edit form).
groupsRouter.get('/:id', requireAuth, requirePermission('groups', 'view'), asyncHandler(async (req, res) => {
  const [[group]] = await pool.query('SELECT id, name FROM `groups` WHERE id = ?', [req.params.id]);
  if (!group) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Group not found' } });
  const [members] = await pool.query('SELECT receiver_id FROM group_members WHERE group_id = ?', [group.id]);
  res.json({ ...group, deviceIds: members.map((m) => m.receiver_id) });
}));

// PUT /api/groups/:id  { name?, deviceIds? } — rename and/or replace the member list. Same permission as creating one.
groupsRouter.put('/:id', requireAuth, requirePermission('groups', 'create'), asyncHandler(async (req, res) => {
  const { name, deviceIds } = req.body ?? {};
  const [[group]] = await pool.query('SELECT id FROM `groups` WHERE id = ?', [req.params.id]);
  if (!group) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Group not found' } });
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) return invalid(res, 'name cannot be empty');
    if (name.length > 128) return invalid(res, 'name can be at most 128 characters');
    if (await nameTaken(name, group.id)) return invalid(res, 'A group with that name already exists', 409);
  }
  let ids = null;
  if (deviceIds !== undefined) {
    if (!Array.isArray(deviceIds)) return invalid(res, 'deviceIds must be a list');
    ids = [...new Set(deviceIds.map(Number))];
    if (ids.some((id) => !Number.isInteger(id) || id <= 0)) return invalid(res, 'deviceIds must be receiver IDs');
  }
  if (name === undefined && ids === null) return invalid(res, 'Nothing to update');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (name !== undefined) await conn.query('UPDATE `groups` SET name = ? WHERE id = ?', [name.trim(), group.id]);
    if (ids !== null) {
      await conn.query('DELETE FROM group_members WHERE group_id = ?', [group.id]);
      if (ids.length) await conn.query('INSERT INTO group_members (group_id, receiver_id) VALUES ?', [ids.map((id) => [group.id, id])]);
    }
    await conn.commit();
    res.json({ updated: true });
  } catch (err) {
    await conn.rollback().catch(() => {});
    if (err.code === 'ER_NO_REFERENCED_ROW_2') return invalid(res, 'One or more devices do not exist');
    throw err;
  } finally {
    conn.release();
  }
}));

// DELETE /api/groups/:id — refused while a schedule still switches this group (it would silently stop working).
groupsRouter.delete('/:id', requireAuth, requirePermission('groups', 'create'), asyncHandler(async (req, res) => {
  const [[group]] = await pool.query('SELECT id FROM `groups` WHERE id = ?', [req.params.id]);
  if (!group) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Group not found' } });
  const [used] = await pool.query("SELECT name FROM schedules WHERE target_type = 'group' AND target_id = ?", [group.id]);
  if (used.length) return invalid(res, `This group is used by the schedule "${used[0].name}". Delete or change that schedule first.`, 409);
  // The commands each light received stay in the audit log; only the "sent to group" wrapper goes with the group.
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE commands SET group_execution_id = NULL WHERE group_execution_id IN (SELECT id FROM group_executions WHERE group_id = ?)', [group.id]);
    await conn.query('DELETE FROM group_executions WHERE group_id = ?', [group.id]);
    await conn.query('DELETE FROM group_members WHERE group_id = ?', [group.id]);
    await conn.query('DELETE FROM `groups` WHERE id = ?', [group.id]);
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
  res.json({ deleted: true });
}));
