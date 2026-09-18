import mqtt from 'mqtt';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';

// SRS §4.3 (FR-MQTT-001/004): persistent MQTT client subscribing to each
// transmitter's response topic (`esp/pub/<address>`) and parsing status/ACK
// JSON exactly as documented — no invented fields.
//
// Open Issue carried from the SRS/PRD: the supplied examples show two
// different payload shapes on esp/pub/<address> — a status object
// ({relay1, relay2, brightness}) and an ACK object ({source, message, rssi,
// snr}). Only the ACK shape identifies *which* receiver ("source") the
// message is about. Until the full integration_protocol.doc is reviewed,
// this service only updates device_status when a "source" field is present;
// status-only messages without "source" are logged and skipped rather than
// guessed at.

let client = null;
const subscribedAddresses = new Set();
const subscribedReceiverAddresses = new Set();

export function startMqttService() {
  client = mqtt.connect(env.mqtt.url, {
    username: env.mqtt.username,
    password: env.mqtt.password,
    reconnectPeriod: 5000, // TC-010: automatic reconnection on drop.
  });

  client.on('connect', () => {
    console.log(`MQTT connected: ${env.mqtt.url}`);
    // Not awaited/wrapped: an event handler's rejected promise is an
    // unhandled rejection, which crashes the whole process (Node >= 15).
    // This matters in practice — e.g. the DB migrations haven't run yet on
    // first boot, so this query fails; that must never take the server down.
    Promise.all([subscribeAllTransmitters(), subscribeAllReceivers()]).catch((err) =>
      console.error('Failed to subscribe to existing devices on MQTT connect:', err.message)
    );
  });

  client.on('reconnect', () => console.log('MQTT reconnecting…'));
  client.on('error', (err) => console.error('MQTT error:', err.message));

  client.on('message', (topic, payload) => {
    const handler = topic.startsWith('Factory/Lighting/Device') ? handleFactoryLightingMessage : handleEspMessage;
    handler(topic, payload).catch((err) =>
      console.error(`Failed to process MQTT message on ${topic}:`, err)
    );
  });

  return client;
}

async function subscribeAllTransmitters() {
  const [rows] = await pool.query(
    'SELECT lora_address FROM transmitters WHERE lora_address IS NOT NULL'
  );
  for (const row of rows) {
    subscribeTransmitter(row.lora_address);
  }
}

async function subscribeAllReceivers() {
  const [rows] = await pool.query('SELECT lora_address FROM receivers');
  for (const row of rows) {
    subscribeReceiverTopics(row.lora_address);
  }
}

