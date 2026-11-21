<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { tunnelsApi, devicesApi } from '../api/resources.js';
import { useAuthStore } from '../stores/auth.js';
import Modal from '../components/Modal.vue';

const auth = useAuthStore();
const canCreate = computed(() => auth.can('tunnels', 'create'));
const canEdit = computed(() => auth.can('tunnels', 'edit'));
const canDelete = computed(() => auth.can('tunnels', 'delete'));
const canControl = computed(() => auth.can('tunnels', 'control'));

const tunnels = ref([]);
const loading = ref(true);
const error = ref('');
const notice = ref('');
const now = ref(Date.now());

const MODES = [
  { id: 'day', label: 'Day', hint: 'brightest at the entrance' },
  { id: 'evening', label: 'Evening', hint: 'dusk / dawn' },
  { id: 'night', label: 'Night', hint: 'lowest levels' },
  { id: 'off', label: 'Off', hint: 'all lights off' },
];
const modeLabel = (id) => MODES.find((m) => m.id === id)?.label ?? id;
const KINDS = [
  { id: 'threshold', label: 'Entrance (threshold)', levels: [99, 70, 50] },
  { id: 'transition', label: 'Transition', levels: [80, 60, 40] },
  { id: 'interior', label: 'Interior', levels: [60, 45, 30] },
  { id: 'exit', label: 'Exit', levels: [70, 50, 35] },
  { id: 'custom', label: 'Other', levels: [99, 70, 50] },
];
const kindLabel = (id) => KINDS.find((k) => k.id === id)?.label ?? id;

const messageOf = (err, fallback) => err.response?.data?.error?.message ?? fallback;

/* ---------- loading + polling (fast while a mode change runs) ---------- */
const wasRunning = new Map(); // tunnelId -> mode, to announce when a change finishes
async function load() {
  try {
    const list = await tunnelsApi.list();
    for (const t of list) {
      if (t.job) wasRunning.set(t.id, t.job.mode);
      else if (wasRunning.has(t.id)) {
        const mode = wasRunning.get(t.id);
        wasRunning.delete(t.id);
        notice.value = t.last_failed
          ? `${t.name}: ${modeLabel(mode)} mode applied to ${t.last_ok} lights; ${t.last_failed} did not reply (see Alarms).`
          : `${t.name}: ${modeLabel(mode)} mode applied to ${t.last_ok} lights.`;
      }
    }
    tunnels.value = list;
    error.value = '';
  } catch (err) {
    error.value = messageOf(err, 'Could not load tunnels');
  } finally {
    loading.value = false;
  }
}
let timer = null;
let clock = null;
let alive = true;
function schedule() {
  if (!alive) return;
  timer = setTimeout(async () => { if (!document.hidden) await load(); schedule(); }, tunnels.value.some((t) => t.job) ? 1500 : 10000);
}
onMounted(() => { load().then(schedule); clock = setInterval(() => { now.value = Date.now(); }, 30000); });
onBeforeUnmount(() => { alive = false; clearTimeout(timer); clearInterval(clock); });

const ago = (iso) => {
  const s = Math.max(0, Math.round((now.value - new Date(iso).getTime()) / 1000));
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};
const levelOf = (zone, mode) => (!mode ? null : mode === 'off' ? 0 : zone[`${mode}_brightness`]);
const lightCount = (t) => t.zones.reduce((n, z) => n + z.lights.length, 0);
const zoneHealth = (z) => ({ total: z.lights.length, online: z.lights.filter((l) => l.online === true).length, offline: z.lights.filter((l) => l.online === false).length });

/* ---------- switch mode ---------- */
const confirmMode = reactive({ open: false, tunnel: null, mode: null, busy: false });
function askMode(t, mode) { Object.assign(confirmMode, { open: true, tunnel: t, mode, busy: false }); }
async function runMode() {
  confirmMode.busy = true;
  error.value = '';
  notice.value = '';
  try {
    await tunnelsApi.setMode(confirmMode.tunnel.id, confirmMode.mode);
    confirmMode.open = false;
    await load();
  } catch (err) {
    confirmMode.open = false;
    error.value = messageOf(err, 'Could not start the mode change');
  } finally {
    confirmMode.busy = false;
  }
}
const preview = (t, mode) => t.zones.map((z) => `${z.name} ${mode === 'off' ? 'off' : levelOf(z, mode) + '%'}`).join(' · ');

