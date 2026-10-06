import { pool } from '../db/pool.js';
import { raiseAlarm, resolveKey } from './alarmService.js';
import { hasSensors } from './statusParser.js';

// parsed names -> column names
const COLUMNS = {
  ambient: 'ambient_lux', motion: 'motion', voltage: 'voltage_v', current: 'current_a',
  power: 'power_w', energy: 'energy_kwh', temperature: 'temperature_c',
};
export const METRICS = {
  ambient_lux: { label: 'Ambient light', unit: 'lux' },
  voltage_v: { label: 'Voltage', unit: 'V' },
  current_a: { label: 'Current', unit: 'A' },
  power_w: { label: 'Power', unit: 'W' },
  temperature_c: { label: 'Temperature', unit: '°C' },
  energy_kwh: { label: 'Energy', unit: 'kWh' },
};

const HISTORY_EVERY_MS = 60_000;   // at most one history row a minute per light
const lastHistory = new Map();     // receiverId -> ms of the last history row

const bit = (v) => (v === null || v === undefined ? null : v ? 1 : 0);

// Stores the latest values (a missing value keeps the old one), appends a history
// row about once a minute, then checks the alarm rules for this light.
export async function recordSensors(receiverId, sensors) {
  if (!hasSensors(sensors)) return;
  const vals = Object.entries(COLUMNS).map(([k, col]) => [col, k === 'motion' ? bit(sensors[k]) : sensors[k] ?? null]);
  const cols = vals.map(([c]) => c);
  const params = vals.map(([, v]) => v);

  await pool.query(
    `INSERT INTO device_sensors (receiver_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})
     ON DUPLICATE KEY UPDATE ${cols.map((c) => `${c} = COALESCE(VALUES(${c}), ${c})`).join(', ')}`,
    [receiverId, ...params]
  );

  const now = Date.now();
  if (now - (lastHistory.get(receiverId) ?? 0) >= HISTORY_EVERY_MS) {
    lastHistory.set(receiverId, now);
    // Log the merged latest row so every history row is complete.
    await pool.query(
      `INSERT INTO sensor_readings (receiver_id, ${cols.join(', ')})
       SELECT receiver_id, ${cols.join(', ')} FROM device_sensors WHERE receiver_id = ?`,
      [receiverId]
    );
  }
  await evaluateRules(receiverId);
}

/* ---------------- alarm rules ---------------- */
let rulesCache = { at: 0, rows: [] };
export const clearRulesCache = () => { rulesCache = { at: 0, rows: [] }; };
async function activeRules() {
  if (Date.now() - rulesCache.at > 15_000) {
    const [rows] = await pool.query('SELECT * FROM sensor_rules WHERE enabled = 1');
    rulesCache = { at: Date.now(), rows };
  }
  return rulesCache.rows;
}

const fmt = (n) => (Math.round(Number(n) * 100) / 100).toString();

export async function evaluateRules(receiverId) {
  const rules = (await activeRules()).filter((r) => r.receiver_id === null || r.receiver_id === receiverId);
  if (!rules.length) return;
  const [[row]] = await pool.query(
    `SELECT r.device_name, ds.relay1, ds.relay2, s.ambient_lux, s.voltage_v, s.current_a, s.power_w, s.temperature_c
     FROM receivers r
     LEFT JOIN device_status ds ON ds.receiver_id = r.id
     LEFT JOIN device_sensors s ON s.receiver_id = r.id
     WHERE r.id = ?`,
    [receiverId]
  );
  if (!row) return;
  const lit = row.relay1 === 1 || row.relay2 === 1;

  for (const rule of rules) {
    const key = `sensor_rule:${rule.id}:${receiverId}`;
    let violated = null;     // null = cannot tell (no reading): leave the alarm as it is
    let detail = '';
    if (rule.kind === 'lamp_failure') {
      const minW = rule.value == null ? 1 : Number(rule.value);
      if (!lit) violated = false;
      else if (row.power_w !== null) {
        violated = Number(row.power_w) < minW;
        detail = `The light is switched ON but draws ${fmt(row.power_w)} W (expected at least ${fmt(minW)} W). The lamp or its driver may have failed.`;
      }
    } else {
      const v = row[rule.metric];
      if (v !== null && v !== undefined) {
        const limit = Number(rule.value);
        violated = rule.op === 'lt' ? Number(v) < limit : Number(v) > limit;
        const m = METRICS[rule.metric];
        detail = `${m.label} is ${fmt(v)} ${m.unit} (alarm when ${rule.op === 'lt' ? 'below' : 'above'} ${fmt(limit)} ${m.unit}).`;
      }
    }
    if (violated === true) {
      await raiseAlarm({ type: 'sensor_rule', severity: rule.severity, key, receiverId, title: `${rule.name}: ${row.device_name}`, detail });
    } else if (violated === false) {
      await resolveKey(key);
    }
  }
}

// A rule that was deleted or switched off must not leave its alarms open.
export async function resolveRuleAlarms(ruleId) {
  await pool.query("UPDATE alarms SET status = 'resolved', resolved_at = NOW() WHERE dedupe_key LIKE ? AND status <> 'resolved'", [`sensor_rule:${ruleId}:%`]);
  clearRulesCache();
}

/* ---------------- housekeeping ---------------- */
export async function purgeOldReadings(days = 30) {
  await pool.query('DELETE FROM sensor_readings WHERE at < DATE_SUB(NOW(), INTERVAL ? DAY)', [days]);
}
export function startSensorMaintenance() {
  const run = () => purgeOldReadings().catch((err) => console.error('Sensor purge failed:', err.message));
  setTimeout(run, 30_000);
  setInterval(run, 6 * 3600_000);
}
