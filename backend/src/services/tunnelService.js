import { pool } from '../db/pool.js';
import { sendCommand, isAcceptedResult } from './commandService.js';
import { loadLiveLights } from './liveLights.js';
import { raiseTunnelFailed, resolveTunnelFailed } from './alarmService.js';

export const MODES = ['day', 'evening', 'night', 'off'];
export const ZONE_KINDS = ['threshold', 'transition', 'interior', 'exit', 'custom'];

// Mode changes take a while (several commands per light, one at a time), so they run in the
// background; the UI polls this to show progress. One job per tunnel at a time.
const jobs = new Map(); // tunnelId -> { mode, done, total }
export const jobOf = (tunnelId) => jobs.get(Number(tunnelId)) ?? null;

export async function loadTunnels(onlyId = null) {
  const [tunnels] = await pool.query(`SELECT * FROM tunnels ${onlyId ? 'WHERE id = ?' : ''} ORDER BY name`, onlyId ? [onlyId] : []);
  if (!tunnels.length) return [];
  const ids = tunnels.map((t) => t.id);
  const [zones] = await pool.query('SELECT * FROM tunnel_zones WHERE tunnel_id IN (?) ORDER BY position, id', [ids]);
  const [links] = await pool.query('SELECT zone_id, receiver_id FROM tunnel_zone_lights WHERE tunnel_id IN (?)', [ids]);
  const live = new Map((await loadLiveLights(links.length ? [...new Set(links.map((l) => l.receiver_id))] : [])).map((l) => [l.receiverId, l]));

  return tunnels.map((t) => ({
    id: t.id, name: t.name, description: t.description, length_m: t.length_m,
    current_mode: t.current_mode, applied_at: t.applied_at, last_ok: t.last_ok, last_failed: t.last_failed,
    job: jobOf(t.id),
    zones: zones.filter((z) => z.tunnel_id === t.id).map((z) => ({
      id: z.id, name: z.name, kind: z.kind, position: z.position,
      day_brightness: z.day_brightness, evening_brightness: z.evening_brightness, night_brightness: z.night_brightness,
      lights: links.filter((l) => l.zone_id === z.id).map((l) => live.get(l.receiver_id)).filter(Boolean).map((l) => ({
        receiverId: l.receiverId, name: l.name, address: l.address, enabled: l.enabled, online: l.online,
        lit: l.relay1 === true || l.relay2 === true, brightness: l.brightness,
      })),
    })),
  }));
}

// Replaces all of a tunnel's zones (and which lights sit in each) in one transaction.
export async function replaceZones(tunnelId, zones) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM tunnel_zones WHERE tunnel_id = ?', [tunnelId]); // lights cascade
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      const [r] = await conn.query(
        `INSERT INTO tunnel_zones (tunnel_id, name, kind, position, day_brightness, evening_brightness, night_brightness) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [tunnelId, z.name, z.kind, i, z.day_brightness, z.evening_brightness, z.night_brightness]
      );
      for (const receiverId of z.receiverIds) {
        await conn.query('INSERT INTO tunnel_zone_lights (zone_id, receiver_id, tunnel_id) VALUES (?, ?, ?)', [r.insertId, receiverId, tunnelId]);
      }
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

const brightnessKey = { day: 'day_brightness', evening: 'evening_brightness', night: 'night_brightness' };

// Puts every light of the tunnel into a mode: its zone's brightness for day / evening / night,
// or everything off. Returns { total, ok, failed, skipped }. Throws when already running.
export async function applyMode(tunnelId, mode, { userId, userRole = 'Tunnel' }) {
  tunnelId = Number(tunnelId);
  if (!MODES.includes(mode)) throw Object.assign(new Error('unknown mode'), { code: 'INVALID_INPUT' });
  if (jobs.has(tunnelId)) throw Object.assign(new Error('A mode change is already running for this tunnel'), { code: 'BUSY' });
  jobs.set(tunnelId, { mode, done: 0, total: 0 }); // claimed before any await
  try {
    return await runMode(tunnelId, mode, { userId, userRole });
  } finally {
    jobs.delete(tunnelId);
  }
}

async function runMode(tunnelId, mode, { userId, userRole }) {
  const [[tunnel]] = await pool.query('SELECT id, name FROM tunnels WHERE id = ?', [tunnelId]);
  if (!tunnel) throw Object.assign(new Error('Tunnel not found'), { code: 'NOT_FOUND' });

  const [rows] = await pool.query(
    `SELECT z.position, z.day_brightness, z.evening_brightness, z.night_brightness, zl.receiver_id,
            (r.status = 'active' AND t.status = 'active') AS usable
     FROM tunnel_zones z
     JOIN tunnel_zone_lights zl ON zl.zone_id = z.id
     JOIN receivers r ON r.id = zl.receiver_id
     JOIN transmitters t ON t.id = r.parent_transmitter_id
     WHERE z.tunnel_id = ? ORDER BY z.position, zl.receiver_id`,
    [tunnelId]
  );
  if (!rows.length) throw Object.assign(new Error('This tunnel has no lights in its zones yet'), { code: 'EMPTY' });

  const plan = rows.filter((r) => r.usable);
  const skipped = rows.length - plan.length;
  jobs.get(tunnelId).total = plan.length;
  let ok = 0;
  let failed = 0;
  {
    for (const row of plan) {
      const cmds = mode === 'off'
        ? [{ type: 'relay1', payload: { state: false } }, { type: 'relay2', payload: { state: false } }]
        : [{ type: 'relay1', payload: { state: true } }, { type: 'relay2', payload: { state: true } }, { type: 'brightness', payload: { value: row[brightnessKey[mode]] } }];
      let good = true;
      for (const c of cmds) {
        try {
          const r = await sendCommand({ userId, userRole, receiverId: row.receiver_id, type: c.type, payload: c.payload });
          if (!isAcceptedResult(r) || r.status === 'NO_ACK') good = false;
        } catch {
          good = false;
        }
      }
      if (good) ok += 1; else failed += 1;
      jobs.get(tunnelId).done += 1;
    }
    await pool.query('UPDATE tunnels SET current_mode = ?, applied_at = NOW(), last_ok = ?, last_failed = ? WHERE id = ?', [mode, ok, failed, tunnelId]);
    if (failed > 0) await raiseTunnelFailed(tunnel, mode, ok, failed).catch((err) => console.error('Alarm raise failed:', err.message));
    else await resolveTunnelFailed(tunnelId).catch(() => {});
  }
  return { total: plan.length, ok, failed, skipped };
}
