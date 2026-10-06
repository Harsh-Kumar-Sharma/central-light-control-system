<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { sensorsApi, devicesApi } from '../api/resources.js';
import { useAuthStore } from '../stores/auth.js';
import Modal from '../components/Modal.vue';

const auth = useAuthStore();
const canConfigure = computed(() => auth.can('sensors', 'configure'));

const lights = ref([]);
const metrics = ref({});
const rules = ref([]);
const loading = ref(true);
const error = ref('');
const now = ref(Date.now());

const messageOf = (err, fallback) => err.response?.data?.error?.message ?? fallback;

async function load() {
  try {
    const [l, r] = await Promise.all([sensorsApi.latest(), sensorsApi.rules()]);
    lights.value = l.lights;
    metrics.value = l.metrics;
    rules.value = r;
    error.value = '';
  } catch (err) {
    error.value = messageOf(err, 'Could not load sensors');
  } finally {
    loading.value = false;
  }
}

let timer = null;
let clock = null;
onMounted(() => {
  load();
  timer = setInterval(() => { if (!document.hidden) load(); }, 10000);
  clock = setInterval(() => { now.value = Date.now(); }, 15000);
});
onBeforeUnmount(() => { clearInterval(timer); clearInterval(clock); });

/* ---------- cards ---------- */
const reporting = computed(() => lights.value.filter((l) => l.sensors));
const silent = computed(() => lights.value.filter((l) => !l.sensors));
const ago = (iso) => {
  const s = Math.max(0, Math.round((now.value - new Date(iso).getTime()) / 1000));
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};
const stale = (l) => l.sensors && now.value - new Date(l.sensors.updated_at).getTime() > 5 * 60_000;
const val = (v, d = 1) => (v == null ? '—' : new Intl.NumberFormat(undefined, { maximumFractionDigits: d }).format(v));
// "dark / dim / bright" is a rough guide to the lux number, not a standard.
const brightness = (lux) => (lux == null ? '' : lux < 10 ? 'night' : lux < 1000 ? 'dim' : lux < 10000 ? 'daylight' : 'bright sun');

const TILES = [
  { key: 'ambient_lux', label: 'Ambient light', unit: 'lux', d: 0 },
  { key: 'power_w', label: 'Power', unit: 'W', d: 1 },
  { key: 'voltage_v', label: 'Voltage', unit: 'V', d: 1 },
  { key: 'current_a', label: 'Current', unit: 'A', d: 2 },
  { key: 'temperature_c', label: 'Temperature', unit: '°C', d: 1 },
  { key: 'energy_kwh', label: 'Energy', unit: 'kWh', d: 2 },
];

/* ---------- history chart ---------- */
const chart = reactive({ open: false, light: null, metric: 'power_w', hours: 24, points: [], loading: false, error: '' });
const HOURS = [{ v: 1, l: '1 h' }, { v: 6, l: '6 h' }, { v: 24, l: '24 h' }, { v: 168, l: '7 d' }];
async function openChart(light, metric) {
  Object.assign(chart, { open: true, light, metric: metric ?? chart.metric, error: '' });
  await loadChart();
}
async function loadChart() {
  chart.loading = true;
  try {
    const d = await sensorsApi.history({ receiverId: chart.light.id, metric: chart.metric, hours: chart.hours });
    chart.points = d.points;
    chart.error = '';
  } catch (err) {
    chart.error = messageOf(err, 'Could not load the history');
    chart.points = [];
  } finally {
    chart.loading = false;
  }
}
watch(() => [chart.metric, chart.hours], () => { if (chart.open) loadChart(); });

