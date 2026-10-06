import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { describeTiming, getSiteSettings } from '../services/scheduleService.js';
import { has } from '../services/permissions.js';

export const dashboardRouter = Router();

// Statuses that mean "the command did not work" (the rest were accepted).
const BAD = ['FAILED', 'TIMEOUT', 'NO_ACK', 'INVALID_COMMAND', 'INVALID_PARAMETER', 'DEVICE_OFFLINE', 'TRANSMITTER_OFFLINE', 'DISABLED'];

// GET /api/dashboard/summary - everything the Overview page shows, in one call.
// Sections the caller may not see (alarms, schedules) come back empty rather than failing.
dashboardRouter.get('/summary', requireAuth, requirePermission('dashboard', 'view'), asyncHandler(async (req, res) => {
  const perms = req.permissions;

  const [[tx]] = await pool.query(`SELECT COUNT(*) AS total, COALESCE(SUM(status = 'active'), 0) AS active FROM transmitters`);

  // Lights = enabled receivers. online: true / false / null (never heard from).
  const [lightRows] = await pool.query(
    `SELECT r.id, ds.online, ds.relay1, ds.relay2
     FROM receivers r
     JOIN transmitters t ON t.id = r.parent_transmitter_id
     LEFT JOIN device_status ds ON ds.receiver_id = r.id
     WHERE r.status = 'active' AND t.status = 'active'`
  );
  const [[allRx]] = await pool.query('SELECT COUNT(*) AS total FROM receivers');
  const state = new Map(lightRows.map((l) => [l.id, l]));
  const lights = { total: lightRows.length, online: 0, offline: 0, nodata: 0, lit: 0, disabled: allRx.total - lightRows.length };
  for (const l of lightRows) {
    if (l.online === null) lights.nodata += 1;
    else if (l.online) lights.online += 1;
    else lights.offline += 1;
    if (l.relay1 || l.relay2) lights.lit += 1;
  }

  // Health per road, from the lights drawn on each map.
  const [roadRows] = await pool.query('SELECT id, name, layout_json FROM roads ORDER BY name');
  const roads = roadRows.map((r) => {
    const layout = typeof r.layout_json === 'string' ? JSON.parse(r.layout_json) : r.layout_json;
    const ids = [...new Set((layout.lights ?? []).map((l) => l.receiverId))];
    const row = { id: r.id, name: r.name, total: ids.length, online: 0, offline: 0, nodata: 0, lit: 0 };
    for (const id of ids) {
      const l = state.get(id);
      if (!l || l.online === null) row.nodata += 1;
      else if (l.online) row.online += 1;
      else row.offline += 1;
      if (l && (l.relay1 || l.relay2)) row.lit += 1;
    }
    return row;
  });

  // Commands in the last 24 hours, per hour (UTC hour starts; the browser localises them).
  const [hourRows] = await pool.query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%dT%H:00:00Z') AS hour, COUNT(*) AS total, SUM(status IN (?)) AS bad
     FROM commands WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
     GROUP BY hour ORDER BY hour`,
    [BAD]
  );
  const total24 = hourRows.reduce((n, h) => n + Number(h.total), 0);
  const bad24 = hourRows.reduce((n, h) => n + Number(h.bad), 0);
  const activity = {
    hours: hourRows.map((h) => ({ hour: h.hour, total: Number(h.total), failed: Number(h.bad) })),
    total: total24,
    failed: bad24,
    successRate: total24 ? Math.round(((total24 - bad24) / total24) * 100) : null,
  };

  let alarms = { counts: { open: 0, unacknowledged: 0, critical: 0, warning: 0 }, items: [] };
  if (has(perms, 'alarms', 'view')) {
    const [[c]] = await pool.query(
      `SELECT COALESCE(SUM(status = 'active'), 0) AS unacknowledged, COALESCE(SUM(status <> 'resolved'), 0) AS open,
              COALESCE(SUM(status <> 'resolved' AND severity = 'critical'), 0) AS critical,
              COALESCE(SUM(status <> 'resolved' AND severity = 'warning'), 0) AS warning FROM alarms`
    );
    const [items] = await pool.query(
      `SELECT id, type, severity, title, detail, status, raised_at FROM alarms WHERE status <> 'resolved'
       ORDER BY FIELD(severity, 'critical', 'warning', 'info'), raised_at DESC LIMIT 5`
    );
    alarms = { counts: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v)])), items };
  }

  let upcoming = [];
  if (has(perms, 'schedules', 'view')) {
    const settings = await getSiteSettings();
    const [rows] = await pool.query('SELECT * FROM schedules WHERE enabled = 1');
    const now = new Date();
    upcoming = rows
      .map((s) => ({ id: s.id, name: s.name, action: s.action, trigger_type: s.trigger_type, ...describeTiming(s, settings, now) }))
      .filter((s) => s.next_run_at)
      .sort((a, b) => new Date(a.next_run_at) - new Date(b.next_run_at))
      .slice(0, 4);
  }

  const [recentCommands] = await pool.query(
    `SELECT c.id, c.created_at, r.device_name, c.command, c.parameter, c.status, c.user_role
     FROM commands c JOIN receivers r ON r.id = c.receiver_id
     ORDER BY c.created_at DESC LIMIT 8`
  );

  res.json({
    transmitters: { total: tx.total, active: Number(tx.active) },
    // Kept for older clients: receivers.* counts the same lights as `lights`.
    receivers: { total: allRx.total, online: lights.online, offline: lights.offline },
    lights,
    activeFaults: alarms.counts.open,
    alarms,
    roads,
    activity,
    upcomingSchedules: upcoming,
    recentCommands,
  });
}));
