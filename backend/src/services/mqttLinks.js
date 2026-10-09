import mqtt from 'mqtt';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { mqttConfigOf, sameConfig } from './mqttConfig.js';

// One MQTT connection per transmitter that is set to MQTT mode with its own broker settings
// (host, port, command topic, reply topic). It works like the LAN link, just over a broker:
//   publish the command on the command topic  ->  wait for the device's reply on the reply topic.
// Connections are opened when a transmitter is saved, at start-up, or the first time one is needed.

const links = new Map(); // transmitterId -> link

const errText = (err) => err?.message || err?.code || err?.errors?.[0]?.message || String(err ?? 'unknown error');

// The server's default broker may need a login; reuse it only when this transmitter points at that same broker.
function credentialsFor(cfg) {
  try {
    const u = new URL(env.mqtt.url);
    if (u.hostname === cfg.host && Number(u.port || 1883) === cfg.port) return { username: env.mqtt.username, password: env.mqtt.password };
  } catch { /* not a URL: no shared login */ }
  return {};
}

function settleConnect(link, ok) {
  for (const w of link.connectWaiters) { clearTimeout(w.timer); w.resolve(ok); }
  link.connectWaiters.clear();
}

function open(id, cfg) {
  const link = {
    id, cfg, state: 'connecting', error: null, createdAt: Date.now(), connectedAt: null, connectMs: null,
    lastMessageAt: null, lastMessage: null, waiters: new Set(), connectWaiters: new Set(), client: null, closed: false,
  };
  const client = mqtt.connect(`mqtt://${cfg.host}:${cfg.port}`, {
    ...credentialsFor(cfg),
    clientId: `ars-tx${id}-${Math.random().toString(16).slice(2, 8)}`,
    reconnectPeriod: 5000,   // keeps trying by itself if the broker drops or is down
    connectTimeout: 8000,
    keepalive: 30,
    clean: true,
  });
  link.client = client;

  client.on('connect', () => {
    client.subscribe(cfg.sub, { qos: 1 }, (err, granted) => {
      if (link.closed) return;
      if (err || granted?.some((g) => g.qos === 128)) {
        link.state = 'error';
        link.error = err ? errText(err) : `The broker refused the subscription to "${cfg.sub}" (not allowed?)`;
        settleConnect(link, false);
        return;
      }
      link.state = 'connected';
      link.error = null;
      link.connectedAt = Date.now();
      link.connectMs ??= link.connectedAt - link.createdAt;
      settleConnect(link, true);
    });
  });
  client.on('error', (err) => {
    link.error = errText(err);
    if (link.state !== 'connected') link.state = 'error';
  });
  client.on('close', () => {
    if (link.closed) return;
    if (link.state === 'connected') link.state = 'connecting'; // dropped; the client is reconnecting
  });
  client.on('message', (topic, payload, packet) => {
    const text = payload.toString('utf8');
    link.lastMessage = text.slice(0, 300);
    link.lastMessageAt = Date.now();
    if (packet?.retain) return; // an old retained message is not an answer to anything we just sent
    if (link.waiters.size) { for (const w of link.waiters) w.push(text); return; }
    unsolicited(link, text).catch((err) => console.error(`MQTT message from transmitter ${link.id} not handled:`, err.message));
  });
  return link;
}

function closeLink(link) {
  link.closed = true;
  link.state = 'closed';
  settleConnect(link, false);
  for (const w of link.waiters) w.abort();
  link.waiters.clear();
  try { link.client.end(true); } catch { /* already closed */ }
}

export function ensureLink(id, cfg) {
  const existing = links.get(id);
  if (existing && sameConfig(existing.cfg, cfg)) return existing;
  if (existing) closeLink(existing);
  const link = open(id, cfg);
  links.set(id, link);
  return link;
}

export function dropLink(id) {
  const link = links.get(id);
  if (link) { closeLink(link); links.delete(id); }
}

// Open, change or close the connection to match a transmitters row (call after saving it).
export function syncLink(row) {
  const cfg = mqttConfigOf(row);
  if (row.status === 'active' && cfg) ensureLink(row.id, cfg);
  else dropLink(row.id);
}

export async function startAllLinks() {
  const [rows] = await pool.query("SELECT id, status, connection_mode, mqtt_host, mqtt_port, mqtt_publish_topic, mqtt_subscribe_topic FROM transmitters WHERE connection_mode = 'mqtt'");
  for (const row of rows) syncLink(row);
}

export function closeAllLinks() {
  for (const id of [...links.keys()]) dropLink(id);
}

// For the Devices page. `configured` rows that have not been opened yet (lazy) read as 'idle'.
export function linkStatus(row) {
  const cfg = mqttConfigOf(row);
  if (!cfg) return { configured: false };
  const link = links.get(row.id);
  if (!link || !sameConfig(link.cfg, cfg)) return { configured: true, state: row.status === 'active' ? 'idle' : 'off' };
  return {
    configured: true,
    state: link.state,
    error: link.state === 'connected' ? null : link.error,
    connected_at: link.connectedAt ? new Date(link.connectedAt).toISOString() : null,
    last_message_at: link.lastMessageAt ? new Date(link.lastMessageAt).toISOString() : null,
    last_message: link.lastMessage,
  };
}