const W = 640;
const H = 220;
const PAD = { l: 46, r: 12, t: 12, b: 26 };
const scale = computed(() => {
  const pts = chart.points;
  if (pts.length < 1) return null;
  const t0 = new Date(pts[0].at).getTime();
  const t1 = Math.max(new Date(pts[pts.length - 1].at).getTime(), t0 + 1);
  let lo = Math.min(...pts.map((p) => p.v));
  let hi = Math.max(...pts.map((p) => p.v));
  if (hi === lo) { hi += 1; lo -= 1; }
  const padv = (hi - lo) * 0.1;
  lo -= padv; hi += padv;
  const x = (t) => PAD.l + ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  return { t0, t1, lo, hi, x, y };
});
const linePath = computed(() => {
  const s = scale.value;
  if (!s) return '';
  return chart.points.map((p, i) => `${i ? 'L' : 'M'}${s.x(new Date(p.at).getTime()).toFixed(1)},${s.y(p.v).toFixed(1)}`).join('');
});
const yTicks = computed(() => {
  const s = scale.value;
  return s ? [0, 0.5, 1].map((f) => { const v = s.lo + (s.hi - s.lo) * f; return { y: s.y(v), label: val(v, s.hi - s.lo < 10 ? 2 : 0) }; }) : [];
});
const xTicks = computed(() => {
  const s = scale.value;
  if (!s) return [];
  const span = s.t1 - s.t0;
  const fmt = (t) => (span > 36 * 3600_000 ? new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' }) : new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  return [0, 0.5, 1].map((f) => { const t = s.t0 + span * f; return { x: s.x(t), label: fmt(t), anchor: f === 0 ? 'start' : f === 1 ? 'end' : 'middle' }; });
});
const lastPoint = computed(() => chart.points[chart.points.length - 1] ?? null);
const unitOf = (key) => metrics.value[key]?.unit ?? '';

/* ---------- alarm rules ---------- */
const METRIC_CHOICES = [
  { v: 'temperature_c', l: 'Temperature (°C)' },
  { v: 'power_w', l: 'Power (W)' },
  { v: 'voltage_v', l: 'Voltage (V)' },
  { v: 'current_a', l: 'Current (A)' },
  { v: 'ambient_lux', l: 'Ambient light (lux)' },
];
const blank = () => ({ id: null, name: '', kind: 'threshold', metric: 'temperature_c', op: 'gt', value: '', severity: 'warning', receiver_id: '' });
const form = reactive({ open: false, saving: false, error: '', ...blank() });
const devices = ref([]);
async function openForm(rule) {
  if (!devices.value.length) devices.value = await devicesApi.list().catch(() => []);
  Object.assign(form, blank(), rule ? { id: rule.id, name: rule.name, kind: rule.kind, metric: rule.metric ?? 'temperature_c', op: rule.op ?? 'gt', value: rule.value ?? '', severity: rule.severity, receiver_id: rule.receiver_id ?? '' } : {}, { open: true, saving: false, error: '' });
}
async function saveRule() {
  form.saving = true;
  form.error = '';
  const payload = {
    name: form.name, kind: form.kind, severity: form.severity,
    metric: form.kind === 'threshold' ? form.metric : null,
    op: form.kind === 'threshold' ? form.op : null,
    value: form.value === '' ? null : Number(form.value),
    receiver_id: form.receiver_id === '' ? null : Number(form.receiver_id),
  };
  try {
    if (form.id) await sensorsApi.updateRule(form.id, payload); else await sensorsApi.createRule(payload);
    form.open = false;
    await load();
  } catch (err) {
    form.error = messageOf(err, 'Could not save the rule');
  } finally {
    form.saving = false;
  }
}
async function toggleRule(r) {
  try { await sensorsApi.updateRule(r.id, { enabled: !r.enabled }); await load(); } catch (err) { error.value = messageOf(err, 'Could not update the rule'); }
}
const del = reactive({ open: false, rule: null, busy: false });
async function confirmDelete() {
  del.busy = true;
  try { await sensorsApi.removeRule(del.rule.id); del.open = false; await load(); } catch (err) { error.value = messageOf(err, 'Could not delete the rule'); }
  del.busy = false;
}
const ruleText = (r) => {
  if (r.kind === 'lamp_failure') return `Light is ON but draws less than ${val(r.value ?? 1, 2)} W`;
  const m = METRIC_CHOICES.find((x) => x.v === r.metric);
  return `${m?.l.replace(/ \(.*\)/, '') ?? r.metric} ${r.op === 'lt' ? 'below' : 'above'} ${val(r.value, 2)} ${unitOf(r.metric)}`;
};
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h2>Sensors</h2>
        <p>Light level, power and other readings sent by the lights, with alarms when something looks wrong.</p>
      </div>
    </div>

    <div v-if="error" class="alert error">{{ error }}</div>
    <div v-if="loading" class="card"><p class="muted">Loading…</p></div>

    <template v-else>
      <div v-if="!reporting.length" class="card empty">
        <h2>No sensor readings yet</h2>
        <p class="muted">
          Readings arrive inside each light's status reply. Make sure the light has a status command (Devices → edit receiver) and that its reply includes values such as
          <code>ambient</code>, <code>voltage</code>, <code>current</code>, <code>power</code>, <code>energy</code>, <code>temperature</code> or <code>motion</code>.
        </p>
        <p class="muted small">Example: <code>{"relay1":true,"brightness":50,"ambient":320,"voltage":231,"power":148}</code></p>
      </div>

      <div v-else class="cards">
        <article v-for="l in reporting" :key="l.id" class="light" :class="{ stale: stale(l) }" :data-light="l.id">
          <header>
            <span class="dot" :class="l.online === true ? 'online' : l.online === false ? 'offline' : 'nodata'" />
            <h3>{{ l.name }}</h3>
            <span v-if="l.lit" class="badge amber">lit</span>
            <span class="upd" :title="new Date(l.sensors.updated_at).toLocaleString()">{{ stale(l) ? 'last reading ' : '' }}{{ ago(l.sensors.updated_at) }}</span>
          </header>
          <div class="tiles">
            <button v-for="t in TILES" :key="t.key" type="button" class="tile" :disabled="l.sensors[t.key] == null" :title="'Show ' + t.label + ' history'" @click="openChart(l, t.key)">
              <span class="t-label">{{ t.label }}</span>
              <span class="t-val">{{ val(l.sensors[t.key], t.d) }}<small v-if="l.sensors[t.key] != null"> {{ t.unit }}</small></span>
              <span v-if="t.key === 'ambient_lux' && l.sensors.ambient_lux != null" class="t-sub">{{ brightness(l.sensors.ambient_lux) }}</span>
            </button>
            <div class="tile static">
              <span class="t-label">Motion</span>
              <span class="t-val" :class="{ hot: l.sensors.motion }">{{ l.sensors.motion == null ? '—' : l.sensors.motion ? 'Detected' : 'None' }}</span>
            </div>
          </div>
          <p v-if="stale(l)" class="warn">No new reading for over 5 minutes.</p>
        </article>
      </div>

      <p v-if="silent.length && reporting.length" class="hint">Not reporting sensors: {{ silent.map((l) => l.name).join(', ') }}.</p>

      <div class="card">
        <div class="card-title">
          <h2>Alarm rules</h2>
          <button v-if="canConfigure" class="btn sm" data-action="new-rule" @click="openForm()">+ New rule</button>
        </div>
        <p class="hint">A rule raises an alarm (on the Alarms page) while its condition holds, and clears it by itself when the reading is back to normal.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Rule</th><th>Condition</th><th>Applies to</th><th>Severity</th><th>On</th><th></th></tr></thead>
            <tbody>
              <tr v-for="r in rules" :key="r.id" :data-rule="r.id">
                <td><strong>{{ r.name }}</strong></td>
                <td>{{ ruleText(r) }}</td>
                <td>{{ r.light_name ?? 'All lights' }}</td>
                <td><span class="badge" :class="r.severity === 'critical' ? 'red' : 'amber'">{{ r.severity }}</span></td>
                <td>
                  <label v-if="canConfigure" class="switch" :title="r.enabled ? 'Switch off' : 'Switch on'">
                    <input type="checkbox" :checked="r.enabled" :aria-label="(r.enabled ? 'Switch off ' : 'Switch on ') + r.name" @change="toggleRule(r)" />
                    <span class="track" />
                  </label>
                  <span v-else>{{ r.enabled ? 'yes' : 'no' }}</span>
                </td>
                <td class="acts">
                  <button v-if="canConfigure" class="btn secondary sm" @click="openForm(r)">Edit</button>
                  <button v-if="canConfigure" class="btn danger sm" @click="del.rule = r; del.open = true">Delete</button>
                </td>
              </tr>
              <tr v-if="!rules.length"><td colspan="6" class="empty-row">No rules yet. Try “Light is ON but draws no power” to catch dead lamps.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- history -->
    <Modal v-if="chart.open" :title="`${chart.light.name} — history`" width="720px" @close="chart.open = false">
      <div class="chart-bar">
        <select v-model="chart.metric" aria-label="Reading">
          <option v-for="t in TILES" :key="t.key" :value="t.key">{{ t.label }} ({{ t.unit }})</option>
        </select>
        <div class="seg" role="group" aria-label="Period">
          <button v-for="h in HOURS" :key="h.v" type="button" :class="{ on: chart.hours === h.v }" @click="chart.hours = h.v">{{ h.l }}</button>
        </div>
      </div>
      <div v-if="chart.error" class="alert error">{{ chart.error }}</div>
      <p v-else-if="chart.loading" class="muted">Loading…</p>
      <p v-else-if="!chart.points.length" class="muted">No readings in this period yet. History is saved about once a minute.</p>
      <template v-else>
        <svg class="chart" :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="`${chart.light.name} ${chart.metric} history`">
          <g v-for="t in yTicks" :key="'y' + t.y">
            <line :x1="PAD.l" :x2="W - PAD.r" :y1="t.y" :y2="t.y" class="grid" />
            <text :x="PAD.l - 6" :y="t.y + 4" class="tick" text-anchor="end">{{ t.label }}</text>
          </g>
          <text v-for="t in xTicks" :key="'x' + t.x" :x="t.x" :y="H - 6" class="tick" :text-anchor="t.anchor">{{ t.label }}</text>
          <path :d="linePath" class="line" />
          <circle v-if="lastPoint" :cx="scale.x(new Date(lastPoint.at).getTime())" :cy="scale.y(lastPoint.v)" r="4" class="dotc" />
        </svg>
        <p class="muted small">Latest {{ val(lastPoint.v, 2) }} {{ unitOf(chart.metric) }} · {{ chart.points.length }} points</p>
      </template>
    </Modal>

    <!-- rule form -->
    <Modal v-if="form.open" :title="form.id ? 'Edit rule' : 'New alarm rule'" width="520px" @close="form.open = false">
      <form id="ruleForm" class="stack" @submit.prevent="saveRule">
        <div v-if="form.error" class="alert error">{{ form.error }}</div>
        <div class="field"><label for="rname">Name *</label><input id="rname" v-model="form.name" maxlength="100" placeholder="e.g. Driver too hot" required /></div>
        <div class="field">
          <label>What to watch</label>
          <div class="seg" role="group" aria-label="Rule kind">
            <button type="button" :class="{ on: form.kind === 'threshold' }" @click="form.kind = 'threshold'">A reading</button>
            <button type="button" :class="{ on: form.kind === 'lamp_failure' }" @click="form.kind = 'lamp_failure'">Dead lamp</button>
          </div>
        </div>
        <template v-if="form.kind === 'threshold'">
          <div class="field">
            <label for="rmetric">Reading</label>
            <select id="rmetric" v-model="form.metric"><option v-for="m in METRIC_CHOICES" :key="m.v" :value="m.v">{{ m.l }}</option></select>
          </div>
          <div class="two">
            <div class="field"><label for="rop">Alarm when it is</label><select id="rop" v-model="form.op"><option value="gt">above</option><option value="lt">below</option></select></div>
            <div class="field"><label for="rval">Value *</label><input id="rval" v-model="form.value" type="number" step="any" required /></div>
          </div>
        </template>
        <div v-else class="field">
          <label for="rmin">Minimum power while ON (watts)</label>
          <input id="rmin" v-model="form.value" type="number" min="0" step="any" placeholder="1" />
          <span class="hint" style="margin:0">Raises an alarm when a light is switched ON but its power reading is below this. Needs the light to report <code>power</code>.</span>
        </div>
        <div class="two">
          <div class="field">
            <label for="rlight">Applies to</label>
            <select id="rlight" v-model="form.receiver_id"><option value="">All lights</option><option v-for="d in devices" :key="d.id" :value="d.id">{{ d.device_name }}</option></select>
          </div>
          <div class="field"><label for="rsev">Severity</label><select id="rsev" v-model="form.severity"><option value="warning">Warning</option><option value="critical">Critical</option></select></div>
        </div>
      </form>
      <template #footer>
        <button class="btn secondary" type="button" @click="form.open = false">Cancel</button>
        <button class="btn" type="submit" form="ruleForm" :disabled="form.saving" data-action="save-rule">{{ form.saving ? 'Saving…' : 'Save rule' }}</button>
      </template>
    </Modal>

    <Modal v-if="del.open" title="Delete this rule?" width="420px" @close="del.open = false">
      <p>Delete <strong>{{ del.rule?.name }}</strong>? Its open alarms are cleared.</p>
      <template #footer>
        <button class="btn secondary" @click="del.open = false">Cancel</button>
        <button class="btn danger" :disabled="del.busy" @click="confirmDelete">{{ del.busy ? 'Deleting…' : 'Delete' }}</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.muted { color: var(--text-muted); }
.small { font-size: 0.85rem; }
code { background: var(--surface-2); border: 1px solid var(--border); border-radius: 5px; padding: 0 0.3rem; font-size: 0.85em; }
.empty { text-align: center; padding: 2.2rem 1.2rem; }
.empty p { max-width: 560px; margin: 0.6rem auto 0; }

.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 1rem; margin-bottom: 1.2rem; }
.light { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 1rem 1.1rem; }
.light header { display: flex; align-items: center; gap: 0.55rem; margin-bottom: 0.8rem; flex-wrap: wrap; }
.light h3 { font-size: 1.02rem; }
.upd { margin-left: auto; font-size: 0.78rem; color: var(--text-muted); }
.light.stale .upd { color: var(--amber-fg); font-weight: 600; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: var(--lamp-unknown); flex: none; }
.dot.online { background: var(--online); }
.dot.offline { background: var(--offline); }
.tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
.tile { display: flex; flex-direction: column; gap: 0.1rem; text-align: left; padding: 0.55rem 0.65rem; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-2); color: var(--text); font: inherit; cursor: pointer; }
.tile:not(.static):not(:disabled):hover { border-color: var(--primary); }
.tile:disabled { opacity: 0.55; cursor: default; }
.tile.static { cursor: default; }
.t-label { font-size: 0.7rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em; }
.t-val { font-size: 1.2rem; font-weight: 800; line-height: 1.2; }
.t-val small { font-size: 0.7rem; font-weight: 600; color: var(--text-muted); }
.t-val.hot { color: var(--amber-fg); }
.t-sub { font-size: 0.72rem; color: var(--text-muted); }
.warn { margin: 0.7rem 0 0; font-size: 0.82rem; color: var(--amber-fg); font-weight: 600; }
.hint { margin: 0 0 1rem; }
.acts { display: flex; gap: 0.4rem; }
.empty-row { text-align: center; color: var(--text-muted); padding: 1.2rem; }

