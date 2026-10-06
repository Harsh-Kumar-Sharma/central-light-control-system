import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { effective, has } from '../services/permissions.js';

// FR-AUTH-003 (SRS §8.3): every protected route verifies the caller's role
// server-side. Never rely on the frontend hiding a button.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Missing bearer token' } });
  }

  try {
    req.user = jwt.verify(token, env.jwt.secret);
    return next();
  } catch {
    return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } });
  }
}

// SEC-003 (SRS §11.2): role-based access control enforced server-side.
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient role' } });
    }
    return next();
  };
}

// Module x action check. Read from the database on every request (not the JWT),
// so a changed permission or a disabled account takes effect immediately.
export async function loadPermissions(userId) {
  const [rows] = await pool.query(
    `SELECT u.status, u.permissions, r.name AS role
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
    [userId]
  );
  const row = rows[0];
  if (!row || row.status !== 'active') return null;
  return { role: row.role, permissions: effective(row.role, row.permissions) };
}

export function requirePermission(module, ...actions) {
  return async (req, res, next) => {
    try {
      const loaded = await loadPermissions(req.user?.sub);
      if (!loaded) {
        return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Account not found or disabled' } });
      }
      req.user.role = loaded.role;
      req.permissions = loaded.permissions;
      if (!actions.some((a) => has(loaded.permissions, module, a))) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: `Missing permission: ${module}.${actions.join('/')}` } });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
