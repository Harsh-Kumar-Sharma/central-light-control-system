import { pool } from '../db/pool.js';
import { publishCommand } from './mqttService.js';
import { isAllowedTestTarget, isValidPort, sendTcpMessage } from './deviceTestService.js';
import { withTransmitterLock } from './transmitterLock.js';
import { applyStatus, stateFromCommand } from './deviceStatusService.js';
import { parseAckReply, isReplyComplete } from './statusParser.js';
import * as mqttLinks from './mqttLinks.js';
import { mqttConfigOf } from './mqttConfig.js';

// Every outcome carries a commandId (even a rejected one — that's the point
// of the audit trail, SRS §5.4), so routes must not use "has a commandId"
// to decide the HTTP status. This is the authoritative accepted/rejected
// split found via the Docker Compose smoke test (see db/005_phase6_fixes.sql).
const ACCEPTED_STATUSES = new Set(['QUEUED', 'SENT_OVER_LORA', 'SENT_TO_TRANSMITTER', 'ACKNOWLEDGED', 'SUCCESS', 'NO_ACK']);
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

// How long to wait for the transmitter's reply after a command is written
// over LAN. Not specified anywhere in the source material — placeholder.
const LAN_REPLY_TIMEOUT_MS = 4000;
const LINE_ENDINGS = { none: '', lf: '\n', crlf: '\r\n' };

// FR-CTL-002/003 (SRS §5.1) — validates, records, and dispatches a single
// command to one receiver. Used directly for individual control and fanned
// out per-device for group control (FR-GRP-002).
//
// Delivery: a transmitter in LAN mode gets the command text (e.g. Tx_1_R1ON)
// over TCP at its ip:port; otherwise it is published over MQTT.
export async function sendCommand({ userId, userRole, receiverId, type, payload }) {
  const [receivers] = await pool.query(
    `SELECT r.id, r.lora_address, r.parent_transmitter_id, r.status AS receiver_status,
            t.lora_address AS transmitter_address, t.status AS transmitter_status,
            t.connection_mode, t.ip_address, t.port, t.lan_line_ending,
            t.mqtt_host, t.mqtt_port, t.mqtt_publish_topic, t.mqtt_subscribe_topic
     FROM receivers r JOIN transmitters t ON t.id = r.parent_transmitter_id
     WHERE r.id = ?`,
    [receiverId]
  );
  const receiver = receivers[0];
  if (!receiver) {
    return { receiverId, status: 'INVALID_COMMAND', error: 'Device not found' };
  }
  if (receiver.transmitter_status !== 'active') {
    return recordAndReturn({ userId, userRole, receiver, type, commandString: null, status: 'TRANSMITTER_OFFLINE', errorCode: 'Transmitter is switched to Disabled' });
  }
  if (receiver.receiver_status !== 'active') {
    return recordAndReturn({ userId, userRole, receiver, type, commandString: null, status: 'DEVICE_OFFLINE', errorCode: 'Receiver is switched to Disabled' });
  }

  const built = buildCommandString(receiver.lora_address, type, payload);
  if (built.error) {
    return recordAndReturn({
      userId, userRole, receiver, type,
      commandString: null,
      status: built.error,
      errorCode: built.message,
    });
  }

  const transport = receiver.connection_mode === 'lan' ? 'lan' : 'mqtt';
  const [insertResult] = await pool.query(
    `INSERT INTO commands (user_id, user_role, transmitter_id, receiver_id, command, parameter, command_string, status, transport)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'QUEUED', ?)`,
    [userId, userRole, receiver.parent_transmitter_id, receiver.id, built.command, built.parameter, built.commandString, transport]
  );
  const commandId = insertResult.insertId;
  const base = { commandId, receiverId: receiver.id, commandString: built.commandString, transport };

  if (transport === 'lan') return deliverOverLan({ base, receiver, built });
  // MQTT with the transmitter's own broker settings: publish, then wait for the reply (like LAN).
  const mqttCfg = mqttConfigOf(receiver);
  if (mqttCfg) return deliverOverMqtt({ base, receiver, built, cfg: mqttCfg });
  // MQTT with no settings of its own: the server's default broker, fire-and-forget as before.

  try {
    await publishCommand(receiver.transmitter_address, built.commandString);
    await pool.query("UPDATE commands SET status = 'SENT_OVER_LORA' WHERE id = ?", [commandId]);
    scheduleTimeoutCheck(commandId);
    return { ...base, status: 'SENT_OVER_LORA' };
  } catch (err) {
    await pool.query(
      "UPDATE commands SET status = 'FAILED', error_code = ? WHERE id = ?",
      [err.message, commandId]
    );
    return { ...base, status: 'FAILED', error: err.message };
  }
}

async function failCommand(commandId, base, status, message) {
  await pool.query('UPDATE commands SET status = ?, error_code = ? WHERE id = ?', [status, String(message).slice(0, 255), commandId]);
  return { ...base, status, error: message };
}

