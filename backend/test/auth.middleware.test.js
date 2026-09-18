import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET ??= 'test-secret';
process.env.DB_HOST ??= 'localhost';
process.env.DB_USER ??= 'root';
process.env.DB_NAME ??= 'highway_led_control_test';

const { requireAuth, requireRole } = await import('../src/middleware/auth.js');
const { env } = await import('../src/config/env.js');

function mockRes() {
  const res = {};
  res.statusCode = null;
  res.body = null;
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

// SEC-003 (SRS §11.2): server-side RBAC. These are the same checks the
// backend applies before any request reaches a route handler — tested
// directly against the middleware, independent of a live DB/broker.

test('requireAuth: rejects a request with no Authorization header', () => {
  const req = { headers: {} };
  const res = mockRes();
  let nextCalled = false;
  requireAuth(req, res, () => { nextCalled = true; });
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('requireAuth: rejects an invalid/garbage token', () => {
  const req = { headers: { authorization: 'Bearer not-a-real-token' } };
  const res = mockRes();
  requireAuth(req, res, () => {});
  assert.equal(res.statusCode, 401);
});

test('requireAuth: accepts a valid token and populates req.user', () => {
  const token = jwt.sign({ sub: 1, username: 'admin', role: 'Admin' }, env.jwt.secret);
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = mockRes();
  let nextCalled = false;
  requireAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(req.user.role, 'Admin');
});

// TC-011 (SRS §12.1): a non-Admin token calling an Admin-only endpoint
// directly (bypassing the UI) must be rejected with 403.
test('requireRole: 403s a wrong-role token, even called directly', () => {
  const req = { user: { role: 'Operator' } };
  const res = mockRes();
  let nextCalled = false;
  requireRole('Admin')(req, res, () => { nextCalled = true; });
  assert.equal(res.statusCode, 403);
  assert.equal(nextCalled, false);
});

test('requireRole: allows a matching role through', () => {
  const req = { user: { role: 'Admin' } };
  const res = mockRes();
  let nextCalled = false;
  requireRole('Admin', 'Operator')(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});
