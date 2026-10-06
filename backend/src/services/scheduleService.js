import { pool } from '../db/pool.js';
import { sendCommand, isAcceptedResult } from './commandService.js';
import { clockText, isDue, localParts, nextRun } from './scheduleTime.js';
import { raiseScheduleFailed, resolveScheduleFailed } from './alarmService.js';
import { applyMode } from './tunnelService.js';

export async function getSiteSettings() {
  const [rows] = await pool.query('SELECT latitude, longitude, timezone FROM site_settings WHERE id = 1');
  const r = rows[0] ?? { latitude: null, longitude: null, timezone: 'Asia/Kolkata' };
  return {
    latitude: r.latitude == null ? null : Number(r.latitude),
    longitude: r.longitude == null ? null : Number(r.longitude),
    timezone: r.timezone,
  };
}

// Receiver ids a schedule acts on, split into reachable and disabled ones.
export async function resolveTargets(s) {
  let ids = [];
  if (s.target_type === 'receiver') {
    ids = [s.target_id];
  } else if (s.target_type === 'group') {
    const [rows] = await pool.query('SELECT receiver_id FROM group_members WHERE group_id = ?', [s.target_id]);
    ids = rows.map((r) => r.receiver_id);
  } else {
    const [rows] = await pool.query('SELECT layout_json FROM roads WHERE id = ?', [s.target_id]);
    if (rows[0]) {
      const layout = typeof rows[0].layout_json === 'string' ? JSON.parse(rows[0].layout_json) : rows[0].layout_json;
      ids = [...new Set((layout.lights ?? []).map((l) => l.receiverId))];
    }
  }
  if (ids.length === 0) return { active: [], skipped: 0 };
  const [rows] = await pool.query(
    `SELECT r.id, (r.status = 'active' AND t.status = 'active') AS usable
     FROM receivers r JOIN transmitters t ON t.id = r.parent_transmitter_id WHERE r.id IN (?)`,
    [ids]
  );
  const active = rows.filter((r) => r.usable).map((r) => r.id);
  return { active, skipped: ids.length - active.length };
}

const commandsFor = (s) => {
  if (s.action === 'brightness') return [{ type: 'brightness', payload: { value: Number(s.brightness) } }];
  const state = s.action === 'on';
  const relays = s.relay === 'both' ? [1, 2] : [Number(s.relay)];
  return relays.map((n) => ({ type: `relay${n}`, payload: { state } }));
};

// Sends the schedule's command to every reachable light, one after another
// (a transmitter handles a single command at a time), then logs the run.
// Commands appear in the Logs page as sent by the creator with role "Scheduler".
export async function executeSchedule(s, kind) {
  if (s.target_type === 'tunnel') return executeTunnelSchedule(s, kind);
  const { active, skipped } = await resolveTargets(s);
  let ok = 0;
  let failed = 0;
  for (const receiverId of active) {
    let good = true;
    for (const cmd of commandsFor(s)) {
      try {
        const r = await sendCommand({ userId: s.created_by, userRole: 'Scheduler', receiverId, type: cmd.type, payload: cmd.payload });
        if (!isAcceptedResult(r) || r.status === 'NO_ACK') good = false;
      } catch {
        good = false;
      }
    }
    if (good) ok += 1; else failed += 1;
  }
  // A schedule that missed lights raises an alarm; a clean run clears it.
  if (failed > 0) await raiseScheduleFailed(s, { ok, total: active.length, failed }).catch((err) => console.error('Alarm raise failed:', err.message));
  else if (active.length > 0) await resolveScheduleFailed(s.id).catch(() => {});
  const note = active.length === 0 ? 'No usable lights to switch (target empty or all disabled)' : null;
  const [res] = await pool.query(
    `INSERT INTO schedule_runs (schedule_id, schedule_name, trigger_kind, total, ok, failed, skipped, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [s.id, s.name, kind, active.length, ok, failed, skipped, note]
  );
  return { runId: res.insertId, total: active.length, ok, failed, skipped, note };
}

// A tunnel schedule switches the whole tunnel to a mode. The tunnel records its own
// failure alarm, so this only logs the run.
async function executeTunnelSchedule(s, kind) {
  let r;
  let note = null;
  try {
    r = await applyMode(s.target_id, s.mode, { userId: s.created_by, userRole: 'Scheduler' });
  } catch (err) {
    r = { total: 0, ok: 0, failed: 0, skipped: 0 };
    note = err.message.slice(0, 250);
  }
  const [res] = await pool.query(
    `INSERT INTO schedule_runs (schedule_id, schedule_name, trigger_kind, total, ok, failed, skipped, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [s.id, s.name, kind, r.total, r.ok, r.failed, r.skipped, note ?? (r.total === 0 ? 'No usable lights to switch (target empty or all disabled)' : null)]
  );
  return { runId: res.insertId, ...r, note };
}

// ---- background loop ----
let ticking = false;
export async function tick(now = new Date()) {
  if (ticking) return; // a long run must not overlap the next tick
  ticking = true;
  try {
    const settings = await getSiteSettings();
    const [rows] = await pool.query('SELECT * FROM schedules WHERE enabled = 1');
    const today = localParts(now, settings.timezone).dateStr;
    for (const s of rows) {
      if (!isDue(s, settings, now)) continue;
      // Mark first: if the run takes a while or crashes, it must not fire twice.
      await pool.query('UPDATE schedules SET last_run_date = ? WHERE id = ?', [today, s.id]);
      try {
        await executeSchedule(s, 'auto');
      } catch (err) {
        console.error(`Schedule "${s.name}" failed:`, err.message);
      }
    }
  } catch (err) {
    console.error('Scheduler tick failed:', err.message);
  } finally {
    ticking = false;
  }
}

export function startScheduler() {
  setInterval(() => { tick(); }, 30_000);
  setTimeout(() => { tick(); }, 5000);
}

// What the UI needs next to each schedule.
export function describeTiming(s, settings, now = new Date()) {
  const next = nextRun(s, settings, now);
  return {
    next_run_at: next ? next.toISOString() : null,
    next_run_local: next ? `${localParts(next, settings.timezone).dateStr} ${clockText(next, settings.timezone)}` : null,
  };
}
