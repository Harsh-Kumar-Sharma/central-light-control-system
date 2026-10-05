import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { subscribeTransmitter } from '../services/mqttService.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  parseIpv4, isAllowedTestTarget, isValidPort, pingHost, checkTcpPort, sendTcpMessage,
} from '../services/deviceTestService.js';

export const transmittersRouter = Router();

const CONNECTION_MODES = ['lan', 'mqtt'];
const LINE_END_TEXT = { none: '', lf: '\n', crlf: '\r\n' };
const LINE_ENDINGS = ['none', 'lf', 'crlf'];
const STATUSES = ['active', 'inactive']; // shown as Enabled / Disabled in the UI
const bad = (res, message) => res.status(400).json({ error: { code: 'INVALID_INPUT', message } });

function validateFields(f) {
  for (const [label, value] of [['ipAddress', f.ipAddress], ['gateway', f.gateway], ['subnetMask', f.subnetMask]]) {
    if (value != null && value !== '' && !parseIpv4(value)) {
      return `${label} must be a valid IPv4 address (e.g. 192.168.1.50)`;
    }
  }
  if (f.port != null && f.port !== '' && !isValidPort(Number(f.port))) return 'port must be a number between 1 and 65535';
  if (f.connectionMode != null && !CONNECTION_MODES.includes(f.connectionMode)) return 'connectionMode must be "lan" or "mqtt"';
  if (f.lanLineEnding != null && !LINE_ENDINGS.includes(f.lanLineEnding)) return 'lanLineEnding must be none, lf or crlf';
  if (f.status != null && !STATUSES.includes(f.status)) return 'status must be "active" or "inactive"';
  return null;
}

const blankToNull = (v) => (v === '' || v === undefined ? null : v);

// GET /api/transmitters — all roles can view (SRS §8.2).
transmittersRouter.get('/', requireAuth, asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, name, junction_location, network_id, lora_address, connection_mode, connectivity_type,
            ip_address, port, gateway, subnet_mask, lan_line_ending, status,
            last_test_at, last_test_ok, last_test_latency_ms, created_at
     FROM transmitters ORDER BY id`
  );
  res.json({ transmitters: rows });
}));

// POST /api/transmitters — Admin only (SRS §8.2: Add Device = Admin).
transmittersRouter.post('/', requireAuth, requireRole('Admin'), asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  if (!b.name) return bad(res, 'name is required');
  const invalid = validateFields(b);
  if (invalid) return bad(res, invalid);

  try {
    const [result] = await pool.query(
      `INSERT INTO transmitters
         (name, junction_location, network_id, lora_address, connection_mode, ip_address, port, gateway, subnet_mask, lan_line_ending)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        b.name, blankToNull(b.junctionLocation), blankToNull(b.networkId), blankToNull(b.loraAddress),
        b.connectionMode ?? 'lan', blankToNull(b.ipAddress), blankToNull(b.port) == null ? null : Number(b.port),
        blankToNull(b.gateway), blankToNull(b.subnetMask), b.lanLineEnding ?? 'none',
      ]
    );
    if (b.loraAddress != null && b.loraAddress !== '') subscribeTransmitter(Number(b.loraAddress));
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: { code: 'CONFLICT', message: 'That LoRa address is already used by another transmitter' } });
    throw err;
  }
}));

// PUT /api/transmitters/:id — Admin only. Updates exactly the fields sent
// (including clearing them with null/""), unlike the older COALESCE style.
const COLUMN_FOR = {
  name: 'name', junctionLocation: 'junction_location', networkId: 'network_id', loraAddress: 'lora_address',
  connectionMode: 'connection_mode', ipAddress: 'ip_address', port: 'port', gateway: 'gateway',
  subnetMask: 'subnet_mask', lanLineEnding: 'lan_line_ending', status: 'status',
};

