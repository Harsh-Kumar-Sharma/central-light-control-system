import { pool } from '../db/pool.js';

// One open alarm per problem. Raising the same problem again while it is open
// does nothing; clearing it (the light came back) resolves it automatically.
export async function raiseAlarm({ type, severity, key, receiverId = null, transmitterId = null, scheduleId = null, tunnelId = null, title, detail = null }) {
  const [open] = await pool.query("SELECT id FROM alarms WHERE dedupe_key = ? AND status <> 'resolved' LIMIT 1", [key]);
  if (open.length) return null;
  const [res] = await pool.query(
    `INSERT INTO alarms (type, severity, dedupe_key, receiver_id, transmitter_id, schedule_id, tunnel_id, title, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [type, severity, key, receiverId, transmitterId, scheduleId, tunnelId, title.slice(0, 160), detail ? detail.slice(0, 255) : null]
  );
  return res.insertId;
}

export async function resolveKey(key) {
  await pool.query("UPDATE alarms SET status = 'resolved', resolved_at = NOW() WHERE dedupe_key = ? AND status <> 'resolved'", [key]);
}

export async function raiseDeviceOffline(receiverId) {
  const [rows] = await pool.query('SELECT device_name, lora_address FROM receivers WHERE id = ?', [receiverId]);
  if (!rows[0]) return;
  await raiseAlarm({
    type: 'device_offline',
    severity: 'critical',
    key: `device_offline:${receiverId}`,
    receiverId,
    title: `${rows[0].device_name} is offline`,
    detail: `Receiver address ${rows[0].lora_address} is not answering.`,
  });
}
export const resolveDeviceOffline = (receiverId) => resolveKey(`device_offline:${receiverId}`);

export async function raiseTransmitterOffline(transmitterId, why) {
  const [rows] = await pool.query('SELECT name FROM transmitters WHERE id = ?', [transmitterId]);
  if (!rows[0]) return;
  await raiseAlarm({
    type: 'transmitter_offline',
    severity: 'critical',
    key: `transmitter_offline:${transmitterId}`,
    transmitterId,
    title: `Transmitter ${rows[0].name} is unreachable`,
    detail: why ?? 'Every light behind it cannot be controlled or read.',
  });
}
export const resolveTransmitterOffline = (transmitterId) => resolveKey(`transmitter_offline:${transmitterId}`);

export async function raiseScheduleFailed(schedule, run) {
  await raiseAlarm({
    type: 'schedule_failed',
    severity: 'warning',
    key: `schedule_failed:${schedule.id}`,
    scheduleId: schedule.id,
    title: `Schedule "${schedule.name}" did not reach every light`,
    detail: `${run.ok} of ${run.total} lights confirmed; ${run.failed} gave no reply.`,
  });
}
export const resolveScheduleFailed = (scheduleId) => resolveKey(`schedule_failed:${scheduleId}`);

export async function raiseTunnelFailed(tunnel, mode, ok, failed) {
  await raiseAlarm({
    type: 'tunnel_failed',
    severity: 'warning',
    key: `tunnel_failed:${tunnel.id}`,
    tunnelId: tunnel.id,
    title: `Tunnel "${tunnel.name}": ${mode} mode did not reach every light`,
    detail: `${ok} lights confirmed; ${failed} gave no reply.`,
  });
}
export const resolveTunnelFailed = (tunnelId) => resolveKey(`tunnel_failed:${tunnelId}`);
