import { app } from './app.js';
import { env } from './config/env.js';
import { startMqttService } from './services/mqttService.js';
import { startOfflineSweep } from './services/monitoringService.js';
import { startStatusPolling, backfillStateLog } from './services/deviceStatusService.js';
import { startScheduler } from './services/scheduleService.js';
import { startSensorMaintenance } from './services/sensorService.js';
import { startAllLinks } from './services/mqttLinks.js';

// Defense-in-depth: log and keep running rather than let a missed .catch()
// anywhere (route handlers are covered by asyncHandler; this covers
// everything else — MQTT events, timers) take the whole process down.
// This must never become a substitute for fixing the actual missed .catch().
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection (process kept running):', reason);
});

startMqttService();
startSensorMaintenance();
backfillStateLog();
startOfflineSweep();
// Set DISABLE_STATUS_POLLING=true on any extra instance (a second dev server, a test
// run) so only ONE backend polls the devices.
if (process.env.DISABLE_STATUS_POLLING !== 'true') {
  startStatusPolling();
  // Open each MQTT transmitter's own broker connection now (an extra instance opens one only when it needs it).
  startAllLinks().catch((err) => console.error('Could not open the MQTT transmitter connections:', err.message));
}
// Same rule for the scheduler: two backends would each switch the lights.
if (process.env.DISABLE_STATUS_POLLING !== 'true' && process.env.DISABLE_SCHEDULER !== 'true') startScheduler();

app.listen(env.port, () => {
  console.log(`Backend listening on http://localhost:${env.port}`);
});
