import { execFile } from 'node:child_process';
import net from 'node:net';

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function parseIpv4(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(IPV4_PATTERN);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  return octets.every((o) => o >= 0 && o <= 255) ? octets : null;
}

// Tests may only target private LAN addresses (and loopback, for local
// dev/simulators). This keeps the feature from being used to probe the
// public internet or the server's own network from the outside.
export function isAllowedTestTarget(ip) {
  const o = parseIpv4(ip);
  if (!o) return false;
  const [a, b] = o;
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function isValidPort(port) {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

// ICMP ping via the OS `ping` binary (Node has no raw-socket ICMP). execFile
// without a shell, and the IP is validated first, so nothing is injectable.
export function pingHost(ip, count = 4) {
  const isWindows = process.platform === 'win32';
  const args = isWindows ? ['-n', String(count), '-w', '1000', ip] : ['-c', String(count), '-W', '1', ip];

  return new Promise((resolve) => {
    execFile('ping', args, { timeout: 15000, windowsHide: true }, (err, stdout = '') => {
      // A real reply line carries "TTL=" (Windows) / "ttl=" (Linux/mac).
      // "Destination host unreachable" replies do not, even when ping exits 0.
      const replyLines = stdout.split(/\r?\n/).filter((l) => /ttl=/i.test(l));
      const times = replyLines
        .map((l) => l.match(/time\s*([=<])\s*(\d+(?:\.\d+)?)\s*ms/i))
        .filter(Boolean)
        .map((m) => (m[1] === '<' ? 1 : Math.round(Number(m[2]))));
      const received = replyLines.length;
      const avg = times.length ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : null;
      const ok = received > 0;

      resolve({
        ok,
        sent: count,
        received,
        lossPercent: Math.round(((count - received) / count) * 100),
        latencyMs: avg,
        detail: ok
          ? `${received}/${count} replies, avg ${avg ?? '?'} ms`
          : err?.killed ? 'ping timed out' : `no reply (${count}/${count} lost)`,
      });
    });
  });
}

export function checkTcpPort(ip, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = net.connect({ host: ip, port });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => finish({ ok: true, latencyMs: Date.now() - started, detail: `port ${port} open` }));
    socket.on('timeout', () => finish({ ok: false, latencyMs: null, detail: `port ${port} timed out` }));
    socket.on('error', (e) => finish({ ok: false, latencyMs: null, detail: `port ${port}: ${e.code ?? e.message}` }));
  });
}

// Generic TCP request/response. The transmitter firmware's LAN protocol is
// not documented anywhere we have, so this sends the text exactly as typed
// and returns whatever comes back — it does not assume any message format.
// isComplete(text) lets a caller stop waiting as soon as the reply looks finished;
// otherwise the reply is taken settleMs after the last chunk arrives.
export function sendTcpMessage(ip, port, message, timeoutMs = 3000, { isComplete = null, settleMs = 300 } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = net.connect({ host: ip, port });
    const chunks = [];
    let firstByteMs = null;
    let connected = false;
    let settled = false;
    let settleTimer = null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(settleTimer);
      socket.destroy();
      resolve(result);
    };
    const finishWithReply = () => {
      const reply = Buffer.concat(chunks).toString('utf8');
      finish({ ok: true, connected: true, latencyMs: firstByteMs ?? Date.now() - started, sent: message, received: reply, detail: `${reply.length} bytes received` });
    };

    socket.setTimeout(timeoutMs);
    socket.on('connect', () => { connected = true; socket.write(message); });
    socket.on('data', (data) => {
      if (firstByteMs === null) firstByteMs = Date.now() - started;
      chunks.push(data);
      clearTimeout(settleTimer);
      if (isComplete && isComplete(Buffer.concat(chunks).toString('utf8'))) { finishWithReply(); return; }
      settleTimer = setTimeout(finishWithReply, settleMs); // wait briefly for the rest of the reply
    });
    socket.on('timeout', () => {
      if (chunks.length) finishWithReply();
      else finish({ ok: false, connected, latencyMs: null, sent: message, received: null, detail: connected ? 'connected and sent, but no reply before timeout' : 'could not connect (timed out)' });
    });
    socket.on('error', (e) => finish({ ok: false, connected, latencyMs: null, sent: message, received: null, detail: `${e.code ?? e.message}` }));
    socket.on('close', () => {
      if (chunks.length) finishWithReply();
      else finish({ ok: false, connected, latencyMs: null, sent: message, received: null, detail: 'connection closed with no reply' });
    });
  });
}
