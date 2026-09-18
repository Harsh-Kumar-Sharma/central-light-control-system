import { pool } from '../db/pool.js';
import { publishCommand } from './mqttService.js';

// Every outcome carries a commandId (even a rejected one — that's the point
// of the audit trail, SRS §5.4), so routes must not use "has a commandId"
// to decide the HTTP status. This is the authoritative accepted/rejected
// split found via the Docker Compose smoke test (see db/005_phase6_fixes.sql).
const ACCEPTED_STATUSES = new Set(['QUEUED', 'SENT_OVER_LORA']);
export function isAcceptedResult(result) {
  return ACCEPTED_STATUSES.has(result.status);
}

// Command timeout: not specified anywhere in the source material (SRS §13.1
// item 16, "Response timeout"). 10s is a placeholder for development only —
// do not treat as a confirmed requirement.
const COMMAND_TIMEOUT_MS = 10_000;

// SRS §9: firmware validates brightness 1–99; the integration protocol
// separately describes 0–100%. This is an open, unresolved conflict — the
// firmware is treated as source-of-truth per the PRD's own rule (§2), and
// requests outside 1–99 are rejected rather than silently clamped/rescaled.
export function buildCommandString(loraAddress, type, payload) {
  switch (type) {
    case 'brightness': {
      const value = Number(payload?.value);
      if (!Number.isInteger(value) || value < 1 || value > 99) {
        return { error: 'INVALID_PARAMETER', message: 'brightness must be an integer 1–99 (firmware range; see Open Issue on 0–100% protocol conflict)' };
      }
      return { command: 'BRIGHTNESS', parameter: String(value), commandString: `Tx_${loraAddress}_LUX_${value}` };
    }
    case 'relay1':
    case 'relay2': {
      if (typeof payload?.state !== 'boolean') {
        return { error: 'INVALID_PARAMETER', message: 'state (boolean) is required' };
      }
      const relayNum = type === 'relay1' ? 1 : 2;
      const suffix = payload.state ? 'ON' : 'OFF';
      return {
        command: type.toUpperCase(),
        parameter: suffix,
        commandString: `Tx_${loraAddress}_R${relayNum}${suffix}`,
      };
    }
    default:
      return { error: 'INVALID_COMMAND', message: `Unknown command type: ${type}` };
  }
}

// FR-CTL-002/003 (SRS §5.1) — validates, records, and dispatches a single
// command to one receiver. Used directly for individual control and fanned
// out per-device for group control (FR-GRP-002).
export async function sendCommand({ userId, userRole, receiverId, type, payload }) {
  const [receivers] = await pool.query(
    `SELECT r.id, r.lora_address, r.parent_transmitter_id, r.status AS receiver_status,
            t.lora_address AS transmitter_address, t.status AS transmitter_status
     FROM receivers r JOIN transmitters t ON t.id = r.parent_transmitter_id
     WHERE r.id = ?`,
    [receiverId]
  );
  const receiver = receivers[0];
  if (!receiver) {
    return { receiverId, status: 'INVALID_COMMAND', error: 'Device not found' };
  }
  if (receiver.transmitter_status !== 'active') {
    return recordAndReturn({ userId, userRole, receiver, type, payload: null, commandString: null, status: 'TRANSMITTER_OFFLINE' });
  }
  if (receiver.receiver_status !== 'active') {
    return recordAndReturn({ userId, userRole, receiver, type, payload: null, commandString: null, status: 'DEVICE_OFFLINE' });
  }

  const built = buildCommandString(receiver.lora_address, type, payload);
  if (built.error) {
    return recordAndReturn({
      userId, userRole, receiver, type,
      payload: { command: type, parameter: null },
      commandString: null,
      status: built.error,
      errorCode: built.message,
    });
  }

  const [insertResult] = await pool.query(
    `INSERT INTO commands (user_id, user_role, transmitter_id, receiver_id, command, parameter, command_string, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'QUEUED')`,
    [userId, userRole, receiver.parent_transmitter_id, receiver.id, built.command, built.parameter, built.commandString]
  );
  const commandId = insertResult.insertId;

  try {
    await publishCommand(receiver.transmitter_address, built.commandString);
    await pool.query("UPDATE commands SET status = 'SENT_OVER_LORA' WHERE id = ?", [commandId]);
    scheduleTimeoutCheck(commandId);
    return { commandId, receiverId: receiver.id, status: 'SENT_OVER_LORA' };
  } catch (err) {
    await pool.query(
      "UPDATE commands SET status = 'FAILED', error_code = ? WHERE id = ?",
      [err.message, commandId]
    );
    return { commandId, receiverId: receiver.id, status: 'FAILED', error: err.message };
  }
}

async function recordAndReturn({ userId, userRole, receiver, type, commandString, status, errorCode }) {
  const [insertResult] = await pool.query(
    `INSERT INTO commands (user_id, user_role, transmitter_id, receiver_id, command, parameter, command_string, status, error_code)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
    [userId, userRole, receiver.parent_transmitter_id, receiver.id, type, commandString ?? '', status, errorCode ?? null]
  );
  return { commandId: insertResult.insertId, receiverId: receiver.id, status };
}

function scheduleTimeoutCheck(commandId) {
  setTimeout(async () => {
    await pool.query(
      "UPDATE commands SET status = 'TIMEOUT' WHERE id = ? AND status = 'SENT_OVER_LORA'",
      [commandId]
    );
  }, COMMAND_TIMEOUT_MS);
}

// FR-GRP-001/003 (SRS §5.2) — fans a command out to every device in a group
// and computes the aggregate result once every per-device command settles.
export async function sendGroupCommand({ userId, userRole, groupId, type, payload }) {
  const [members] = await pool.query('SELECT receiver_id FROM group_members WHERE group_id = ?', [groupId]);
  if (members.length === 0) {
    return { error: 'INVALID_COMMAND', message: 'Group has no member devices' };
  }

  const [execResult] = await pool.query(
    `INSERT INTO group_executions (group_id, user_id, command, parameter) VALUES (?, ?, ?, ?)`,
    [groupId, userId, type, payload?.value != null ? String(payload.value) : payload?.state != null ? String(payload.state) : null]
  );
  const groupExecutionId = execResult.insertId;

  const results = await Promise.all(
    members.map((m) => sendCommandForGroup({ userId, userRole, receiverId: m.receiver_id, type, payload, groupExecutionId }))
  );

  // Aggregate immediately from dispatch outcomes; a later reconciliation pass
  // (Phase 4/6) would re-check after ACKs/timeouts settle — not built here.
  const failureCount = results.filter((r) => !['SENT_OVER_LORA', 'QUEUED'].includes(r.status)).length;
  const aggregate = failureCount === 0 ? 'SUCCESS' : failureCount === results.length ? 'FAILED' : 'PARTIAL_SUCCESS';
  await pool.query('UPDATE group_executions SET aggregate_result = ? WHERE id = ?', [aggregate, groupExecutionId]);

  return { groupExecutionId, aggregate, results };
}

async function sendCommandForGroup({ userId, userRole, receiverId, type, payload, groupExecutionId }) {
  const result = await sendCommand({ userId, userRole, receiverId, type, payload });
  if (result.commandId) {
    await pool.query('UPDATE commands SET group_execution_id = ? WHERE id = ?', [groupExecutionId, result.commandId]);
  }
  return result;
}