/* ---------- create / edit ---------- */
const create = reactive({ open: false, name: '', description: '', length: '', busy: false, error: '' });
function openCreate() { Object.assign(create, { open: true, name: '', description: '', length: '', busy: false, error: '' }); }
async function saveCreate() {
  create.busy = true;
  create.error = '';
  try {
    const { id } = await tunnelsApi.create({ name: create.name, description: create.description, length_m: create.length });
    create.open = false;
    await load();
    const t = tunnels.value.find((x) => x.id === id);
    if (t && canEdit.value) openEditor(t);
  } catch (err) {
    create.error = messageOf(err, 'Could not create the tunnel');
  } finally {
    create.busy = false;
  }
}

const ed = reactive({ open: false, id: null, name: '', description: '', length: '', zones: [], saving: false, error: '' });
const devices = ref([]);
let zoneKey = 0;
const newZone = (over = {}) => ({ key: ++zoneKey, name: '', kind: 'custom', day: 99, evening: 70, night: 50, receiverIds: [], ...over });
async function openEditor(t) {
  if (!devices.value.length) devices.value = await devicesApi.list().catch(() => []);
  Object.assign(ed, {
    open: true, id: t.id, name: t.name, description: t.description ?? '', length: t.length_m ?? '', saving: false, error: '',
    zones: t.zones.map((z) => newZone({ name: z.name, kind: z.kind, day: z.day_brightness, evening: z.evening_brightness, night: z.night_brightness, receiverIds: z.lights.map((l) => l.receiverId) })),
  });
}
function addZone() { ed.zones.push(newZone({ name: `Zone ${ed.zones.length + 1}` })); }
function starter() {
  ed.zones = [
    ['Entrance', 'threshold'], ['Transition', 'transition'], ['Interior', 'interior'], ['Exit', 'exit'],
  ].map(([name, kind]) => { const k = KINDS.find((x) => x.id === kind); return newZone({ name, kind, day: k.levels[0], evening: k.levels[1], night: k.levels[2] }); });
}
function onKind(z) {
  const k = KINDS.find((x) => x.id === z.kind);
  [z.day, z.evening, z.night] = k.levels;
  if (!z.name.trim() || /^Zone \d+$/.test(z.name)) z.name = k.id === 'custom' ? z.name : k.label.replace(/ \(.*\)/, '');
}
function move(i, d) {
  const j = i + d;
  if (j < 0 || j >= ed.zones.length) return;
  [ed.zones[i], ed.zones[j]] = [ed.zones[j], ed.zones[i]];
}
const usedElsewhere = (zone, id) => ed.zones.find((z) => z !== zone && z.receiverIds.includes(id));
function toggleLight(zone, id) {
  const i = zone.receiverIds.indexOf(id);
  if (i >= 0) zone.receiverIds.splice(i, 1); else zone.receiverIds.push(id);
}
async function saveEditor() {
  ed.saving = true;
  ed.error = '';
  try {
    await tunnelsApi.update(ed.id, { name: ed.name, description: ed.description, length_m: ed.length });
    await tunnelsApi.setZones(ed.id, ed.zones.map((z) => ({
      name: z.name, kind: z.kind, day_brightness: Number(z.day), evening_brightness: Number(z.evening), night_brightness: Number(z.night), receiverIds: z.receiverIds,
    })));
    ed.open = false;
    notice.value = 'Tunnel saved. Switch a mode to apply the new levels.';
    await load();
  } catch (err) {
    ed.error = messageOf(err, 'Could not save the tunnel');
  } finally {
    ed.saving = false;
  }
}

