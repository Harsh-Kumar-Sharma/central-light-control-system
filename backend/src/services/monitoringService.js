import { pool } from '../db/pool.js';
import { raiseDeviceOffline } from './alarmService.js';

// FR-ONOFF (SRS §6.4): combines last-seen timestamp against the configured
// offline threshold to determine online/offline state. This is explicitly
// the "placeholder rule" the SRS allows for early development — the exact
// algorithm (weighting heartbeat vs. status vs. MQTT LWT) is still an open
// issue (SRS §13.1 item 6).
const SWEEP_INTERVAL_MS = 15_000;

export async function getSystemMonitoringConfig() {
  const [rows] = await pool.query(
    "SELECT * FROM monitoring_config WHERE scope_type = 'system' LIMIT 1"
  );
  return rows[0] ?? null;
}

export async function updateSystemMonitoringConfig(fields) {
  const allowed = ['enabled', 'polling_interval_seconds', 'response_timeout_seconds', 'retry_count', 'offline_threshold_seconds', 'status_polling_mode'];
  const updates = [];
  const values = [];

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      updates.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (updates.length === 0) return getSystemMonitoringConfig();

  await pool.query(`UPDATE monitoring_config SET ${updates.join(', ')} WHERE scope_type = 'system'`, values);
  return getSystemMonitoringConfig();
}

export function startOfflineSweep() {
  setInterval(async () => {
    try {
      const config = await getSystemMonitoringConfig();
      if (!config?.enabled || !config.offline_threshold_seconds) return;

      const stale = `online = TRUE AND last_seen IS NOT NULL AND last_seen < DATE_SUB(NOW(), INTERVAL ? SECOND)`;
      const [going] = await pool.query(`SELECT receiver_id FROM device_status WHERE ${stale}`, [config.offline_threshold_seconds]);
      await pool.query(`UPDATE device_status SET online = FALSE WHERE ${stale}`, [config.offline_threshold_seconds]);
      for (const { receiver_id: id } of going) await pool.query('INSERT INTO light_state_log (receiver_id, online, relay1, relay2, brightness) SELECT receiver_id, online, relay1, relay2, brightness FROM device_status WHERE receiver_id = ?', [id]).catch(() => {});
      for (const { receiver_id: id } of going) await raiseDeviceOffline(id).catch((err) => console.error('Alarm raise failed:', err.message));
    } catch (err) {
      console.error('Offline sweep failed:', err.message);
    }
  }, SWEEP_INTERVAL_MS);
}
