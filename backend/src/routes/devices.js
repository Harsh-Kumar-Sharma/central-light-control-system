import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { sendCommand, isAcceptedResult } from '../services/commandService.js';
import { subscribeReceiverTopics } from '../services/mqttService.js';
import { refreshReceiver } from '../services/deviceStatusService.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const devicesRouter = Router();

// "Device" here means receiver (SRS §4.4 device addressing: device_id is
// kept distinct from lora_address; parent_transmitter_id links the hierarchy).

// GET /api/devices — all roles can view.
devicesRouter.get('/', requireAuth, requirePermission('devices', 'view'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT r.id, r.device_name, r.lora_address, r.network_id, r.location, r.status,
            r.relay1_name, r.relay2_name, r.status_command, r.relay1_watts, r.relay2_watts, r.latitude, r.longitude,
            r.parent_transmitter_id, t.name AS transmitter_name
     FROM receivers r
     JOIN transmitters t ON t.id = r.parent_transmitter_id
     ORDER BY r.id`
  );
  res.json({ devices: rows });
}));

// GET /api/devices/:id/status — latest snapshot (SRS §6.5).
devicesRouter.get('/:id/status', requireAuth, requirePermission('devices', 'view'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT receiver_id, online, brightness, relay1, relay2, rssi, snr, last_seen, last_status_at, state_source, state_at
     FROM device_status WHERE receiver_id = ?`,
    [req.params.id]
  );

  if (rows.length === 0) {
    return res.json({ status: null }); // No telemetry received yet — not an error.
  }
  res.json({ status: rows[0] });
}));

// POST /api/devices/:id/commands — Admin/Operator (SRS §8.2: Set Brightness /
// Relay Control = Yes/Yes/Configurable; User support is deferred — not built
// here, see Open Issues).
devicesRouter.post('/:id/commands', requireAuth, requirePermission('control', 'control'), asyncHandler(async (req, res) => {
  const { type, value, state } = req.body ?? {};
  if (!type) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'type is required' } });
  }

  const result = await sendCommand({
    userId: req.user.sub,
    userRole: req.user.role,
    receiverId: req.params.id,
    type,
    payload: { value, state },
  });

  res.status(isAcceptedResult(result) ? 202 : 400).json(result);
}));

// POST /api/devices/:id/refresh-status — ask the device for its state right now,
// using the status command saved on the receiver. Admin/Operator.
devicesRouter.post('/:id/refresh-status', requireAuth, requirePermission('control', 'control'), asyncHandler(async (req, res) => {
  const result = await refreshReceiver(req.params.id);
  if (result.reason === 'NOT_FOUND') return res.status(404).json({ error: { code: 'NOT_FOUND', message: result.detail } });
  const [rows] = await pool.query(
    'SELECT online, relay1, relay2, brightness, rssi, snr, last_seen, state_source, state_at FROM device_status WHERE receiver_id = ?',
    [req.params.id]
  );
  res.json({ ok: result.ok, reason: result.reason ?? null, detail: result.detail ?? null, reply: result.reply ?? null, status: rows[0] ?? null });
}));

// Address = the receiver's LoRa ADDRESS (the number in Tx_<address>_<command>);
// networkId = its LoRa NETWORKID. Both are plain non-negative integers.
const bad = (res, message) => res.status(400).json({ error: { code: 'INVALID_INPUT', message } });
const isNonNegInt = (v) => v !== '' && v !== null && v !== undefined && Number.isInteger(Number(v)) && Number(v) >= 0;
const STATUSES = ['active', 'inactive']; // shown as Enabled / Disabled in the UI
const wattsOrNull = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : Number(v));
const coordOrNull = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : Number(Number(v).toFixed(6)));
const blankToNull = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());
const dupAddress = (res) => res.status(409).json({
  error: { code: 'CONFLICT', message: 'Another receiver under this transmitter already uses that address' },
});

function validateDeviceFields(f, { requireAll }) {
  if (requireAll && (!f.deviceName || !isNonNegInt(f.loraAddress) || !f.parentTransmitterId)) {
    return 'deviceName, address and parent transmitter are required';
  }
  if (f.loraAddress !== undefined && !isNonNegInt(f.loraAddress)) return 'address must be a whole number (0 or more)';
  if (f.loraAddress !== undefined && Number(f.loraAddress) > 65535) return 'address must be 65535 or less';
  if (f.networkId !== undefined && f.networkId !== null && f.networkId !== '' && !isNonNegInt(f.networkId)) return 'network ID must be a whole number (0 or more)';
  if (f.status !== undefined && !STATUSES.includes(f.status)) return 'status must be "active" or "inactive"';
  for (const key of ['relay1Name', 'relay2Name']) {
    if (f[key] != null && (typeof f[key] !== 'string' || f[key].length > 64)) return `${key} can be at most 64 characters`;
  }
  for (const key of ['relay1Watts', 'relay2Watts']) {
    if (f[key] != null && f[key] !== '' && !(Number.isInteger(Number(f[key])) && Number(f[key]) >= 0 && Number(f[key]) <= 65535)) return `${key} must be a whole number of watts (0-65535)`;
  }
  const hasLat = f.latitude !== undefined && f.latitude !== null && f.latitude !== '';
  const hasLon = f.longitude !== undefined && f.longitude !== null && f.longitude !== '';
  if (hasLat !== hasLon && (f.latitude !== undefined || f.longitude !== undefined)) return 'give both latitude and longitude, or leave both empty';
  if (hasLat && (!Number.isFinite(Number(f.latitude)) || Math.abs(Number(f.latitude)) > 90)) return 'latitude must be a number between -90 and 90';
  if (hasLon && (!Number.isFinite(Number(f.longitude)) || Math.abs(Number(f.longitude)) > 180)) return 'longitude must be a number between -180 and 180';
  if (f.statusCommand != null && (typeof f.statusCommand !== 'string' || f.statusCommand.length > 500)) return 'statusCommand can be at most 500 characters';
  return null;
}

