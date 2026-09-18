import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sendCommand, isAcceptedResult } from '../services/commandService.js';
import { subscribeReceiverTopics } from '../services/mqttService.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const devicesRouter = Router();

// "Device" here means receiver (SRS §4.4 device addressing: device_id is
// kept distinct from lora_address; parent_transmitter_id links the hierarchy).

// GET /api/devices — all roles can view.
devicesRouter.get('/', requireAuth, asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT r.id, r.device_name, r.lora_address, r.network_id, r.location, r.status,
            r.parent_transmitter_id, t.name AS transmitter_name
     FROM receivers r
     JOIN transmitters t ON t.id = r.parent_transmitter_id
     ORDER BY r.id`
  );
  res.json({ devices: rows });
}));

// GET /api/devices/:id/status — latest snapshot (SRS §6.5).
devicesRouter.get('/:id/status', requireAuth, asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT receiver_id, online, brightness, relay1, relay2, rssi, snr, last_seen, last_status_at
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
devicesRouter.post('/:id/commands', requireAuth, requireRole('Admin', 'Operator'), asyncHandler(async (req, res) => {
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

// POST /api/devices — Admin only.
devicesRouter.post('/', requireAuth, requireRole('Admin'), asyncHandler(async (req, res) => {
  const { deviceName, loraAddress, networkId, parentTransmitterId, location } = req.body ?? {};

  if (!deviceName || loraAddress == null || !parentTransmitterId) {
    return res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'deviceName, loraAddress and parentTransmitterId are required' },
    });
  }

  const [result] = await pool.query(
    `INSERT INTO receivers (device_name, lora_address, network_id, parent_transmitter_id, location)
     VALUES (?, ?, ?, ?, ?)`,
    [deviceName, loraAddress, networkId ?? null, parentTransmitterId, location ?? null]
  );

  subscribeReceiverTopics(loraAddress);

  res.status(201).json({ id: result.insertId });
}));

// PUT /api/devices/:id — Admin only.
devicesRouter.put('/:id', requireAuth, requireRole('Admin'), asyncHandler(async (req, res) => {
  const { deviceName, location, status } = req.body ?? {};

  const [result] = await pool.query(
    `UPDATE receivers SET
       device_name = COALESCE(?, device_name),
       location = COALESCE(?, location),
       status = COALESCE(?, status)
     WHERE id = ?`,
    [deviceName ?? null, location ?? null, status ?? null, req.params.id]
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Device not found' } });
  }
  res.json({ updated: true });
}));
