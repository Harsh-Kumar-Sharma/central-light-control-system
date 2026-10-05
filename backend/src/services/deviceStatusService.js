import { pool } from '../db/pool.js';
import { isAllowedTestTarget, isValidPort, sendTcpMessage } from './deviceTestService.js';
import { parseStatusReply, isReplyComplete } from './statusParser.js';
import { withTransmitterLock } from './transmitterLock.js';
import { getSystemMonitoringConfig } from './monitoringService.js';

const LINE_ENDINGS = { none: '', lf: '\n', crlf: '\r\n' };
const REPLY_TIMEOUT_MS = 4000;
const DEFAULT_POLL_SECONDS = 10; // used when no polling interval is configured
const FAILURES_BEFORE_OFFLINE = 2;

const bit = (v) => (v === null || v === undefined ? null : v ? 1 : 0);

// Writes what we know about a receiver. null fields keep their old value.
// state_source / state_at move only when relay or brightness info is present.
export async function applyStatus(receiverId, { online = true, relay1 = null, relay2 = null, brightness = null, rssi = null, snr = null, source = null }) {
  const hasState = relay1 !== null || relay2 !== null || brightness !== null;
  await pool.query(
    `INSERT INTO device_status (receiver_id, online, brightness, relay1, relay2, rssi, snr, last_seen, last_status_at, state_source, state_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?, ${hasState ? 'NOW()' : 'NULL'})
     ON DUPLICATE KEY UPDATE
       online = VALUES(online),
       brightness = COALESCE(VALUES(brightness), brightness),
       relay1 = COALESCE(VALUES(relay1), relay1),
       relay2 = COALESCE(VALUES(relay2), relay2),
       rssi = COALESCE(VALUES(rssi), rssi),
       snr = COALESCE(VALUES(snr), snr),
       last_seen = NOW(),
       last_status_at = NOW()
       ${hasState ? ', state_source = VALUES(state_source), state_at = NOW()' : ''}`,
    [receiverId, online ? 1 : 0, brightness, bit(relay1), bit(relay2), rssi, snr, hasState ? source : null]
  );
}

export async function markOffline(receiverId) {
  await pool.query(
    'INSERT INTO device_status (receiver_id, online) VALUES (?, FALSE) ON DUPLICATE KEY UPDATE online = FALSE',
    [receiverId]
  );
}

// What a successfully acknowledged command says about the device's state.
export function stateFromCommand(built) {
  if (built.command === 'RELAY1') return { relay1: built.parameter === 'ON' };
  if (built.command === 'RELAY2') return { relay2: built.parameter === 'ON' };
  if (built.command === 'BRIGHTNESS') return { brightness: Number(built.parameter) };
  return {};
}

export function statusText(row) {
  return String(row.status_command).replaceAll('{address}', String(row.lora_address)) + (LINE_ENDINGS[row.lan_line_ending] ?? '');
}

const ROW_SQL = `SELECT r.id, r.lora_address, r.status_command, r.status AS receiver_status,
                        t.id AS transmitter_id, t.ip_address, t.port, t.lan_line_ending,
                        t.connection_mode, t.status AS transmitter_status
                 FROM receivers r JOIN transmitters t ON t.id = r.parent_transmitter_id`;

