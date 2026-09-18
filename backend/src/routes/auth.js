import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const authRouter = Router();

// Brute-force mitigation (SRS §11.2 security hardening — no rate limit was
// specified in the source material; 10 attempts / 15 min per IP is a
// reasonable development default, not a confirmed requirement).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts, try again later' } },
});

// POST /api/auth/login — FR-AUTH-001/002 (SRS §8.3)
authRouter.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'username and password are required' } });
  }

  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.password_hash, u.status, r.name AS role
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.username = ?`,
    [username]
  );

  const user = rows[0];
  if (!user || user.status !== 'active') {
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' } });
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' } });
  }

  const token = jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn }
  );

  return res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
}));

// GET /api/auth/me — lets the Vue.js app confirm the current session/role.
authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.user.sub, username: req.user.username, role: req.user.role } });
});
