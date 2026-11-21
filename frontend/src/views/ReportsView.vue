<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { reportsApi } from '../api/resources.js';
import { useAuthStore } from '../stores/auth.js';
import Modal from '../components/Modal.vue';

const auth = useAuthStore();
const canExport = computed(() => auth.can('reports', 'export'));
const canConfigure = computed(() => auth.can('reports', 'configure'));

const data = ref(null);
const loading = ref(true);
const error = ref('');
const notice = ref('');

/* ---------- period ---------- */
const ymd = (d) => d.toLocaleDateString('en-CA'); // the user's own calendar; the server reads them in the site time zone
const today = () => new Date();
const shift = (n) => { const d = today(); d.setDate(d.getDate() + n); return ymd(d); };
const PRESETS = [
  { id: 'today', label: 'Today', from: () => ymd(today()), to: () => ymd(today()) },
  { id: '7', label: 'Last 7 days', from: () => shift(-6), to: () => ymd(today()) },
  { id: '30', label: 'Last 30 days', from: () => shift(-29), to: () => ymd(today()) },
  { id: 'custom', label: 'Custom' },
];
const preset = ref('7');
const from = ref(shift(-6));
const to = ref(ymd(today()));
const roadId = ref('');

function pick(id) {
  preset.value = id;
  const p = PRESETS.find((x) => x.id === id);
  if (p.from) { from.value = p.from(); to.value = p.to(); }
}

