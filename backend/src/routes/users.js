import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { MODULES, ROLE_DEFAULTS, effective, sanitize } from '../services/permissions.js';

export const usersRouter = Router();

// GET /api/users — Admin only (SRS §8.2 Role-Permission Matrix).
// Exercises TC-011 (SRS §12.1): a non-Admin token must get 403 here,
// even when called directly and not through the Vue.js UI.
usersRouter.get('/', requireAuth, requirePermission('users', 'view'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.status, u.permissions, r.name AS role, u.created_at
     FROM users u JOIN roles r ON r.id = u.role_id
     ORDER BY u.id`
  );
  res.json({
    users: rows.map(({ permissions, ...u }) => ({
      ...u,
      custom_permissions: permissions !== null,
      permissions: effective(u.role, permissions),
    })),
  });
}));

// POST /api/users — Admin only (SRS §8.4 User Management: create user).
// GET /api/users/permission-catalog — modules, actions and each role's default template.
usersRouter.get('/permission-catalog', requireAuth, requirePermission('users', 'view'), (req, res) => {
  res.json({ modules: MODULES, roleDefaults: ROLE_DEFAULTS });
});

usersRouter.post('/', requireAuth, requirePermission('users', 'create'), asyncHandler(async (req, res) => {
  const { username, password, role } = req.body ?? {};
  if (!username || !password || !role) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'username, password and role are required' } });
  }

  const [roleRows] = await pool.query('SELECT id FROM roles WHERE name = ?', [role]);
  if (roleRows.length === 0) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: `Unknown role: ${role}` } });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const [result] = await pool.query(
      'INSERT INTO users (username, password_hash, role_id, status) VALUES (?, ?, ?, ?)',
      [username, passwordHash, roleRows[0].id, 'active']
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'Username already exists' } });
    }
    throw err;
  }
}));

// PUT /api/users/:id — Admin only (SRS §8.4: edit/disable user, assign role, reset password).
usersRouter.put('/:id', requireAuth, requirePermission('users', 'edit'), asyncHandler(async (req, res) => {
  const { role, status, password, permissions } = req.body ?? {};
  const updates = [];
  if (String(req.params.id) === String(req.user.sub) && (role || status || permissions !== undefined)) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'You cannot change your own role, status or permissions' } });
  }
  const values = [];

  if (role) {
    const [roleRows] = await pool.query('SELECT id FROM roles WHERE name = ?', [role]);
    if (roleRows.length === 0) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: `Unknown role: ${role}` } });
    }
    updates.push('role_id = ?');
    values.push(roleRows[0].id);
  }
  if (status) {
    updates.push('status = ?');
    values.push(status);
  }
  if (password) {
    updates.push('password_hash = ?');
    values.push(await bcrypt.hash(password, 10));
  }
  if (permissions !== undefined) {
    // null = back to the role template; an object = custom module x action grid.
    updates.push('permissions = ?');
    values.push(permissions === null ? null : JSON.stringify(sanitize(permissions)));
  }
  if (updates.length === 0) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Nothing to update' } });
  }

  const [result] = await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, [...values, req.params.id]);
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
  }
  res.json({ updated: true });
}));
