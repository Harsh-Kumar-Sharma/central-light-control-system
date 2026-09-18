import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

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