// FR-MQTT-002: publish an already-built `Tx_<address>_<command>` string to
// the transmitter's command topic. Resolves once the broker acknowledges
// the publish (not the same as the LoRa receiver acknowledging it).
export function publishCommand(transmitterAddress, commandString) {
  return new Promise((resolve, reject) => {
    if (!client || !client.connected) {
      reject(new Error('MQTT client not connected'));
      return;
    }
    client.publish(`esp/sub/${transmitterAddress}`, commandString, { qos: 1 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function subscribeTransmitter(loraAddress) {
  if (!client || loraAddress == null || subscribedAddresses.has(loraAddress)) return;
  const topic = `esp/pub/${loraAddress}`;
  client.subscribe(topic, (err) => {
    if (err) {
      console.error(`Failed to subscribe to ${topic}:`, err.message);
      return;
    }
    subscribedAddresses.add(loraAddress);
    console.log(`Subscribed: ${topic}`);
  });
}

// Heartbeat/Online (SRS §6.3/§6.4, FR-HB/FR-ONOFF): only documented on the
// `Factory/Lighting/Device<Address>/...` topic structure, not on `esp/pub`.
// This is one more instance of the open esp/sub-pub vs Factory/Lighting
// relationship (SRS §13.1 item 4) — subscribing here does not resolve that
// issue, it's the only place these two concepts currently exist in the
// supplied material.
//
// The address in this topic is matched against receivers.lora_address alone
// (no transmitter scoping, unlike esp/pub/<transmitter_address>), since the
// protocol excerpts don't show how Factory/Lighting addresses relate to a
// specific transmitter. If more than one receiver shares that address
// across different transmitters, this is ambiguous — flagged, not resolved.
export function subscribeReceiverTopics(loraAddress) {
  if (!client || loraAddress == null || subscribedReceiverAddresses.has(loraAddress)) return;
  const base = `Factory/Lighting/Device${loraAddress}`;
  client.subscribe([`${base}/Heartbeat`, `${base}/Online`], (err) => {
    if (err) {
      console.error(`Failed to subscribe to ${base}/{Heartbeat,Online}:`, err.message);
      return;
    }
    subscribedReceiverAddresses.add(loraAddress);
    console.log(`Subscribed: ${base}/Heartbeat, ${base}/Online`);
  });
}

async function handleFactoryLightingMessage(topic, payloadBuffer) {
  const parts = topic.split('/'); // Factory / Lighting / Device<Address> / <Heartbeat|Online>
  const addressMatch = parts[2]?.match(/^Device(\d+)$/);
  const kind = parts[3];
  if (!addressMatch || !kind) return;

  const loraAddress = Number(addressMatch[1]);
  const [receivers] = await pool.query('SELECT id FROM receivers WHERE lora_address = ? LIMIT 1', [loraAddress]);
  const receiver = receivers[0];
  if (!receiver) {
    console.warn(`Heartbeat/Online message for unregistered device address ${loraAddress}`);
    return;
  }

  if (kind === 'Heartbeat') {
    await pool.query('INSERT INTO heartbeats (receiver_id) VALUES (?)', [receiver.id]);
    await upsertDeviceStatusSeen(receiver.id, true);
    return;
  }

  if (kind === 'Online') {
    const value = payloadBuffer.toString().trim().toUpperCase();
    if (value !== 'ONLINE' && value !== 'OFFLINE') {
      console.warn(`Unexpected Online payload "${value}" for device ${loraAddress}`);
      return;
    }
    await upsertDeviceStatusSeen(receiver.id, value === 'ONLINE');
  }
}

async function upsertDeviceStatusSeen(receiverId, online) {
  await pool.query(
    `INSERT INTO device_status (receiver_id, online, last_seen)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE online = VALUES(online), last_seen = NOW()`,
    [receiverId, online]
  );
}

async function handleEspMessage(topic, payloadBuffer) {
  const transmitterAddress = Number(topic.split('/').pop());

  let message;
  try {
    message = JSON.parse(payloadBuffer.toString());
  } catch {
    console.warn(`Ignoring non-JSON message on ${topic}`);
    return;
  }

  if (message.source === undefined) {
    console.warn(
      `Skipping message on ${topic} with no "source" field — cannot attribute to a receiver (see Open Issue in mqttService.js)`
    );
    return;
  }

  const [receivers] = await pool.query(
    `SELECT r.id FROM receivers r
     JOIN transmitters t ON t.id = r.parent_transmitter_id
     WHERE t.lora_address = ? AND r.lora_address = ?`,
    [transmitterAddress, message.source]
  );

  const receiver = receivers[0];
  if (!receiver) {
    console.warn(
      `No receiver registered for transmitter ${transmitterAddress} / source ${message.source}`
    );
    return;
  }

  // ACK correlation (SRS §5.3 FR-CMD): the protocol has no command ID to
  // match against, so the most recent SENT_OVER_LORA command for this
  // receiver is treated as the one being acknowledged. This is a
  // simplification — flagged rather than presented as a guaranteed-correct
  // protocol behavior — since the real firmware may send other unsolicited
  // messages that happen to look like ACKs.
  if (typeof message.message === 'string' && message.message.startsWith('ACK:')) {
    await pool.query(
      `UPDATE commands
       SET status = 'SUCCESS', acknowledged_at = NOW(),
           rssi = COALESCE(?, rssi), snr = COALESCE(?, snr)
       WHERE receiver_id = ? AND status = 'SENT_OVER_LORA'
       ORDER BY created_at DESC LIMIT 1`,
      [message.rssi ?? null, message.snr ?? null, receiver.id]
    );
  }

  const relay1 = typeof message.relay1 === 'boolean' ? message.relay1 : null;
  const relay2 = typeof message.relay2 === 'boolean' ? message.relay2 : null;
  const brightness = typeof message.brightness === 'number' ? message.brightness : null;
  const rssi = typeof message.rssi === 'number' ? message.rssi : null;
  const snr = typeof message.snr === 'number' ? message.snr : null;

  await pool.query(
    `INSERT INTO device_status (receiver_id, online, brightness, relay1, relay2, rssi, snr, last_seen, last_status_at)
     VALUES (?, TRUE, ?, ?, ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       online = TRUE,
       brightness = COALESCE(VALUES(brightness), brightness),
       relay1 = COALESCE(VALUES(relay1), relay1),
       relay2 = COALESCE(VALUES(relay2), relay2),
       rssi = COALESCE(VALUES(rssi), rssi),
       snr = COALESCE(VALUES(snr), snr),
       last_seen = NOW(),
       last_status_at = NOW()`,
    [receiver.id, brightness, relay1, relay2, rssi, snr]
  );
}
