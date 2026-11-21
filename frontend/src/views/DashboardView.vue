<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { dashboardApi } from '../api/resources.js';
import { useAuthStore } from '../stores/auth.js';
import { badgeClass } from '../utils/status.js';

const router = useRouter();
const auth = useAuthStore();
const summary = ref(null);
const error = ref('');
const loadedAt = ref(null);
const now = ref(Date.now());

async function load() {
  try {
    summary.value = await dashboardApi.summary();
    loadedAt.value = Date.now();
    error.value = '';
  } catch (err) {
    error.value = err.response?.data?.error?.message ?? 'Failed to load dashboard summary';
  }
}

let timer = null;
let clock = null;
onMounted(() => {
  load();
  timer = setInterval(() => { if (!document.hidden) load(); }, 15000);
  clock = setInterval(() => { now.value = Date.now(); }, 1000);
});
onBeforeUnmount(() => { clearInterval(timer); clearInterval(clock); });

const updatedText = computed(() => {
  if (!loadedAt.value) return '';
  const s = Math.max(0, Math.round((now.value - loadedAt.value) / 1000));
  return s < 5 ? 'just now' : `${s} s ago`;
});

const lights = computed(() => summary.value?.lights ?? { total: 0, online: 0, offline: 0, nodata: 0, lit: 0 });
const onlinePct = computed(() => (lights.value.total ? Math.round((lights.value.online / lights.value.total) * 100) : 0));
const alarmCounts = computed(() => summary.value?.alarms?.counts ?? { open: 0, critical: 0, unacknowledged: 0 });
const canSeeAlarms = computed(() => auth.can('alarms'));
const canSeeSchedules = computed(() => auth.can('schedules'));
const canSeeControl = computed(() => auth.can('control'));

/* ---------- 24 h chart ---------- */
const bars = computed(() => {
  const byHour = new Map((summary.value?.activity.hours ?? []).map((h) => [h.hour, h]));
  const top = new Date(Math.floor(now.value / 3600_000) * 3600_000);
  const out = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(top.getTime() - i * 3600_000);
    const key = `${d.toISOString().slice(0, 13)}:00:00Z`;
    const h = byHour.get(key) ?? { total: 0, failed: 0 };
    out.push({ key, d, total: h.total, failed: h.failed, ok: h.total - h.failed });
  }
  return out;
});
const maxBar = computed(() => Math.max(4, ...bars.value.map((b) => b.total)));
const hourLabel = (d) => d.toLocaleTimeString([], { hour: 'numeric' });
const barTitle = (b) => `${b.d.toLocaleString([], { weekday: 'short', hour: 'numeric' })}: ${b.total} command${b.total === 1 ? '' : 's'}${b.failed ? `, ${b.failed} failed` : ''}`;

