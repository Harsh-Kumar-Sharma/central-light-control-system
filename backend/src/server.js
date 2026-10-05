import { app } from './app.js';
import { env } from './config/env.js';
import { startMqttService } from './services/mqttService.js';
import { startOfflineSweep } from './services/monitoringService.js';
import { startStatusPolling } from './services/deviceStatusService.js';

// Defense-in-depth: log and keep running rather than let a missed .catch()
// anywhere (route handlers are covered by asyncHandler; this covers
// everything else — MQTT events, timers) take the whole process down.
// This must never become a substitute for fixing the actual missed .catch().
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection (process kept running):', reason);
});

startMqttService();
startOfflineSweep();
// Set DISABLE_STATUS_POLLING=true on any extra instance (a second dev server, a test
// run) so only ONE backend polls the devices.
if (process.env.DISABLE_STATUS_POLLING !== 'true') startStatusPolling();

app.listen(env.port, () => {
  console.log(`Backend listening on http://localhost:${env.port}`);
});
