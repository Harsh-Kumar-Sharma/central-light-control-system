// Replays a light's state log to work out uptime, hours lit and estimated energy.
// Pure (no database) so it can be unit-tested.
//
// events: [{ at: ms, online: 0|1|null, relay1: 0|1|null, relay2: 0|1|null, brightness: 1-99|null }]
//         sorted oldest first. Include the last event BEFORE `from` so the starting state is known.
// watts:  { w1, w2 } rated load of each relay (null = unknown).
//
// Assumptions (stated in the UI too):
//  - A light keeps its last known relay state until told otherwise, even while it is offline.
//  - Power scales with brightness (a light at 40% draws 40% of its rating); unknown brightness = 100%.
export function computeUsage(events, from, to, watts = {}) {
  const w1 = watts.w1 ?? null;
  const w2 = watts.w2 ?? null;
  const out = { onlineMs: 0, offlineMs: 0, unknownMs: 0, litMs: 0, wh: 0, fullWh: 0, hasRating: w1 != null || w2 != null };
  if (to <= from) return out;

  let state = null;
  let i = 0;
  while (i < events.length && events[i].at <= from) { state = events[i]; i += 1; }

  const add = (st, ms) => {
    if (ms <= 0) return;
    if (!st) { out.unknownMs += ms; return; }
    if (st.online === 1) out.onlineMs += ms;
    else if (st.online === 0) out.offlineMs += ms;
    else out.unknownMs += ms;
    const on1 = st.relay1 === 1;
    const on2 = st.relay2 === 1;
    if (on1 || on2) out.litMs += ms;
    const watt = (on1 ? (w1 ?? 0) : 0) + (on2 ? (w2 ?? 0) : 0);
    const factor = st.brightness == null ? 1 : st.brightness / 100;
    out.fullWh += (watt * ms) / 3_600_000;
    out.wh += (watt * factor * ms) / 3_600_000;
  };

  let cursor = from;
  for (; i < events.length && events[i].at < to; i += 1) {
    add(state, events[i].at - cursor);
    cursor = events[i].at;
    state = events[i];
  }
  add(state, to - cursor);
  return out;
}

// Uptime in percent among the time we actually knew about; null when never known.
export function uptimePercent(u) {
  const known = u.onlineMs + u.offlineMs;
  return known > 0 ? (u.onlineMs / known) * 100 : null;
}

export const sumUsage = (list) => list.reduce((a, u) => ({
  onlineMs: a.onlineMs + u.onlineMs,
  offlineMs: a.offlineMs + u.offlineMs,
  unknownMs: a.unknownMs + u.unknownMs,
  litMs: a.litMs + u.litMs,
  wh: a.wh + u.wh,
  fullWh: a.fullWh + u.fullWh,
  hasRating: a.hasRating || u.hasRating,
}), { onlineMs: 0, offlineMs: 0, unknownMs: 0, litMs: 0, wh: 0, fullWh: 0, hasRating: false });