// Asks one receiver for its state through its LAN transmitter.
// connected=false means the transmitter itself could not be reached.
async function queryReceiver(row) {
  if (!row.status_command) return { ok: false, connected: true, reason: 'NO_STATUS_COMMAND', detail: 'No status command is set for this receiver' };
  if (row.connection_mode !== 'lan' || !row.ip_address || !isValidPort(row.port) || !isAllowedTestTarget(row.ip_address)) {
    return { ok: false, connected: true, reason: 'NOT_POLLABLE', detail: 'Transmitter is not a LAN transmitter with a valid private IP and port' };
  }
  const r = await withTransmitterLock(row.transmitter_id, () => sendTcpMessage(row.ip_address, row.port, statusText(row), REPLY_TIMEOUT_MS, { isComplete: isReplyComplete, settleMs: 700 }));
  if (!r.connected) return { ok: false, connected: false, reason: 'UNREACHABLE', detail: `Cannot reach transmitter (${r.detail})` };
  if (!r.ok) return { ok: false, connected: true, reason: 'NO_REPLY', detail: r.detail };
  const parsed = parseStatusReply(r.received);
  if (!parsed) return { ok: false, connected: true, reason: 'UNPARSED', detail: 'The device replied, but the reply has no relay / brightness values I can read', reply: r.received };
  return { ok: true, connected: true, parsed, reply: r.received, latencyMs: r.latencyMs };
}

export async function getReceiverRow(receiverId) {
  const [rows] = await pool.query(`${ROW_SQL} WHERE r.id = ?`, [receiverId]);
  return rows[0] ?? null;
}

// One-off refresh (the "Refresh status" button). A failed query marks the
// device offline straight away, since someone explicitly asked.
export async function refreshReceiver(receiverId) {
  const row = await getReceiverRow(receiverId);
  if (!row) return { ok: false, reason: 'NOT_FOUND', detail: 'Device not found' };
  const result = await queryReceiver(row);
  if (result.ok) {
    await applyStatus(row.id, { online: true, ...result.parsed, source: 'reported' });
  } else if (result.reason === 'UNREACHABLE' || result.reason === 'NO_REPLY') {
    await markOffline(row.id);
  }
  failures.delete(row.id);
  return result;
}

/* ---------------- background polling ---------------- */
const failures = new Map(); // receiverId -> consecutive failed polls

export async function pollAllOnce() {
  const [rows] = await pool.query(
    `${ROW_SQL}
     WHERE t.connection_mode = 'lan' AND t.status = 'active' AND r.status = 'active'
       AND r.status_command IS NOT NULL AND r.status_command <> ''
       AND t.ip_address IS NOT NULL AND t.port IS NOT NULL
     ORDER BY t.id, r.id`
  );
  const byTransmitter = new Map();
  for (const row of rows) {
    if (!byTransmitter.has(row.transmitter_id)) byTransmitter.set(row.transmitter_id, []);
    byTransmitter.get(row.transmitter_id).push(row);
  }

  // Transmitters are polled in parallel; receivers behind one transmitter one by one.
  await Promise.all([...byTransmitter.values()].map(async (group) => {
    for (const row of group) {
      let result;
      try {
        result = await queryReceiver(row);
      } catch (err) {
        console.error(`Status poll failed for receiver ${row.id}:`, err.message);
        continue;
      }
      if (result.ok) {
        failures.delete(row.id);
        await applyStatus(row.id, { online: true, ...result.parsed, source: 'reported' });
      } else if (!result.connected) {
        // Transmitter itself is down: everything behind it is unreachable, don't wait on each.
        for (const r of group) { failures.delete(r.id); await markOffline(r.id); }
        break;
      } else if (result.reason === 'NO_REPLY' || result.reason === 'UNPARSED') {
        const n = (failures.get(row.id) ?? 0) + 1;
        failures.set(row.id, n);
        if (n >= FAILURES_BEFORE_OFFLINE) await markOffline(row.id);
      }
    }
  }));
  return rows.length;
}

export function startStatusPolling() {
  const loop = async () => {
    let seconds = DEFAULT_POLL_SECONDS;
    try {
      const config = await getSystemMonitoringConfig();
      if (config?.polling_interval_seconds) seconds = Math.min(Math.max(config.polling_interval_seconds, 3), 3600);
      if (config?.enabled !== 0 && config?.enabled !== false) await pollAllOnce();
    } catch (err) {
      console.error('Status polling cycle failed:', err.message);
    }
    setTimeout(loop, seconds * 1000);
  };
  setTimeout(loop, 3000);
}
