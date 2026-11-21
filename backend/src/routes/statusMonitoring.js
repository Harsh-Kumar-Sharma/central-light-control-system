import { Router } from 'express';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { getSystemMonitoringConfig, updateSystemMonitoringConfig } from '../services/monitoringService.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const statusMonitoringRouter = Router();

// GET/PUT /api/status-monitoring — Admin only (SRS §8.2: Configure Status
// Monitoring = Yes/No/No).
statusMonitoringRouter.get('/', requireAuth, requirePermission('status', 'view'), asyncHandler(async (req, res) => {
  const config = await getSystemMonitoringConfig();
  res.json({ config });
}));

// A number is optional (null / "" clears it) but must be a whole number inside a sensible range.
const LIMITS = {
  polling_interval_seconds: [3, 3600],
  response_timeout_seconds: [1, 600],
  retry_count: [0, 20],
  offline_threshold_seconds: [10, 86400],
};

statusMonitoringRouter.put('/', requireAuth, requirePermission('status', 'edit'), asyncHandler(async (req, res) => {
  const body = { ...(req.body ?? {}) };
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    if (body[key] === undefined) continue;
    if (body[key] === null || body[key] === '') { body[key] = null; continue; }
    const n = Number(body[key]);
    if (!Number.isInteger(n) || n < min || n > max) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: `${key} must be a whole number from ${min} to ${max}` } });
    }
    body[key] = n;
  }
  if (body.status_polling_mode != null && (typeof body.status_polling_mode !== 'string' || body.status_polling_mode.length > 32)) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'status_polling_mode can be at most 32 characters' } });
  }
  const config = await updateSystemMonitoringConfig(body);
  res.json({ config });
}));