transmittersRouter.put('/:id', requireAuth, requireRole('Admin'), asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  const invalid = validateFields(b);
  if (invalid) return bad(res, invalid);
  if ('name' in b && !b.name) return bad(res, 'name cannot be empty');

  const [existingRows] = await pool.query('SELECT * FROM transmitters WHERE id = ?', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transmitter not found' } });

  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(COLUMN_FOR)) {
    if (!(key in b)) continue;
    let value = key === 'name' ? b[key] : blankToNull(b[key]);
    if (key === 'port' && value != null) value = Number(value);
    sets.push(`${column} = ?`);
    values.push(value);
  }
  if (sets.length === 0) return bad(res, 'Nothing to update');

  // A previous test result describes the old address — drop it if the
  // address/port/mode changed, otherwise "Reachable" would be misleading.
  const changed = (key, column) => key in b && String(blankToNull(b[key]) ?? '') !== String(existing[column] ?? '');
  if (changed('ipAddress', 'ip_address') || changed('port', 'port') || changed('connectionMode', 'connection_mode')) {
    sets.push('last_test_at = NULL', 'last_test_ok = NULL', 'last_test_latency_ms = NULL');
  }

  try {
    await pool.query(`UPDATE transmitters SET ${sets.join(', ')} WHERE id = ?`, [...values, req.params.id]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: { code: 'CONFLICT', message: 'That LoRa address is already used by another transmitter' } });
    throw err;
  }
  if (b.loraAddress != null && b.loraAddress !== '') subscribeTransmitter(Number(b.loraAddress));
  res.json({ updated: true });
}));

// DELETE /api/transmitters/:id — Admin only. Refuses when the transmitter
// still has receivers or command history: the command log is the audit
// trail (SRS §5.4) and must not be destroyed by a delete.
transmittersRouter.delete('/:id', requireAuth, requireRole('Admin'), asyncHandler(async (req, res) => {
  const [found] = await pool.query('SELECT id FROM transmitters WHERE id = ?', [req.params.id]);
  if (found.length === 0) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transmitter not found' } });

  const [[{ receivers }]] = await pool.query('SELECT COUNT(*) AS receivers FROM receivers WHERE parent_transmitter_id = ?', [req.params.id]);
  if (receivers > 0) {
    return res.status(409).json({ error: { code: 'IN_USE', message: `This transmitter still has ${receivers} receiver(s). Delete or move them first.` } });
  }
  const [[{ commands }]] = await pool.query('SELECT COUNT(*) AS commands FROM commands WHERE transmitter_id = ?', [req.params.id]);
  if (commands > 0) {
    return res.status(409).json({ error: { code: 'IN_USE', message: `This transmitter has ${commands} command(s) in the audit log, so it can't be deleted. Set it to Disabled instead.` } });
  }

  await pool.query('DELETE FROM transmitters WHERE id = ?', [req.params.id]);
  res.json({ deleted: true });
}));

// POST /api/transmitters/:id/test — Admin/Operator. action: ping | port | send.
const testLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many tests, wait a minute' } },
});

