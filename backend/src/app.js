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

// Consistent error shape (SRS §9.1 conventions).
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' } });
});