function waitConnected(link, ms) {
  if (link.state === 'connected') return Promise.resolve(true);
  return new Promise((resolve) => {
    const w = { resolve, timer: setTimeout(() => { link.connectWaiters.delete(w); resolve(false); }, ms) };
    link.connectWaiters.add(w);
  });
}

// Opens (or reuses) the connection and reports whether it is up and the reply topic is subscribed.
export async function testConnection(id, cfg) {
  const link = ensureLink(id, cfg);
  const wasUp = link.state === 'connected';
  const ok = await waitConnected(link, 9000);
  return {
    ok,
    latencyMs: ok && !wasUp ? link.connectMs : null,
    detail: ok
      ? `Connected to ${cfg.host}:${cfg.port} · listening for replies on "${cfg.sub}"${wasUp ? ' (connection was already up)' : ''}`
      : `Could not connect to ${cfg.host}:${cfg.port}: ${link.error ?? 'no answer (timed out)'}`,
  };
}

// Publish `text` on the command topic and wait for the device's answer on the reply topic.
// Resolves like sendTcpMessage does, so the callers can treat LAN and MQTT the same way:
//   { ok, connected, latencyMs, sent, received, detail }
// isComplete(text) lets a caller stop waiting as soon as the reply looks finished; otherwise the reply
// is taken settleMs after the last message arrived. Several messages are joined line by line.
export async function request(id, cfg, text, { timeoutMs = 4000, isComplete = null, settleMs = 700 } = {}) {
  const link = ensureLink(id, cfg);
  if (!(await waitConnected(link, 6000))) {
    return { ok: false, connected: false, latencyMs: null, sent: text, received: null, detail: `Cannot reach the MQTT broker ${cfg.host}:${cfg.port} (${link.error ?? 'no connection'})` };
  }
  return new Promise((resolve) => {
    let settled = false;
    let settleTimer = null;
    let timeoutTimer = null;
    let publishedAt = Date.now();
    let firstMs = null;
    const chunks = [];

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(settleTimer);
      clearTimeout(timeoutTimer);
      link.waiters.delete(waiter);
      resolve(result);
    };
    const joined = () => (chunks.length === 1 ? chunks[0] : chunks.map((c) => (/\n$/.test(c) ? c : `${c}\r\n`)).join(''));
    const withReply = () => {
      const reply = joined();
      finish({ ok: true, connected: true, latencyMs: firstMs ?? Date.now() - publishedAt, sent: text, received: reply, detail: `${reply.length} bytes received` });
    };
    const waiter = {
      push(msg) {
        if (firstMs === null) firstMs = Date.now() - publishedAt;
        chunks.push(msg);
        clearTimeout(settleTimer);
        if (isComplete && (isComplete(joined()) || isComplete(msg))) { withReply(); return; }
        settleTimer = setTimeout(withReply, settleMs);
      },
      abort() { finish({ ok: false, connected: false, latencyMs: null, sent: text, received: null, detail: 'The MQTT connection was closed' }); },
    };
    link.waiters.add(waiter); // listening before publishing, so a fast reply is not missed

    link.client.publish(cfg.pub, text, { qos: 1 }, (err) => {
      if (err) { finish({ ok: false, connected: link.state === 'connected', latencyMs: null, sent: text, received: null, detail: `Could not publish to "${cfg.pub}": ${errText(err)}` }); return; }
      publishedAt = Date.now();
      timeoutTimer = setTimeout(() => {
        if (chunks.length) withReply();
        else finish({ ok: false, connected: true, latencyMs: null, sent: text, received: null, detail: `Published to "${cfg.pub}", but nothing came back on "${cfg.sub}" before the timeout` });
      }, timeoutMs);
    });
  });
}

// A message nobody was waiting for. If it says which receiver it is about ("source"), update that light,
// exactly as the default broker's messages do.
async function unsolicited(link, text) {
  const { parseAckReply, parseStatusReply } = await import('./statusParser.js');
  const { applyStatus } = await import('./deviceStatusService.js');
  let source = null;
  try { const j = JSON.parse(text); if (j && typeof j === 'object') source = j.source ?? j.status?.source ?? null; } catch { /* plain text */ }
  if (source == null) source = parseAckReply(text)?.source ?? null;
  if (source == null) return;
  const [rows] = await pool.query('SELECT id FROM receivers WHERE parent_transmitter_id = ? AND lora_address = ?', [link.id, Number(source)]);
  if (!rows[0]) return;
  const parsed = parseStatusReply(text);
  await applyStatus(rows[0].id, parsed ? { online: true, ...parsed, source: 'reported' } : { online: true });
}
