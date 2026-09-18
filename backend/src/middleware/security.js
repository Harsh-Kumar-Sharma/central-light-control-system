import { env } from '../config/env.js';

// SRS §11.2 SEC-001: HTTPS shall be enforced. This app expects a reverse
// proxy / load balancer to terminate TLS and forward X-Forwarded-Proto
// (final hosting architecture is TBD — SRS §13.2 item 21). Controlled by
// ENFORCE_HTTPS, not NODE_ENV — see env.js for why those are kept separate.
export function enforceHttps(req, res, next) {
  if (!env.enforceHttps) return next();
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') return next();
  return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
}