async function deliverOverLan({ base, receiver, built }) {
  const { commandId, commandString } = base;
  if (!receiver.ip_address || !isValidPort(receiver.port)) {
    return failCommand(commandId, base, 'FAILED', 'This transmitter has no IP address / port set (Devices → edit the transmitter)');
  }
  if (!isAllowedTestTarget(receiver.ip_address)) {
    return failCommand(commandId, base, 'FAILED', 'LAN commands may only go to private addresses (192.168.x.x, 10.x.x.x, 172.16-31.x.x)');
  }

  const text = commandString + (LINE_ENDINGS[receiver.lan_line_ending] ?? '');
  const r = await withTransmitterLock(receiver.parent_transmitter_id, () => sendTcpMessage(receiver.ip_address, receiver.port, text, LAN_REPLY_TIMEOUT_MS, { isComplete: isReplyComplete, settleMs: 700 }));

  return finishDelivery({ base, receiver, built, r, where: `${receiver.ip_address}:${receiver.port}` });
}

async function deliverOverMqtt({ base, receiver, built, cfg }) {
  const r = await withTransmitterLock(receiver.parent_transmitter_id, () => mqttLinks.request(receiver.parent_transmitter_id, cfg, base.commandString, { timeoutMs: LAN_REPLY_TIMEOUT_MS, isComplete: isReplyComplete, settleMs: 700 }));
  return finishDelivery({ base, receiver, built, r, where: `the MQTT broker ${cfg.host}:${cfg.port}` });
}

// What a reply means - the same for LAN and MQTT. r = { ok, connected, received, latencyMs, detail }.
async function finishDelivery({ base, receiver, built, r, where }) {
  const { commandId } = base;
  if (!r.connected) return failCommand(commandId, base, 'TRANSMITTER_OFFLINE', `Cannot reach transmitter at ${where} (${r.detail})`);
  await pool.query("UPDATE commands SET status = 'SENT_TO_TRANSMITTER' WHERE id = ?", [commandId]);
  if (!r.ok) return failCommand(commandId, base, 'NO_ACK', r.detail);

  // SUCCESS needs an ACK for THIS command from THIS receiver. A different or
  // missing ACK still records the device's reply, but is not called success.
  const ack = parseAckReply(r.received);
  const norm = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const sentCommand = built.commandString.split('_').slice(2).join('_'); // Tx_2_R1ON -> R1ON
  const isAck = Boolean(ack) && norm(ack.command) === norm(sentCommand) && (ack.source == null || ack.source === receiver.lora_address);
  const rssi = ack?.rssi ?? null;
  const snr = ack?.snr ?? null;
  // The transmitter's own "LoRa << +OK" only says the radio packet went out. If nothing from the receiver
  // came back at all (no "Reply Address:..." line, no JSON), the light did not answer: that is NO_ACK, not a
  // reply in a strange format.
  const receiverSpoke = Boolean(ack) || /Reply\s*Address\s*[:=]/i.test(r.received) || /^\s*[{[]/.test(r.received);
  const status = isAck ? 'SUCCESS' : receiverSpoke ? 'ACKNOWLEDGED' : 'NO_ACK';

  await pool.query(
    `UPDATE commands SET status = ?, response = ?, rssi = ?, snr = ?, acknowledged_at = ${status === 'NO_ACK' ? 'NULL' : 'NOW()'} WHERE id = ?`,
    [status, r.received.slice(0, 500), rssi, snr, commandId]
  );
  if (isAck) {
    // An acknowledged command means the relay / brightness really changed.
    await applyStatus(receiver.id, { online: true, rssi, snr, source: 'command', ...stateFromCommand(built) });
  }
  if (status === 'NO_ACK') {
    const detail = 'The transmitter sent the command, but the light did not answer';
    await pool.query('UPDATE commands SET error_code = ? WHERE id = ?', [detail, commandId]);
    return { ...base, status, error: detail, reply: r.received, rssi, snr, latencyMs: r.latencyMs };
  }
  return { ...base, status, reply: r.received, rssi, snr, latencyMs: r.latencyMs };
}

async function recordAndReturn({ userId, userRole, receiver, type, commandString, status, errorCode }) {
  const [insertResult] = await pool.query(
    `INSERT INTO commands (user_id, user_role, transmitter_id, receiver_id, command, parameter, command_string, status, error_code)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
    [userId, userRole, receiver.parent_transmitter_id, receiver.id, type, commandString ?? '', status, errorCode ?? null]
  );
  return { commandId: insertResult.insertId, receiverId: receiver.id, status, error: errorCode };
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
  // A bad command is refused as a whole, before anything is sent or a group run is recorded.
  const check = buildCommandString(0, type, payload);
  if (check.error) return { error: check.error, message: check.message };
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
  // Only a confirmed ACK (or, on the server's default broker, a fire-and-forget publish) counts as done.
  const failureCount = results.filter((r) => r.status !== 'SUCCESS' && r.status !== 'SENT_OVER_LORA').length;
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
