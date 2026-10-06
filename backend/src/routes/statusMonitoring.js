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

statusMonitoringRouter.put('/', requireAuth, requirePermission('status', 'edit'), asyncHandler(async (req, res) => {
  const config = await updateSystemMonitoringConfig(req.body ?? {});
  res.json({ config });
}));
