import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getSystemMonitoringConfig, updateSystemMonitoringConfig } from '../services/monitoringService.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const statusMonitoringRouter = Router();

// GET/PUT /api/status-monitoring — Admin only (SRS §8.2: Configure Status
// Monitoring = Yes/No/No).
statusMonitoringRouter.get('/', requireAuth, requireRole('Admin'), asyncHandler(async (req, res) => {
  const config = await getSystemMonitoringConfig();
  res.json({ config });
}));

statusMonitoringRouter.put('/', requireAuth, requireRole('Admin'), asyncHandler(async (req, res) => {
  const config = await updateSystemMonitoringConfig(req.body ?? {});
  res.json({ config });
}));
