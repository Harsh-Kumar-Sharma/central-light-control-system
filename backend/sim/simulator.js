// Device simulator for the Central Light Control System.
//
// Behaves like the real hardware described in docs/RUNBOOK.md §7:
//   * LAN transmitters  - a TCP server per transmitter; every line "Tx_<addr>_<CMD>" is answered with the
//     serial-style log of the bench device (SYSTEM >> ..., LoRa << +OK, Reply Address:<n>,Message:ACK:<CMD>).
//   * MQTT transmitters - connect to a broker, listen on a command topic, answer on a reply topic.
//   * Receivers behind each transmitter hold relay1 / relay2 / brightness and can be made faulty.
//
// Run:  node backend/sim/simulator.js        (from the repo root; needs `npm install` in backend/)
// Control API (default :4200):
//   GET  /state                       -> every transmitter + receiver
//   POST /receiver/:tx/:addr  {offline?, silent?, delayMs?, dropAck?, sensors?, relay1?, relay2?, brightness?}
//   POST /transmitter/:tx     {down?}   (down = refuse TCP / stop answering MQTT)
//   GET  /log                         -> the last 200 commands the devices received
import net from 'node:net';
import http from 'node:http';
import mqtt from 'mqtt';
import { Aedes } from 'aedes';

const CONTROL_PORT = Number(process.env.SIM_CONTROL_PORT ?? 4200);
const BROKER_PORT = Number(process.env.SIM_BROKER_PORT ?? 1885);

const mkReceivers = (addrs) => Object.fromEntries(addrs.map((a) => [a, { relay1: false, relay2: false, brightness: 50, offline: false, silent: false, delayMs: 0, dropAck: false, sensors: false }]));

// transmitter key -> definition. "lan" listens on `port`; "mqtt" uses the broker above.
export const TOPOLOGY = {
  A: { mode: 'lan', addr: 1, port: 9101, down: false, receivers: mkReceivers([11, 12, 13, 14]) },
  B: { mode: 'lan', addr: 2, port: 9102, down: false, receivers: mkReceivers([21, 22, 23]) },
  C: { mode: 'mqtt', addr: 3, cmdTopic: 'sim/c/cmd', replyTopic: 'sim/c/reply', down: false, receivers: mkReceivers([31, 32]) },
};