const del = reactive({ open: false, tunnel: null, busy: false, error: '' });
async function confirmDelete() {
  del.busy = true;
  del.error = '';
  try { await tunnelsApi.remove(del.tunnel.id); del.open = false; await load(); } catch (err) { del.error = messageOf(err, 'Could not delete the tunnel'); }
  del.busy = false;
}
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h2>Tunnels</h2>
        <p>Group a tunnel's lights into zones and switch the whole tunnel between Day, Evening, Night and Off.</p>
      </div>
      <button v-if="canCreate" class="btn" data-action="new-tunnel" @click="openCreate">+ New tunnel</button>
    </div>

    <div v-if="error" class="alert error">{{ error }}</div>
    <div v-if="notice" class="alert success">{{ notice }}</div>

    <div v-if="loading" class="card"><p class="muted">Loading…</p></div>

    <div v-else-if="!tunnels.length" class="card empty">
      <h2>No tunnels yet</h2>
      <p class="muted">A tunnel is lit in zones: bright at the entrance by day so eyes can adjust, then gentler towards the middle. Create one, split it into zones, and give each zone its own level for day, evening and night.</p>
      <button v-if="canCreate" class="btn" @click="openCreate">+ Create your first tunnel</button>
    </div>

    <div v-else class="list">
      <article v-for="t in tunnels" :key="t.id" class="tunnel" :data-tunnel="t.id">
        <header>
          <div class="title">
            <h3>{{ t.name }}</h3>
            <span v-if="t.length_m" class="pill">{{ t.length_m }} m</span>
            <span class="pill">{{ lightCount(t) }} light{{ lightCount(t) === 1 ? '' : 's' }}</span>
            <span v-if="t.current_mode" class="badge" :class="t.current_mode === 'off' ? 'gray' : 'blue'">{{ modeLabel(t.current_mode) }} mode</span>
            <span v-else class="muted small">no mode applied yet</span>
            <span v-if="t.applied_at" class="muted small">· {{ ago(t.applied_at) }}<template v-if="t.last_failed"> · <b class="bad">{{ t.last_failed }} no reply</b></template></span>
          </div>
          <div class="tools">
            <button v-if="canEdit" class="btn secondary sm" data-action="edit-tunnel" @click="openEditor(t)">Edit zones</button>
            <button v-if="canDelete" class="btn danger sm" @click="del.tunnel = t; del.error = ''; del.open = true">Delete</button>
          </div>
        </header>
        <p v-if="t.description" class="desc">{{ t.description }}</p>

        <div v-if="t.zones.length" class="strip" aria-label="Tunnel zones from entrance to exit">
          <div v-for="(z, i) in t.zones" :key="z.id" class="zone">
            <div class="z-head"><b>{{ z.name }}</b><span class="kind">{{ kindLabel(z.kind).replace(/ \(.*\)/, '') }}</span></div>
            <div class="meter" role="img" :aria-label="t.current_mode ? `${levelOf(z, t.current_mode)} percent` : 'no mode applied'">
              <i :style="{ height: (levelOf(z, t.current_mode) ?? 0) + '%' }" :class="{ off: t.current_mode === 'off' }" />
              <span class="m-val">{{ t.current_mode == null ? '—' : t.current_mode === 'off' ? 'off' : levelOf(z, t.current_mode) + '%' }}</span>
            </div>
            <div class="z-foot">
              <span>{{ zoneHealth(z).total }} light{{ zoneHealth(z).total === 1 ? '' : 's' }}</span>
              <span v-if="zoneHealth(z).offline" class="bad">{{ zoneHealth(z).offline }} offline</span>
              <span v-else-if="zoneHealth(z).total && zoneHealth(z).online === zoneHealth(z).total" class="good">all online</span>
            </div>
            <span v-if="i < t.zones.length - 1" class="arrow" aria-hidden="true">›</span>
          </div>
        </div>
        <p v-else class="muted no-zones">No zones yet. <button v-if="canEdit" class="linklike" @click="openEditor(t)">Add zones</button></p>
        <div v-if="t.zones.length" class="ends"><span>Entrance</span><span>Exit</span></div>

        <div v-if="t.job" class="job" role="status">
          <div class="progress"><div class="bar-fill" :style="{ width: (t.job.total ? (t.job.done / t.job.total) * 100 : 0) + '%' }" /></div>
          <span>Applying {{ modeLabel(t.job.mode) }} mode… {{ t.job.done }} of {{ t.job.total || '…' }} lights</span>
        </div>

        <div v-if="canControl && t.zones.length" class="modes" role="group" aria-label="Switch mode">
          <button v-for="m in MODES" :key="m.id" type="button" class="mode" :class="{ on: t.current_mode === m.id }" :disabled="!!t.job" :data-mode="m.id" :title="m.hint" @click="askMode(t, m.id)">{{ m.label }}</button>
        </div>
      </article>
    </div>

    <!-- confirm a mode change -->
    <Modal v-if="confirmMode.open" :title="`Switch ${confirmMode.tunnel.name} to ${modeLabel(confirmMode.mode)}?`" width="480px" @close="!confirmMode.busy && (confirmMode.open = false)">
      <p>This sends commands to <strong>{{ lightCount(confirmMode.tunnel) }}</strong> light{{ lightCount(confirmMode.tunnel) === 1 ? '' : 's' }}, one after another. Disabled lights are skipped.</p>
      <p class="levels">{{ preview(confirmMode.tunnel, confirmMode.mode) }}</p>
      <p class="muted small">It runs in the background; you can leave this page.</p>
      <template #footer>
        <button class="btn secondary" :disabled="confirmMode.busy" @click="confirmMode.open = false">Cancel</button>
        <button class="btn" :disabled="confirmMode.busy" data-action="confirm-mode" @click="runMode">{{ confirmMode.busy ? 'Starting…' : `Switch to ${modeLabel(confirmMode.mode)}` }}</button>
      </template>
    </Modal>

    <!-- new tunnel -->
    <Modal v-if="create.open" title="New tunnel" width="460px" @close="create.open = false">
      <form id="newTunnel" class="stack" @submit.prevent="saveCreate">
        <div v-if="create.error" class="alert error">{{ create.error }}</div>
        <div class="field"><label for="tn">Name *</label><input id="tn" v-model="create.name" maxlength="100" placeholder="e.g. Hill Tunnel" required /></div>
        <div class="field"><label for="tl">Length (metres)</label><input id="tl" v-model="create.length" type="number" min="0" /></div>
        <div class="field"><label for="td">Notes</label><input id="td" v-model="create.description" maxlength="255" /></div>
        <p class="hint">Next you'll split it into zones and choose the lights.</p>
      </form>
      <template #footer>
        <button class="btn secondary" type="button" @click="create.open = false">Cancel</button>
        <button class="btn" type="submit" form="newTunnel" :disabled="create.busy">{{ create.busy ? 'Creating…' : 'Create' }}</button>
      </template>
    </Modal>

    <!-- zone editor -->
    <Modal v-if="ed.open" :title="`Edit ${ed.name}`" width="780px" @close="ed.open = false">
      <div v-if="ed.error" class="alert error">{{ ed.error }}</div>
      <div class="three">
        <div class="field"><label for="en">Name *</label><input id="en" v-model="ed.name" maxlength="100" required /></div>
        <div class="field"><label for="el">Length (m)</label><input id="el" v-model="ed.length" type="number" min="0" /></div>
        <div class="field"><label for="ed">Notes</label><input id="ed" v-model="ed.description" maxlength="255" /></div>
      </div>

      <div class="zones-head">
        <h3>Zones <span class="muted">(entrance first)</span></h3>
        <div class="zh-act">
          <button v-if="!ed.zones.length" class="btn secondary sm" data-action="starter" @click="starter">Start with 4 typical zones</button>
          <button class="btn sm" data-action="add-zone" @click="addZone">+ Add zone</button>
        </div>
      </div>
      <p class="hint">Typical zones and levels are only a starting point. Set the levels your tunnel's design calls for.</p>

      <div v-for="(z, i) in ed.zones" :key="z.key" class="zed" :data-zone="i">
        <div class="zed-top">
          <span class="num">{{ i + 1 }}</span>
          <input v-model="z.name" class="z-name" maxlength="100" placeholder="Zone name" :aria-label="`Zone ${i + 1} name`" required />
          <select v-model="z.kind" :aria-label="`Zone ${i + 1} type`" @change="onKind(z)"><option v-for="k in KINDS" :key="k.id" :value="k.id">{{ k.label }}</option></select>
          <button class="icon" :disabled="i === 0" :aria-label="`Move zone ${i + 1} towards the entrance`" @click="move(i, -1)">↑</button>
          <button class="icon" :disabled="i === ed.zones.length - 1" :aria-label="`Move zone ${i + 1} towards the exit`" @click="move(i, 1)">↓</button>
          <button class="icon danger" :aria-label="`Remove zone ${i + 1}`" @click="ed.zones.splice(i, 1)">✕</button>
        </div>
        <div class="sliders">
          <label v-for="m in [['day', 'Day'], ['evening', 'Evening'], ['night', 'Night']]" :key="m[0]" class="sl">
            <span>{{ m[1] }} <b>{{ z[m[0]] }}%</b></span>
            <input v-model.number="z[m[0]]" type="range" min="1" max="99" :aria-label="`${z.name} ${m[1]} brightness`" />
          </label>
        </div>
        <details class="lights" :open="!z.receiverIds.length">
          <summary>{{ z.receiverIds.length }} light{{ z.receiverIds.length === 1 ? '' : 's' }} in this zone</summary>
          <div class="pick">
            <label v-for="d in devices" :key="d.id" class="chk" :class="{ taken: usedElsewhere(z, d.id) }">
              <input type="checkbox" :checked="z.receiverIds.includes(d.id)" :disabled="!!usedElsewhere(z, d.id)" :data-light="d.id" @change="toggleLight(z, d.id)" />
              <span>{{ d.device_name }}<small v-if="usedElsewhere(z, d.id)"> · in {{ usedElsewhere(z, d.id).name || 'another zone' }}</small><small v-else-if="d.status !== 'active'"> · disabled</small></span>
            </label>
            <p v-if="!devices.length" class="muted small">No lights yet. Add receivers in Devices first.</p>
          </div>
        </details>
      </div>
      <p v-if="!ed.zones.length" class="muted">No zones yet.</p>

      <template #footer>
        <button class="btn secondary" @click="ed.open = false">Cancel</button>
        <button class="btn" :disabled="ed.saving" data-action="save-tunnel" @click="saveEditor">{{ ed.saving ? 'Saving…' : 'Save tunnel' }}</button>
      </template>
    </Modal>

    <Modal v-if="del.open" title="Delete this tunnel?" width="440px" @close="del.open = false">
      <div v-if="del.error" class="alert error">{{ del.error }}</div>
      <p>Delete <strong>{{ del.tunnel?.name }}</strong> and its zones? The lights themselves are not touched.</p>
      <template #footer>
        <button class="btn secondary" @click="del.open = false">Cancel</button>
        <button class="btn danger" :disabled="del.busy" @click="confirmDelete">{{ del.busy ? 'Deleting…' : 'Delete' }}</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.muted { color: var(--text-muted); }