.switch { position: relative; display: inline-block; width: 42px; height: 24px; cursor: pointer; }
.switch input { position: absolute; opacity: 0; inset: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; z-index: 1; }
.switch .track { position: absolute; inset: 0; border-radius: 999px; background: var(--border); transition: background 0.15s; }
.switch .track::after { content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: var(--surface); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35); transition: transform 0.15s; }
.switch input:checked + .track { background: var(--primary); }
.switch input:checked + .track::after { transform: translateX(18px); background: var(--on-primary); }
.switch input:focus-visible + .track { outline: 2px solid var(--primary); outline-offset: 2px; }

.stack { display: flex; flex-direction: column; gap: 0.9rem; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
@media (max-width: 520px) { .two { grid-template-columns: 1fr; } .tiles { grid-template-columns: repeat(2, 1fr); } }
.seg { display: flex; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.seg button { flex: 1; border: 0; border-right: 1px solid var(--border); background: var(--surface-2); color: var(--text-muted); font: inherit; font-weight: 600; padding: 0.45rem 0.6rem; cursor: pointer; }
.seg button:last-child { border-right: 0; }
.seg button.on { background: var(--primary); color: var(--on-primary); }

.chart-bar { display: flex; gap: 0.7rem; flex-wrap: wrap; align-items: center; margin-bottom: 0.8rem; }
.chart-bar .seg { min-width: 220px; }
.chart { width: 100%; height: auto; display: block; }
.chart .grid { stroke: var(--border); stroke-width: 1; }
.chart .tick { fill: var(--text-muted); font-size: 11px; }
.chart .line { fill: none; stroke: var(--primary); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.chart .dotc { fill: var(--primary); stroke: var(--surface); stroke-width: 2; }
</style>