async function load() {
  loading.value = true;
  try {
    data.value = await reportsApi.overview({ from: from.value, to: to.value, roadId: roadId.value || undefined });
    error.value = '';
  } catch (err) {
    error.value = err.response?.data?.error?.message ?? 'Could not load the report';
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch([from, to, roadId], () => { if (from.value && to.value && from.value <= to.value) load(); });

/* ---------- formatting ---------- */
const cur = computed(() => data.value?.settings.currency ?? 'INR');
const money = (n) => (n == null ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency: cur.value, maximumFractionDigits: 2 }).format(n));
const num = (n, d = 1) => (n == null ? '—' : new Intl.NumberFormat(undefined, { maximumFractionDigits: d }).format(n));
const pctText = (n) => (n == null ? '—' : `${num(n, 1)}%`);
const dayLabel = (s) => new Date(`${s}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const upClass = (n) => (n == null ? 'gray' : n >= 99 ? 'green' : n >= 90 ? 'amber' : 'red');

const t = computed(() => data.value?.totals);
const maxKwh = computed(() => Math.max(0.1, ...(data.value?.daily ?? []).map((d) => d.kwh)));
const hasEnergy = computed(() => (t.value?.rated ?? 0) > 0);
const noHistory = computed(() => data.value && data.value.lights.length > 0 && t.value.uptime == null && t.value.lit_hours === 0);
const sorted = computed(() => [...(data.value?.lights ?? [])].sort((a, b) => (b.kwh ?? -1) - (a.kwh ?? -1)));

/* ---------- export / print ---------- */
const exporting = ref('');
async function exportCsv(kind) {
  exporting.value = kind;
  error.value = '';
  try {
    await reportsApi.download(kind, { from: from.value, to: to.value, roadId: roadId.value || undefined });
  } catch (err) {
    error.value = 'Could not download the file';
    if (err.response?.data instanceof Blob) {
      try { error.value = JSON.parse(await err.response.data.text()).error?.message ?? error.value; } catch { /* keep generic */ }
    }
  } finally {
    exporting.value = '';
  }
}
const printPage = () => window.print();

/* ---------- tariff ---------- */
const tariff = reactive({ open: false, value: '', currency: 'INR', saving: false, error: '' });
function openTariff() {
  Object.assign(tariff, { open: true, value: data.value.settings.tariff ?? '', currency: data.value.settings.currency, saving: false, error: '' });
}
async function saveTariff() {
  tariff.saving = true;
  tariff.error = '';
  try {
    await reportsApi.updateSettings({ tariff: tariff.value === '' ? null : Number(tariff.value), currency: tariff.currency });
    tariff.open = false;
    notice.value = 'Price saved.';
    await load();
  } catch (err) {
    tariff.error = err.response?.data?.error?.message ?? 'Could not save';
  } finally {
    tariff.saving = false;
  }
}
</script>

<template>
  <div class="report">
    <div class="page-header">
      <div>
        <h2>Reports</h2>
        <p>Uptime, hours lit, estimated energy and cost, commands and alarms.</p>
      </div>
      <div class="head-actions no-print">
        <button v-if="canConfigure && data" class="btn secondary" data-action="tariff" @click="openTariff">Electricity price</button>
        <button class="btn secondary" data-action="print" @click="printPage">Print / Save as PDF</button>
      </div>
    </div>

    <div class="filters card no-print">
      <div class="seg" role="group" aria-label="Period">
        <button v-for="p in PRESETS" :key="p.id" type="button" :class="{ on: preset === p.id }" :aria-pressed="preset === p.id" @click="pick(p.id)">{{ p.label }}</button>
      </div>
      <div v-if="preset === 'custom'" class="dates">
        <input v-model="from" type="date" :max="to" aria-label="From" />
        <span class="muted">to</span>
        <input v-model="to" type="date" :min="from" aria-label="To" />
      </div>
      <select v-if="data" v-model="roadId" aria-label="Road">
        <option value="">All roads</option>
        <option v-for="r in data.roads" :key="r.id" :value="r.id">{{ r.name }}</option>
      </select>
    </div>

    <div v-if="error" class="alert error">{{ error }}</div>
    <div v-if="notice" class="alert success no-print">{{ notice }}</div>
    <p v-if="data" class="period-line">{{ data.range.from }} → {{ data.range.to }} <span class="muted">· {{ data.range.timezone }}<template v-if="roadId"> · {{ data.roads.find((r) => String(r.id) === String(roadId))?.name }}</template></span></p>

    <div v-if="loading && !data" class="card"><p class="muted">Loading…</p></div>

    <template v-if="data">
      <div class="alert info estimate">
        <b>Energy is an estimate, not a meter reading.</b>
        It is each relay's rated watts × the time it was on (scaled by brightness). Enter the watts on each light in Devices → edit receiver.
        <template v-if="t.history_gap_hours > 0"> Hours before a light's first recorded state are left out ({{ num(t.history_gap_hours, 0) }} h in this period).</template>
      </div>
      <div v-if="noHistory" class="alert warn">No light history has been recorded in this period yet. It starts building from the moment this feature was switched on, so earlier dates stay empty.</div>

      <div class="grid stats">
        <div class="stat green" data-kpi="uptime"><div class="body"><div class="label">Average uptime</div><div class="value">{{ pctText(t.uptime) }}</div></div></div>
        <div class="stat amber" data-kpi="hours"><div class="body"><div class="label">Hours lit (all lights)</div><div class="value">{{ num(t.lit_hours) }} <small>h</small></div></div></div>
        <div class="stat primary" data-kpi="energy"><div class="body"><div class="label">Estimated energy</div><div class="value">{{ hasEnergy ? num(t.kwh, 2) : '—' }} <small>kWh</small></div></div></div>
        <div class="stat teal" data-kpi="cost"><div class="body"><div class="label">Estimated cost</div><div class="value">{{ money(t.cost) }}</div></div></div>
        <div class="stat green" data-kpi="saved"><div class="body"><div class="label">Saved by dimming</div><div class="value">{{ hasEnergy ? num(t.saved_kwh, 2) : '—' }} <small>kWh</small></div><div v-if="t.saved_cost != null" class="sub">{{ money(t.saved_cost) }}</div></div></div>
      </div>
      <p v-if="t.unrated" class="hint">{{ t.unrated }} of {{ t.lights }} light{{ t.lights === 1 ? '' : 's' }} {{ t.unrated === 1 ? 'has' : 'have' }} no wattage entered and {{ t.unrated === 1 ? 'is' : 'are' }} left out of the energy totals.</p>
      <p v-if="hasEnergy && t.cost == null" class="hint no-print">Set the electricity price (top right) to see cost.</p>

      <div class="card">
        <div class="card-title"><h2>Energy per day</h2><span class="muted small">estimated kWh</span></div>
        <div v-if="data.daily.length" class="days" role="img" :aria-label="'Estimated energy per day, ' + data.daily.length + ' days'">
          <div v-for="d in data.daily" :key="d.date" class="day" :title="`${dayLabel(d.date)}: ${num(d.kwh, 2)} kWh, ${num(d.lit_hours)} h lit`">
            <span class="d-val">{{ hasEnergy ? num(d.kwh, 1) : '' }}</span>
            <span class="d-bar"><i :class="{ some: hasEnergy && d.kwh > 0 }" :style="{ height: (hasEnergy ? (d.kwh / maxKwh) * 100 : 0) + '%' }" /></span>
            <span class="d-lbl">{{ dayLabel(d.date) }}</span>
          </div>
        </div>
        <p v-else class="empty">No days in this range yet.</p>
      </div>

      <div class="card">
        <div class="card-title">
          <h2>Lights</h2>
          <button v-if="canExport" class="btn secondary sm no-print" :disabled="exporting === 'lights'" data-action="csv-lights" @click="exportCsv('lights')">{{ exporting === 'lights' ? 'Preparing…' : 'Download CSV' }}</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Light</th><th>Road</th><th>Uptime</th><th>Hours lit</th><th>Rated load</th><th>Energy (kWh)</th><th>Cost</th></tr></thead>
            <tbody>
              <tr v-for="l in sorted" :key="l.id">
                <td><strong>{{ l.name }}</strong> <span class="muted">· addr {{ l.address }}</span></td>
                <td>{{ l.roads.join(', ') || '—' }}</td>
                <td><span class="badge" :class="upClass(l.uptime)">{{ pctText(l.uptime) }}</span></td>
                <td>{{ num(l.lit_hours) }}</td>
                <td>{{ l.rated ? `${(l.relay1_watts ?? 0) + (l.relay2_watts ?? 0)} W` : '—' }}</td>
                <td>{{ l.kwh == null ? 'no wattage' : num(l.kwh, 2) }}</td>
                <td>{{ money(l.cost) }}</td>
              </tr>
              <tr v-if="!sorted.length"><td colspan="7" class="empty">No lights.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="two">
        <div class="card">
          <div class="card-title">
            <h2>Commands</h2>
            <button v-if="canExport" class="btn secondary sm no-print" :disabled="exporting === 'commands'" data-action="csv-commands" @click="exportCsv('commands')">{{ exporting === 'commands' ? 'Preparing…' : 'Download CSV' }}</button>
          </div>
          <dl class="facts">
            <div><dt>Sent</dt><dd>{{ data.commands.total }}</dd></div>
            <div><dt>Failed</dt><dd :class="{ bad: data.commands.failed }">{{ data.commands.failed }}</dd></div>
            <div><dt>By people</dt><dd>{{ data.commands.by_person }}</dd></div>
            <div><dt>By schedules</dt><dd>{{ data.commands.by_schedule }}</dd></div>
          </dl>
        </div>
        <div class="card">
          <div class="card-title">
            <h2>Alarms</h2>
            <button v-if="canExport" class="btn secondary sm no-print" :disabled="exporting === 'alarms'" data-action="csv-alarms" @click="exportCsv('alarms')">{{ exporting === 'alarms' ? 'Preparing…' : 'Download CSV' }}</button>
          </div>
          <dl class="facts">
            <div><dt>Raised</dt><dd>{{ data.alarms.raised }}</dd></div>
            <div><dt>Critical</dt><dd :class="{ bad: data.alarms.critical }">{{ data.alarms.critical }}</dd></div>
            <div><dt>Resolved</dt><dd>{{ data.alarms.resolved }}</dd></div>
            <div><dt>Avg. time to resolve</dt><dd>{{ data.alarms.avg_resolve_minutes == null ? '—' : data.alarms.avg_resolve_minutes + ' min' }}</dd></div>
          </dl>
        </div>
      </div>
    </template>

    <Modal v-if="tariff.open" title="Electricity price" width="420px" @close="tariff.open = false">
      <form id="tariffForm" class="stack" @submit.prevent="saveTariff">
        <div v-if="tariff.error" class="alert error">{{ tariff.error }}</div>
        <div class="two-f">
          <div class="field"><label for="tprice">Price per kWh</label><input id="tprice" v-model="tariff.value" type="number" min="0" step="0.01" placeholder="e.g. 8.50" /></div>
          <div class="field"><label for="tcur">Currency code</label><input id="tcur" v-model="tariff.currency" maxlength="8" placeholder="INR" /></div>
        </div>
        <p class="hint">Used for the cost and savings figures. Leave the price empty to hide cost.</p>
      </form>
      <template #footer>
        <button class="btn secondary" type="button" @click="tariff.open = false">Cancel</button>
        <button class="btn" type="submit" form="tariffForm" :disabled="tariff.saving">{{ tariff.saving ? 'Saving…' : 'Save' }}</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.muted { color: var(--text-muted); }
.small { font-size: 0.85rem; }
.bad { color: var(--red-fg); }
.head-actions { display: flex; gap: 0.6rem; flex-wrap: wrap; }
.filters { display: flex; align-items: center; gap: 0.9rem; flex-wrap: wrap; padding: 0.8rem 1rem; }
.seg { display: flex; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.seg button { border: 0; border-right: 1px solid var(--border); background: var(--surface-2); color: var(--text-muted); font: inherit; font-weight: 600; padding: 0.45rem 0.9rem; cursor: pointer; }
.seg button:last-child { border-right: 0; }
.seg button.on { background: var(--primary); color: var(--on-primary); }
.seg button { white-space: nowrap; }
@media (max-width: 600px) {
  .filters { gap: 0.6rem; }
  .filters .seg, .filters > select, .dates { flex: 1 1 100%; }
  .seg button { flex: 1 1 0; padding-inline: 0.4rem; }
  .dates { display: flex; align-items: center; gap: 0.5rem; }
  .dates input { flex: 1 1 0; min-width: 0; }
  .head-actions { width: 100%; }
  .head-actions .btn { flex: 1 1 auto; }
}
.dates { display: flex; align-items: center; gap: 0.5rem; }
.period-line { margin: 0 0 0.8rem; font-weight: 700; }
.estimate { line-height: 1.5; }

.grid.stats { grid-template-columns: repeat(auto-fit, minmax(165px, 1fr)); }
.stat { padding: 1rem; }
.value small { font-size: 0.82rem; font-weight: 600; color: var(--text-muted); }
.sub { font-size: 0.8rem; color: var(--text-muted); }
.hint { margin: -0.4rem 0 1rem; }

.days { display: flex; align-items: flex-end; gap: 6px; height: 190px; overflow-x: auto; padding-bottom: 2px; }
.day { flex: 1 0 34px; max-width: 80px; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px; }
.d-val { font-size: 0.72rem; color: var(--text-muted); height: 14px; }
.d-bar { width: 100%; flex: 1; display: flex; align-items: flex-end; background: var(--surface-2); border-radius: 6px 6px 0 0; overflow: hidden; }
.d-bar i { display: block; width: 100%; background: var(--primary); border-radius: 6px 6px 0 0; }
.d-bar i.some { min-height: 3px; }
.d-lbl { font-size: 0.7rem; color: var(--text-muted); white-space: nowrap; }
.empty { text-align: center; color: var(--text-muted); padding: 1.2rem 0; margin: 0; }

.two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.1rem; }
@media (max-width: 900px) { .two { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 600px) {
  .grid.stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stat { padding: 0.85rem; gap: 0.55rem; }
  .stat .icon { width: 38px; height: 38px; }
}
.facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.8rem; margin: 0; }
.facts dt { font-size: 0.8rem; color: var(--text-muted); font-weight: 600; }
.facts dd { margin: 0; font-size: 1.5rem; font-weight: 800; }
.stack { display: flex; flex-direction: column; gap: 0.9rem; }
.two-f { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 0.7rem; }

@media print {
  .no-print { display: none !important; }
  .report .card, .report .stat { box-shadow: none; break-inside: avoid; }
}
</style>