.small { font-size: 0.82rem; }
.bad { color: var(--red-fg); }
.good { color: var(--green-fg); }
.empty { text-align: center; padding: 2.4rem 1.2rem; }
.empty p { max-width: 560px; margin: 0.6rem auto 1.2rem; }

.list { display: flex; flex-direction: column; gap: 1rem; }
.tunnel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 1.1rem 1.3rem 1.2rem; }
.tunnel header { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; align-items: flex-start; }
.title { display: flex; align-items: center; gap: 0.55rem; flex-wrap: wrap; }
.title h3 { font-size: 1.15rem; }
.pill { padding: 0.12rem 0.6rem; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--border); font-size: 0.8rem; }
.tools { display: flex; gap: 0.5rem; }
.desc { margin: 0.4rem 0 0; color: var(--text-muted); font-size: 0.9rem; }

.strip { display: flex; gap: 0.5rem; margin-top: 1rem; padding: 0.7rem; background: linear-gradient(180deg, var(--surface-2), var(--surface)); border: 1px solid var(--border); border-radius: 14px 14px 6px 6px; border-top-width: 3px; }
.zone { position: relative; flex: 1 1 0; min-width: 110px; display: flex; flex-direction: column; gap: 0.4rem; padding: 0.5rem 0.55rem; border-radius: 10px; background: var(--surface); border: 1px solid var(--border); }
.z-head { display: flex; flex-direction: column; line-height: 1.2; }
.kind { font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.meter { position: relative; height: 84px; border-radius: 8px; background: var(--surface-2); overflow: hidden; border: 1px solid var(--border); }
.meter i { position: absolute; left: 0; right: 0; bottom: 0; background: linear-gradient(180deg, #fbbf24, #f59e0b); transition: height 0.4s; }
.meter i.off { background: var(--border); }
.m-val { position: absolute; inset: 0; display: grid; place-items: center; font-weight: 800; color: var(--text); text-shadow: 0 0 6px var(--surface); }
.z-foot { display: flex; gap: 0.5rem; flex-wrap: wrap; font-size: 0.76rem; color: var(--text-muted); }
.arrow { position: absolute; right: -0.55rem; top: 50%; transform: translateY(-50%); z-index: 1; width: 18px; height: 18px; border-radius: 50%; background: var(--surface); border: 1px solid var(--border); display: grid; place-items: center; font-size: 0.8rem; color: var(--text-muted); line-height: 1; }
.ends { display: flex; justify-content: space-between; margin: 0.25rem 0.3rem 0; font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.no-zones { margin: 1rem 0 0; }
.linklike { border: 0; background: none; color: var(--primary); font: inherit; font-weight: 600; cursor: pointer; padding: 0; text-decoration: underline; }

.job { display: flex; align-items: center; gap: 0.8rem; margin-top: 0.9rem; font-size: 0.88rem; flex-wrap: wrap; }
.progress { flex: 1 1 160px; height: 10px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; overflow: hidden; }
.bar-fill { height: 100%; background: var(--primary); transition: width 0.3s; }

.modes { display: flex; gap: 0.4rem; margin-top: 1rem; flex-wrap: wrap; }
.mode { flex: 1 1 90px; padding: 0.6rem 0.8rem; border-radius: 10px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); font: inherit; font-weight: 700; cursor: pointer; }
.mode:hover:not(:disabled) { border-color: var(--primary); }
.mode.on { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
.mode:disabled { opacity: 0.55; cursor: default; }

.levels { padding: 0.6rem 0.8rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; font-size: 0.88rem; }
.stack { display: flex; flex-direction: column; gap: 0.9rem; }
.three { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 2fr); gap: 0.7rem; margin-bottom: 0.4rem; }
@media (max-width: 640px) { .three { grid-template-columns: 1fr; } }

.zones-head { display: flex; justify-content: space-between; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin-top: 0.8rem; }
.zones-head h3 { font-size: 1rem; }
.zh-act { display: flex; gap: 0.5rem; }
.hint { margin: 0.2rem 0 0.8rem; }
.zed { border: 1px solid var(--border); border-radius: 12px; background: var(--surface-2); padding: 0.7rem 0.8rem; margin-bottom: 0.7rem; }
.zed-top { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.num { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: var(--primary); color: var(--on-primary); font-weight: 800; font-size: 0.8rem; flex: none; }
.z-name { flex: 1 1 150px; min-width: 0; }
.icon { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font: inherit; cursor: pointer; }
.icon:disabled { opacity: 0.4; cursor: default; }
.icon.danger { color: var(--red-fg); }
.sliders { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.7rem; margin-top: 0.6rem; }
@media (max-width: 640px) { .sliders { grid-template-columns: 1fr; } }
.sl { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.82rem; font-weight: 600; color: var(--text-muted); }
.sl b { color: var(--text); }
.sl input[type='range'] { padding: 0; accent-color: var(--primary); }
.lights { margin-top: 0.6rem; }
.lights summary { cursor: pointer; font-weight: 600; font-size: 0.88rem; }
.pick { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(180px, 100%), 1fr)); gap: 0.35rem; margin-top: 0.5rem; }
.chk { display: flex; align-items: center; gap: 0.45rem; padding: 0.35rem 0.5rem; border-radius: 8px; background: var(--surface); border: 1px solid var(--border); cursor: pointer; font-size: 0.85rem; }
.chk.taken { opacity: 0.55; cursor: default; }
.chk input { accent-color: var(--primary); width: 15px; height: 15px; padding: 0; }
.chk small { color: var(--text-muted); }
</style>