// POST /api/devices — Admin only.
devicesRouter.post('/', requireAuth, requirePermission('devices', 'create'), asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  const invalid = validateDeviceFields(b, { requireAll: true });
  if (invalid) return bad(res, invalid);

  try {
    const [result] = await pool.query(
      `INSERT INTO receivers (device_name, lora_address, network_id, parent_transmitter_id, location, relay1_name, relay2_name, status_command, relay1_watts, relay2_watts, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [b.deviceName, Number(b.loraAddress), b.networkId === '' || b.networkId == null ? null : Number(b.networkId), Number(b.parentTransmitterId), b.location || null,
        blankToNull(b.relay1Name), blankToNull(b.relay2Name), blankToNull(b.statusCommand), wattsOrNull(b.relay1Watts), wattsOrNull(b.relay2Watts), coordOrNull(b.latitude), coordOrNull(b.longitude)]
    );
    subscribeReceiverTopics(Number(b.loraAddress));
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return dupAddress(res);
    if (err.code === 'ER_NO_REFERENCED_ROW_2') return bad(res, 'Parent transmitter does not exist');
    throw err;
  }
}));

// PUT /api/devices/:id — Admin only. Updates exactly the fields sent
// (clearing with null / ""), including address, network ID and parent.
const DEVICE_COLUMNS = {
  deviceName: 'device_name', loraAddress: 'lora_address', networkId: 'network_id',
  parentTransmitterId: 'parent_transmitter_id', location: 'location', status: 'status',
  relay1Name: 'relay1_name', relay2Name: 'relay2_name', statusCommand: 'status_command',
  relay1Watts: 'relay1_watts', relay2Watts: 'relay2_watts', latitude: 'latitude', longitude: 'longitude',
};

devicesRouter.put('/:id', requireAuth, requirePermission('devices', 'edit'), asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  const invalid = validateDeviceFields(b, { requireAll: false });
  if (invalid) return bad(res, invalid);
  if ('deviceName' in b && !b.deviceName) return bad(res, 'device name cannot be empty');
  if ('parentTransmitterId' in b && !b.parentTransmitterId) return bad(res, 'parent transmitter cannot be empty');

  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(DEVICE_COLUMNS)) {
    if (!(key in b)) continue;
    let value = b[key];
    if (['loraAddress', 'networkId', 'parentTransmitterId'].includes(key)) value = value === '' || value == null ? null : Number(value);
    else if (key === 'location') value = value === '' ? null : value;
    else if (['relay1Name', 'relay2Name', 'statusCommand'].includes(key)) value = blankToNull(value);
    else if (['relay1Watts', 'relay2Watts'].includes(key)) value = wattsOrNull(value);
    else if (['latitude', 'longitude'].includes(key)) value = coordOrNull(value);
    sets.push(`${column} = ?`);
    values.push(value);
  }
  if (sets.length === 0) return bad(res, 'Nothing to update');

  try {
    const [result] = await pool.query(`UPDATE receivers SET ${sets.join(', ')} WHERE id = ?`, [...values, req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Device not found' } });
    }
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return dupAddress(res);
    if (err.code === 'ER_NO_REFERENCED_ROW_2') return bad(res, 'Parent transmitter does not exist');
    throw err;
  }
  if (b.loraAddress !== undefined && b.loraAddress !== null && b.loraAddress !== '') subscribeReceiverTopics(Number(b.loraAddress));
  res.json({ updated: true });
}));

// DELETE /api/devices/:id — Admin only. Refuses when the receiver has
// command history (audit trail, SRS §5.4). Its derived rows (status,
// heartbeats, group membership) are removed together with it.
devicesRouter.delete('/:id', requireAuth, requirePermission('devices', 'delete'), asyncHandler(async (req, res) => {
  const [found] = await pool.query('SELECT id FROM receivers WHERE id = ?', [req.params.id]);
  if (found.length === 0) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Device not found' } });
  }

  const [[{ commands }]] = await pool.query('SELECT COUNT(*) AS commands FROM commands WHERE receiver_id = ?', [req.params.id]);
  if (commands > 0) {
    return res.status(409).json({
      error: { code: 'IN_USE', message: `This device has ${commands} command(s) in the audit log, so it can't be deleted. Set it to Disabled instead.` },
    });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM heartbeats WHERE receiver_id = ?', [req.params.id]);
    await conn.query('DELETE FROM device_status WHERE receiver_id = ?', [req.params.id]);
    await conn.query('DELETE FROM group_members WHERE receiver_id = ?', [req.params.id]);
    await conn.query('DELETE FROM receivers WHERE id = ?', [req.params.id]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  res.json({ deleted: true });
}));
