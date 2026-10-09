import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import mqtt from 'mqtt';
import { Aedes } from 'aedes';

process.env.JWT_SECRET ??= 'test-secret';
const { ensureLink, dropLink, linkStatus, request, testConnection, closeAllLinks } = await import('../src/services/mqttLinks.js');
const { isReplyComplete } = await import('../src/services/statusParser.js');
const { pool } = await import('../src/db/pool.js').catch(() => ({ pool: null }));

// A real broker, in this process, plus a pretend device wired to it.
const broker = await Aedes.createBroker();
const server = net.createServer(broker.handle);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const cmdTopic = 'ars/test/cmd';
const replyTopic = 'ars/test/reply';
const cfg = { host: '127.0.0.1', port, pub: cmdTopic, sub: replyTopic };

const device = mqtt.connect(`mqtt://127.0.0.1:${port}`);
const seen = [];
let mode = 'ack'; // what the pretend device does with a command
await new Promise((r) => device.on('connect', r));
await new Promise((r) => device.subscribe(cmdTopic, r));
device.on('message', (_t, payload) => {
  const text = payload.toString();
  seen.push(text);
  const m = /^Tx_(\d+)_(.+)$/.exec(text);
  if (!m || mode === 'silent') return;
  if (mode === 'ack') device.publish(replyTopic, `+OK\r\nReply Address:${m[1]},Message:ACK:${m[2]}\r\n`);
  else if (mode === 'json') device.publish(replyTopic, JSON.stringify({ source: Number(m[1]), message: `ACK:${m[2]}`, rssi: -70, snr: 8 }));
  else if (mode === 'split') { device.publish(replyTopic, '+OK'); setTimeout(() => device.publish(replyTopic, `Reply Address:${m[1]},Message:ACK:${m[2]}\r\n`), 60); }
});

after(async () => {
  closeAllLinks();
  device.end(true);
  await new Promise((r) => server.close(r));
  await broker.close();
  if (pool) await pool.end().catch(() => {});
});

test('connect test: opens the connection and subscribes to the reply topic', async () => {
  const r = await testConnection(9001, cfg);
  assert.equal(r.ok, true, r.detail);
  assert.match(r.detail, new RegExp(`127.0.0.1:${port}`));
  assert.match(r.detail, /ars\/test\/reply/);
  assert.equal(linkStatus({ id: 9001, status: 'active', connection_mode: 'mqtt', mqtt_host: '127.0.0.1', mqtt_port: port, mqtt_publish_topic: cmdTopic, mqtt_subscribe_topic: replyTopic }).state, 'connected');
});

test('a command is published on the command topic and the reply is read from the reply topic', async () => {
  mode = 'ack';
  const r = await request(9001, cfg, 'Tx_2_R1ON', { timeoutMs: 3000, isComplete: isReplyComplete });
  assert.equal(r.ok, true, r.detail);
  assert.ok(seen.includes('Tx_2_R1ON'), 'the device saw the command text exactly');
  assert.match(r.received, /Message:ACK:R1ON/);
  assert.ok(r.latencyMs >= 0);
});

test('a JSON reply is complete at once', async () => {
  mode = 'json';
  const t0 = Date.now();
  const r = await request(9001, cfg, 'Tx_2_R2OFF', { timeoutMs: 3000, isComplete: isReplyComplete, settleMs: 2000 });
  assert.equal(r.ok, true);
  assert.equal(JSON.parse(r.received).message, 'ACK:R2OFF');
  assert.ok(Date.now() - t0 < 1500, 'did not wait for the settle time');
});

test('a reply that arrives in two messages is joined', async () => {
  mode = 'split';
  const r = await request(9001, cfg, 'Tx_2_R1OFF', { timeoutMs: 3000, isComplete: isReplyComplete });
  assert.equal(r.ok, true);
  assert.match(r.received, /\+OK/);
  assert.match(r.received, /Message:ACK:R1OFF/);
});

test('no reply before the timeout is reported as such, with the connection still up', async () => {
  mode = 'silent';
  const r = await request(9001, cfg, 'Tx_2_R1ON', { timeoutMs: 400 });
  assert.equal(r.ok, false);
  assert.equal(r.connected, true);
  assert.match(r.detail, /nothing came back on "ars\/test\/reply"/);
});

test('an old retained message is not mistaken for the answer', async () => {
  mode = 'silent';
  await new Promise((r) => device.publish(replyTopic, 'STALE', { retain: true }, r));
  dropLink(9001); // a fresh connection: the broker hands the retained message over on subscribe
  const r = await request(9001, cfg, 'Tx_2_R1ON', { timeoutMs: 500 });
  assert.equal(r.ok, false, 'must not treat the retained message as a reply');
  await new Promise((resolve) => device.publish(replyTopic, '', { retain: true }, resolve)); // clear it
});

test('an unreachable broker gives a clear error, not a hang', async () => {
  const closed = net.createServer();
  await new Promise((r) => closed.listen(0, '127.0.0.1', r));
  const deadPort = closed.address().port;
  await new Promise((r) => closed.close(r)); // nothing listens here any more
  const t0 = Date.now();
  const r = await testConnection(9002, { host: '127.0.0.1', port: deadPort, pub: 'a', sub: 'b' });
  assert.equal(r.ok, false);
  assert.match(r.detail, /Could not connect to 127.0.0.1/);
  assert.ok(Date.now() - t0 < 12000);
  const q = await request(9002, { host: '127.0.0.1', port: deadPort, pub: 'a', sub: 'b' }, 'x', { timeoutMs: 300 });
  assert.equal(q.ok, false);
  assert.equal(q.connected, false);
  dropLink(9002);
});

test('changing the settings moves the connection to the new ones', async () => {
  const a = ensureLink(9003, cfg);
  const b = ensureLink(9003, { ...cfg, pub: 'ars/other/cmd' });
  assert.notEqual(a, b);
  assert.equal(ensureLink(9003, { ...cfg, pub: 'ars/other/cmd' }), b, 'same settings reuse the connection');
  dropLink(9003);
});