const log = [];
const note = (tx, line) => { log.push({ at: new Date().toISOString(), tx, line }); if (log.length > 200) log.shift(); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One command line -> the text the transmitter writes back (or null when the radio gets no answer at all).
async function handleLine(txKey, line) {
  const tx = TOPOLOGY[txKey];
  const m = line.trim().match(/^Tx_(\d+)_(.+)$/);
  if (!m) return `SYSTEM >> ${line.trim()}\nUnknown command format\n`;
  const addr = Number(m[1]);
  const cmd = m[2];
  note(txKey, line.trim());
  const rx = tx.receivers[addr];
  let out = `SYSTEM >> ${line.trim()}\nSend to Address : ${addr}\nCommand         : ${cmd}\nLoRa << +OK\n`;
  if (!rx || rx.offline || rx.silent) return out; // radio sent, nobody answers
  if (rx.delayMs) await sleep(rx.delayMs);

  let reply;
  if (/^R1ON$/i.test(cmd)) { rx.relay1 = true; reply = `ACK:R1ON`; }
  else if (/^R1OFF$/i.test(cmd)) { rx.relay1 = false; reply = `ACK:R1OFF`; }
  else if (/^R2ON$/i.test(cmd)) { rx.relay2 = true; reply = `ACK:R2ON`; }
  else if (/^R2OFF$/i.test(cmd)) { rx.relay2 = false; reply = `ACK:R2OFF`; }
  else if (/^LUX_(\d+)$/i.test(cmd)) {
    const v = Number(cmd.split('_')[1]);
    if (v < 1 || v > 99) reply = `ERR:LUX_RANGE`; // firmware range 1-99
    else { rx.brightness = v; reply = `ACK:LUX_${v}`; }
  } else if (/^STATUS$/i.test(cmd)) {
    reply = `STATUS:R1=${rx.relay1 ? 1 : 0}_R2=${rx.relay2 ? 1 : 0}`;
    if (rx.sensors) reply += ` voltage=${(228 + Math.random() * 4).toFixed(1)} power=${(rx.relay1 ? 100 : 0) + (rx.relay2 ? 100 : 0)} current=${((rx.relay1 ? 0.4 : 0) + (rx.relay2 ? 0.4 : 0)).toFixed(2)} temperature=${(30 + Math.random() * 5).toFixed(1)} ambient=${Math.round(200 + Math.random() * 50)}`;
  } else reply = `ERR:UNKNOWN_${cmd}`;

  if (rx.dropAck) return out; // executed, but the ACK is lost on the way back
  out += `Reply Address:${addr},Message:${reply}\n`;
  return out;
}

// ---- LAN transmitters: TCP ----------------------------------------------------------------------------
const servers = {};
function startLan(txKey) {
  const tx = TOPOLOGY[txKey];
  const srv = net.createServer((sock) => {
    let buf = '';
    const flush = async (text) => { const r = await handleLine(txKey, text); if (r && !sock.destroyed) sock.write(r); };
    sock.on('data', (d) => {
      buf += d.toString();
      if (/[\r\n]/.test(buf)) { const lines = buf.split(/\r?\n/).filter(Boolean); buf = ''; lines.forEach(flush); }
      else setTimeout(() => { if (buf) { const t = buf; buf = ''; flush(t); } }, 80); // device accepts commands with no line ending
    });
    sock.on('error', () => {});
  });
  srv.listen(tx.port, '0.0.0.0', () => console.log(`[sim] LAN transmitter ${txKey} (addr ${tx.addr}) on tcp :${tx.port}, receivers ${Object.keys(tx.receivers).join(',')}`));
  servers[txKey] = srv;
}

// ---- MQTT transmitter + its own broker --------------------------------------------------------------
async function startMqtt() {
  const aedes = await Aedes.createBroker();
  const server = net.createServer(aedes.handle);
  await new Promise((r) => server.listen(BROKER_PORT, '0.0.0.0', r));
  console.log(`[sim] MQTT broker (aedes) on tcp :${BROKER_PORT}`);
  const client = mqtt.connect(`mqtt://127.0.0.1:${BROKER_PORT}`);
  client.on('connect', () => {
    for (const [key, tx] of Object.entries(TOPOLOGY)) {
      if (tx.mode !== 'mqtt') continue;
      client.subscribe(tx.cmdTopic);
      console.log(`[sim] MQTT transmitter ${key} (addr ${tx.addr}) cmd=${tx.cmdTopic} reply=${tx.replyTopic}, receivers ${Object.keys(tx.receivers).join(',')}`);
    }
  });
  client.on('message', async (topic, payload) => {
    for (const [key, tx] of Object.entries(TOPOLOGY)) {
      if (tx.mode !== 'mqtt' || tx.cmdTopic !== topic || tx.down) continue;
      const reply = await handleLine(key, payload.toString());
      if (reply) client.publish(tx.replyTopic, reply);
    }
  });
}

// ---- control API ------------------------------------------------------------------------------------
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body, null, 2)); };
http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const parts = url.pathname.split('/').filter(Boolean);
    let data = {};
    try { data = body ? JSON.parse(body) : {}; } catch { return json(res, 400, { error: 'bad json' }); }
    if (req.method === 'GET' && parts[0] === 'state') return json(res, 200, TOPOLOGY);
    if (req.method === 'GET' && parts[0] === 'log') return json(res, 200, log);
    if (req.method === 'POST' && parts[0] === 'receiver') {
      const rx = TOPOLOGY[parts[1]]?.receivers[parts[2]];
      if (!rx) return json(res, 404, { error: 'no such receiver' });
      Object.assign(rx, data);
      return json(res, 200, rx);
    }
    if (req.method === 'POST' && parts[0] === 'transmitter') {
      const tx = TOPOLOGY[parts[1]];
      if (!tx) return json(res, 404, { error: 'no such transmitter' });
      Object.assign(tx, { down: Boolean(data.down) });
      // A powered-off LAN transmitter refuses connections outright (like a real unplugged box would time out / refuse).
      if (tx.mode === 'lan') {
        if (tx.down) { servers[parts[1]]?.close(); servers[parts[1]] = null; }
        else if (!servers[parts[1]]) startLan(parts[1]);
      }
      return json(res, 200, { down: tx.down });
    }
    json(res, 404, { error: 'not found' });
  });
}).listen(CONTROL_PORT, '127.0.0.1', () => console.log(`[sim] control API on http://127.0.0.1:${CONTROL_PORT}`));

for (const k of Object.keys(TOPOLOGY)) if (TOPOLOGY[k].mode === 'lan') startLan(k);
startMqtt().catch((e) => { console.error('[sim] broker failed', e); process.exit(1); });