/* ---------- formatting ---------- */
const ago = (iso) => {
  const s = Math.max(0, Math.round((now.value - new Date(iso).getTime()) / 1000));
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};
const until = (iso) => {
  const m = Math.max(0, Math.round((new Date(iso).getTime() - now.value) / 60000));
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.round(m / 1440)} d`;
};
const actionLabel = { on: 'Turn ON', off: 'Turn OFF', brightness: 'Set brightness' };
const pct = (n, total) => (total ? (n / total) * 100 : 0);

function openRoad(r) {
  try { localStorage.setItem('controlRoadId', String(r.id)); } catch { /* ignore */ }
  router.push('/control');
}
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h2>Overview</h2>
        <p>Live health of your lights, alarms and automation <span v-if="updatedText" class="upd">· updated {{ updatedText }}</span></p>
      </div>
      <button class="btn secondary" @click="load">Refresh</button>
    </div>

    <div v-if="error" class="alert error">{{ error }}</div>

    <template v-if="summary">
      <!-- headline numbers -->
      <div class="grid stats">
        <div class="stat green" data-kpi="online">
          <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.1V12a10 10 0 11-5.9-9.1M22 4L12 14l-3-3" /></svg></div>
          <div>
            <div class="label">Lights online</div>
            <div class="value">{{ lights.online }} <small>/ {{ lights.total }} · {{ onlinePct }}%</small></div>
          </div>
        </div>
        <div class="stat red" data-kpi="offline">
          <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6m0-6l6 6" /></svg></div>
          <div>
            <div class="label">Lights offline</div>
            <div class="value">{{ lights.offline }}<small v-if="lights.nodata"> · {{ lights.nodata }} no data</small></div>
          </div>
        </div>
        <div class="stat amber" data-kpi="lit">
          <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 2v10m6.4-6.4a9 9 0 11-12.8 0" /></svg></div>
          <div>
            <div class="label">Lit right now</div>
            <div class="value">{{ lights.lit }}</div>
          </div>
        </div>
        <router-link v-if="canSeeAlarms" to="/alarms" class="stat link" :class="alarmCounts.critical ? 'red' : alarmCounts.open ? 'amber' : 'green'" data-kpi="alarms">
          <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" /></svg></div>
          <div>
            <div class="label">Open alarms</div>
            <div class="value">{{ alarmCounts.open }}<small v-if="alarmCounts.unacknowledged"> · {{ alarmCounts.unacknowledged }} new</small></div>
          </div>
        </router-link>
        <div class="stat teal" data-kpi="success">
          <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4" /></svg></div>
          <div>
            <div class="label">Commands OK (24 h)</div>
            <div class="value">{{ summary.activity.successRate == null ? '—' : summary.activity.successRate + '%' }}<small v-if="summary.activity.total"> · {{ summary.activity.total }} sent</small></div>
          </div>
        </div>
      </div>

      <div class="two">
        <!-- road health -->
        <div class="card">
          <div class="card-title"><h2>Road health</h2><router-link v-if="canSeeControl" to="/control" class="btn secondary sm">Open Control</router-link></div>
          <ul v-if="summary.roads.length" class="roads">
            <li v-for="r in summary.roads" :key="r.id">
              <component :is="canSeeControl ? 'button' : 'div'" class="road-row" type="button" @click="canSeeControl && openRoad(r)">
                <span class="r-name">{{ r.name }}</span>
                <span class="r-bar" role="img" :aria-label="`${r.online} online, ${r.offline} offline, ${r.nodata} no data`">
                  <i class="b-on" :style="{ width: pct(r.online, r.total) + '%' }" />
                  <i class="b-off" :style="{ width: pct(r.offline, r.total) + '%' }" />
                  <i class="b-nd" :style="{ width: pct(r.nodata, r.total) + '%' }" />
                </span>
                <span class="r-num"><b>{{ r.online }}</b>/{{ r.total }}<template v-if="r.offline"> · <span class="bad">{{ r.offline }} down</span></template></span>
              </component>
            </li>
          </ul>
          <p v-else class="empty">No roads drawn yet. Design one in Control.</p>
          <div class="legend"><span><i class="d on" /> online</span><span><i class="d off" /> offline</span><span><i class="d nd" /> no data</span></div>
        </div>

        <!-- alarms -->
        <div v-if="canSeeAlarms" class="card">
          <div class="card-title"><h2>Needs attention</h2><router-link to="/alarms" class="btn secondary sm">All alarms</router-link></div>
          <ul v-if="summary.alarms.items.length" class="alarm-list">
            <li v-for="a in summary.alarms.items" :key="a.id" :class="a.severity">
              <span class="sev" />
              <div>
                <div class="a-title">{{ a.title }} <span v-if="a.status === 'active'" class="badge blue">new</span></div>
                <div class="a-sub">{{ ago(a.raised_at) }}<template v-if="a.detail"> · {{ a.detail }}</template></div>
              </div>
            </li>
          </ul>
          <div v-else class="all-clear">
            <span class="ok-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10" /></svg></span>
            <div><b>All clear</b><div class="muted">No lights or transmitters need attention.</div></div>
          </div>
        </div>
      </div>

      <div class="two">
        <!-- chart -->
        <div class="card">
          <div class="card-title"><h2>Commands, last 24 hours</h2><span class="muted small">{{ summary.activity.total }} total<template v-if="summary.activity.failed"> · <span class="bad">{{ summary.activity.failed }} failed</span></template></span></div>
          <svg class="chart" viewBox="0 0 480 150" role="img" aria-label="Commands per hour for the last 24 hours" preserveAspectRatio="none">
            <line x1="0" y1="120" x2="480" y2="120" class="axis" />
            <g v-for="(b, i) in bars" :key="b.key">
              <rect :x="i * 20 + 3" :y="120 - (b.ok / maxBar) * 110" :width="14" :height="(b.ok / maxBar) * 110" rx="2" class="ok">
                <title>{{ barTitle(b) }}</title>
              </rect>
              <rect v-if="b.failed" :x="i * 20 + 3" :y="120 - (b.total / maxBar) * 110" :width="14" :height="(b.failed / maxBar) * 110" rx="2" class="bad-bar">
                <title>{{ barTitle(b) }}</title>
              </rect>
              <text v-if="i % 6 === 0" :x="i * 20 + 10" y="140" class="tick">{{ hourLabel(b.d) }}</text>
            </g>
          </svg>
          <div class="legend"><span><i class="d on" /> accepted</span><span><i class="d off" /> failed</span></div>
        </div>

        <!-- schedules -->
        <div v-if="canSeeSchedules" class="card">
          <div class="card-title"><h2>Coming up</h2><router-link to="/schedules" class="btn secondary sm">Schedules</router-link></div>
          <ul v-if="summary.upcomingSchedules.length" class="up-list">
            <li v-for="s in summary.upcomingSchedules" :key="s.id">
              <div>
                <div class="a-title">{{ s.name }}</div>
                <div class="a-sub">{{ actionLabel[s.action] }} · {{ s.next_run_local }}</div>
              </div>
              <span class="in">in {{ until(s.next_run_at) }}</span>
            </li>
          </ul>
          <p v-else class="empty">Nothing scheduled. Set one up to switch lights automatically.</p>
        </div>
      </div>

      <div class="card">
        <div class="card-title">
          <h2>Recent commands</h2>
          <router-link v-if="auth.can('logs')" to="/logs" class="btn secondary sm">View all logs</router-link>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Time</th><th>Device</th><th>Command</th><th>Parameter</th><th>By</th><th>Status</th></tr></thead>
            <tbody>
              <tr v-for="cmd in summary.recentCommands" :key="cmd.id">
                <td>{{ new Date(cmd.created_at).toLocaleString() }}</td>
                <td><strong>{{ cmd.device_name }}</strong></td>
                <td>{{ cmd.command }}</td>
                <td>{{ cmd.parameter ?? '—' }}</td>
                <td>{{ cmd.user_role === 'Scheduler' ? 'Schedule' : 'Person' }}</td>
                <td><span class="badge" :class="badgeClass(cmd.status)">{{ cmd.status }}</span></td>
              </tr>
              <tr v-if="!summary.recentCommands.length"><td colspan="6" class="empty">No commands issued yet.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.upd { color: var(--text-muted); }
.grid.stats { grid-template-columns: repeat(auto-fit, minmax(175px, 1fr)); }
.stat { padding: 1rem; gap: 0.8rem; }
.stat .icon { width: 44px; height: 44px; }
.value small { font-size: 0.82rem; font-weight: 600; color: var(--text-muted); }
.muted { color: var(--text-muted); }
.small { font-size: 0.85rem; }
.bad { color: var(--red-fg); font-weight: 600; }
.stat.link { text-decoration: none; color: inherit; }
.stat.link:hover { border-color: var(--primary); text-decoration: none; }
.stat.red .value { color: var(--red-fg); }

.two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.1rem; margin-bottom: 0; }
.two > .card { margin-bottom: 1.1rem; }
@media (max-width: 1000px) { .two { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 600px) {
  .grid.stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stat { padding: 0.85rem; gap: 0.55rem; }
  .stat .icon { width: 38px; height: 38px; }
}
.empty { text-align: center; color: var(--text-muted); padding: 1.2rem 0; margin: 0; }

.roads, .alarm-list, .up-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.55rem; }
.road-row { width: 100%; display: grid; grid-template-columns: minmax(70px, 1fr) 2fr auto; align-items: center; gap: 0.8rem; padding: 0.55rem 0.7rem; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-2); color: var(--text); font: inherit; text-align: left; }
button.road-row { cursor: pointer; }
button.road-row:hover { border-color: var(--primary); }
.r-name { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.r-bar { display: flex; height: 10px; border-radius: 999px; overflow: hidden; background: var(--border); }
.r-bar i { display: block; height: 100%; }
.b-on { background: var(--online); }
.b-off { background: var(--offline); }
.b-nd { background: var(--lamp-unknown); }
.r-num { font-size: 0.85rem; color: var(--text-muted); white-space: nowrap; }
.legend { display: flex; gap: 1rem; margin-top: 0.8rem; font-size: 0.8rem; color: var(--text-muted); }
.d { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 0.3rem; }
.d.on { background: var(--online); }
.d.off { background: var(--offline); }
.d.nd { background: var(--lamp-unknown); }

.alarm-list li { display: flex; gap: 0.7rem; align-items: flex-start; padding: 0.6rem 0.7rem; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-2); }
.sev { width: 8px; align-self: stretch; border-radius: 4px; background: var(--amber); flex: none; }
.alarm-list .critical .sev { background: var(--offline); }
.a-title { font-weight: 700; }
.a-sub { font-size: 0.8rem; color: var(--text-muted); }
.all-clear { display: flex; align-items: center; gap: 0.9rem; padding: 1.1rem 0.4rem; }
.ok-ico { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: var(--green-soft); color: var(--green-fg); flex: none; }
.ok-ico svg { width: 24px; height: 24px; }

.up-list li { display: flex; justify-content: space-between; align-items: center; gap: 0.8rem; padding: 0.6rem 0.7rem; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-2); }
.in { font-size: 0.82rem; font-weight: 700; color: var(--primary); white-space: nowrap; }

.chart { width: 100%; height: 170px; display: block; }
.chart .axis { stroke: var(--border); stroke-width: 1; }
.chart .ok { fill: var(--online); opacity: 0.9; }
.chart .bad-bar { fill: var(--offline); }
.chart .tick { fill: var(--text-muted); font-size: 11px; text-anchor: middle; }
</style>
