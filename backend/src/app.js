import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { enforceHttps } from './middleware/security.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { transmittersRouter } from './routes/transmitters.js';
import { devicesRouter } from './routes/devices.js';
import { groupsRouter } from './routes/groups.js';
import { auditRouter } from './routes/audit.js';
import { statusMonitoringRouter } from './routes/statusMonitoring.js';
import { dashboardRouter } from './routes/dashboard.js';
import { roadsRouter } from './routes/roads.js';
import { schedulesRouter } from './routes/schedules.js';
import { alarmsRouter } from './routes/alarms.js';
import { reportsRouter } from './routes/reports.js';
import { mapRouter } from './routes/map.js';
import { sensorsRouter } from './routes/sensors.js';
import { tunnelsRouter } from './routes/tunnels.js';
import { plansRouter } from './routes/plans.js';

// Express app configuration only — no listen(), no MQTT connect, no
// background jobs. Kept separate from server.js so the test suite can
// import and exercise the app (via supertest) without side effects.
export const app = express();

app.set('trust proxy', 1); // needed for req.secure / x-forwarded-proto behind a TLS-terminating proxy
app.use(enforceHttps);
app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/transmitters', transmittersRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/status-monitoring', statusMonitoringRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/roads', roadsRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/alarms', alarmsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/map', mapRouter);
app.use('/api/sensors', sensorsRouter);
app.use('/api/tunnels', tunnelsRouter);
app.use('/api/plans', plansRouter);

// Consistent error shape (SRS §9.1 conventions).
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' } });
});
