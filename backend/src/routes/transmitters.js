import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { subscribeTransmitter } from '../services/mqttService.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const transmittersRouter = Router();

// GET /api/transmitters — all roles can view (SRS §8.2).
transmittersRouter.get('/', requireAuth, asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, name, junction_location, network_id, lora_address, connectivity_type, status, created_at FROM transmitters ORDER BY id'
  );
  res.json({ transmitters: rows });
}));

// POST /api/transmitters — Admin only (SRS §8.2: Add Device = Admin).
transmittersRouter.post('/', requireAuth, requireRole('Admin'), asyncHandler(async (req, res) => {
  const { name, junctionLocation, networkId, loraAddress, connectivityType } = req.body ?? {};

  if (!name) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'name is required' } });
  }

  const [result] = await pool.query(
    `INSERT INTO transmitters (name, junction_location, network_id, lora_address, connectivity_type)
     VALUES (?, ?, ?, ?, ?)`,
    [name, junctionLocation ?? null, networkId ?? null, loraAddress ?? null, connectivityType ?? 'unknown']
  );

  if (loraAddress != null) {
    subscribeTransmitter(loraAddress);
  }

  res.status(201).json({ id: result.insertId });
}));