transmittersRouter.post('/:id/test', requireAuth, requireRole('Admin', 'Operator'), testLimiter, asyncHandler(async (req, res) => {
  const { action, message, commandId } = req.body ?? {};
  if (!['ping', 'port', 'send'].includes(action)) return bad(res, 'action must be ping, port or send');

  const [rows] = await pool.query('SELECT id, connection_mode, ip_address, port, lan_line_ending FROM transmitters WHERE id = ?', [req.params.id]);
  const tx = rows[0];
  if (!tx) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transmitter not found' } });
  if (tx.connection_mode !== 'lan') return bad(res, 'LAN tests only work for transmitters in LAN mode');
  if (!tx.ip_address) return bad(res, 'Set an IP address on this transmitter first');
  if (!isAllowedTestTarget(tx.ip_address)) return bad(res, 'Tests are only allowed for private LAN addresses (192.168.x.x, 10.x.x.x, 172.16-31.x.x)');

  const port = req.body?.port != null && req.body.port !== '' ? Number(req.body.port) : tx.port;
  if (action !== 'ping' && !isValidPort(port)) return bad(res, 'A valid port (1-65535) is required for this test');
  // 'send' takes either a saved command (commandId — the text stays on the
  // server and gets this transmitter's line ending) or custom text exactly as typed.
  let saved = null;
  if (action === 'send' && commandId != null) {
    const [cmds] = await pool.query('SELECT id, name, command FROM transmitter_commands WHERE id = ? AND transmitter_id = ?', [commandId, tx.id]);
    saved = cmds[0];
    if (!saved) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Saved command not found for this transmitter' } });
  } else if (action === 'send' && (typeof message !== 'string' || message.length === 0 || message.length > 1000)) {
    return bad(res, 'message or commandId is required (max 1000 characters)');
  }

  let result;
  if (action === 'ping') result = await pingHost(tx.ip_address);
  else if (action === 'port') result = await checkTcpPort(tx.ip_address, port);
  else if (saved) result = await sendTcpMessage(tx.ip_address, port, saved.command + (LINE_END_TEXT[tx.lan_line_ending] ?? ''));
  else result = await sendTcpMessage(tx.ip_address, port, message);

  const target = action === 'ping' ? tx.ip_address : `${tx.ip_address}:${port}`;
  await pool.query(
    'INSERT INTO device_tests (transmitter_id, user_id, kind, target, ok, latency_ms, detail) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [tx.id, req.user.sub, action, target, result.ok, result.latencyMs ?? null, (saved ? `[${saved.name}] ` : '') + String(result.detail ?? '').slice(0, 480)]
  );

  // The table's "Connection" badge follows ping / port results only; a
  // failed free-text send says more about the protocol than the link.
  if (action !== 'send') {
    await pool.query(
      'UPDATE transmitters SET last_test_at = NOW(), last_test_ok = ?, last_test_latency_ms = ? WHERE id = ?',
      [result.ok, result.latencyMs ?? null, tx.id]
    );
  }

  res.json({ action, target, ...(saved ? { commandName: saved.name, commandText: saved.command } : {}), ...result });
}));

// ---- Saved commands (per transmitter) --------------------------------------
// Admin/Operator can list and use them; only Admin can add / edit / delete.
function validateSavedCommand(b) {
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const command = typeof b.command === 'string' ? b.command.trim() : '';
  if (!name || name.length > 64) return { error: 'name is required (max 64 characters)' };
  if (!command || command.length > 500) return { error: 'command is required (max 500 characters)' };
  return { name, command };
}
const dupName = (res) => res.status(409).json({ error: { code: 'CONFLICT', message: 'This transmitter already has a command with that name' } });

transmittersRouter.get('/:id/commands', requireAuth, requireRole('Admin', 'Operator'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, name, command FROM transmitter_commands WHERE transmitter_id = ? ORDER BY id',
    [req.params.id]
  );
  res.json({ commands: rows });
}));

transmittersRouter.post('/:id/commands', requireAuth, requireRole('Admin'), asyncHandler(async (req, res) => {
  const v = validateSavedCommand(req.body ?? {});
  if (v.error) return bad(res, v.error);
  const [tx] = await pool.query('SELECT id FROM transmitters WHERE id = ?', [req.params.id]);
  if (tx.length === 0) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transmitter not found' } });
  try {
    const [result] = await pool.query('INSERT INTO transmitter_commands (transmitter_id, name, command) VALUES (?, ?, ?)', [req.params.id, v.name, v.command]);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return dupName(res);
    throw err;
  }
}));

transmittersRouter.put('/:id/commands/:commandId', requireAuth, requireRole('Admin'), asyncHandler(async (req, res) => {
  const v = validateSavedCommand(req.body ?? {});
  if (v.error) return bad(res, v.error);
  try {
    const [result] = await pool.query(
      'UPDATE transmitter_commands SET name = ?, command = ? WHERE id = ? AND transmitter_id = ?',
      [v.name, v.command, req.params.commandId, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Saved command not found' } });
    res.json({ updated: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return dupName(res);
    throw err;
  }
}));

transmittersRouter.delete('/:id/commands/:commandId', requireAuth, requireRole('Admin'), asyncHandler(async (req, res) => {
  const [result] = await pool.query('DELETE FROM transmitter_commands WHERE id = ? AND transmitter_id = ?', [req.params.commandId, req.params.id]);
  if (result.affectedRows === 0) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Saved command not found' } });
  res.json({ deleted: true });
}));
