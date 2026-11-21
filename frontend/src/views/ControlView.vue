<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { roadsApi, devicesApi } from '../api/resources.js';
import { useAuthStore } from '../stores/auth.js';
import Modal from '../components/Modal.vue';
import RoadCanvas from '../components/road/RoadCanvas.vue';
import RoadEditorSidebar from '../components/road/RoadEditorSidebar.vue';
import LightControlModal from '../components/LightControlModal.vue';
import DeviceControlView from './DeviceControlView.vue';
import { emptyLayout, newId, straightRoad, crossroad } from '../utils/roadTemplates.js';

const auth = useAuthStore();
const isAdmin = computed(() => auth.can('control', 'design')); // road designer
const canControl = computed(() => auth.can('control', 'control'));

const clone = (o) => JSON.parse(JSON.stringify(o));
const messageOf = (err, fallback) => err.response?.data?.error?.message ?? fallback;

const tab = ref('map');
const roads = ref([]);
const roadId = ref(null);
const roadName = ref('');
const layout = ref(emptyLayout());
const receivers = ref([]);
const live = ref({});
const liveLoaded = ref(false);
const loading = ref(true);
const error = ref('');
const notice = ref('');
const openId = ref(null);

/* ---------------- loading ---------------- */
async function loadRoads(selectId) {
  roads.value = await roadsApi.list();
  let stored = null;
  try { stored = Number(localStorage.getItem('controlRoadId')); } catch { /* ignore */ }
  const target = selectId ?? (roads.value.some((r) => r.id === stored) ? stored : roads.value[0]?.id ?? null);
  await selectRoad(target);
}

async function selectRoad(id) {
  roadId.value = id;
  live.value = {};
  liveLoaded.value = false;
  openId.value = null;
  if (id == null) {
    layout.value = emptyLayout();
    roadName.value = '';
    return;
  }
  try { localStorage.setItem('controlRoadId', String(id)); } catch { /* ignore */ }
  const road = await roadsApi.get(id);
  roadName.value = road.name;
  layout.value = { ...emptyLayout(), ...road.layout };
  await loadLive();
}

async function loadLive() {
  const id = roadId.value;
  if (id == null) return;
  try {
    const data = await roadsApi.live(id);
    if (id !== roadId.value) return; // user switched road while this was in flight
    live.value = Object.fromEntries(data.lights.map((l) => [l.receiverId, l]));
    liveLoaded.value = true;
    lastUpdated.value = Date.now();
  } catch (err) {
    error.value = messageOf(err, 'Could not load live status');
  }
}

async function loadReceivers() {
  try { receivers.value = await devicesApi.list(); } catch { /* the sidebar just stays empty */ }
}

const lastUpdated = ref(null);
const nowTick = ref(Date.now());
const updatedText = computed(() => {
  if (!lastUpdated.value) return 'not loaded yet';
  const s = Math.max(0, Math.round((nowTick.value - lastUpdated.value) / 1000));
  return s < 5 ? 'just now' : `${s} s ago`;
});

let timer = null;
let clock = null;
onMounted(async () => {
  clock = setInterval(() => { nowTick.value = Date.now(); }, 1000);
  try {
    await Promise.all([loadRoads(), loadReceivers()]);
  } catch (err) {
    error.value = messageOf(err, 'Could not load roads');
  } finally {
    loading.value = false;
  }
  timer = setInterval(() => { if (!document.hidden) loadLive(); }, 5000);
  window.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', onBeforeUnload);
});
onBeforeUnmount(() => {
  clearInterval(timer);
  clearInterval(clock);
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('beforeunload', onBeforeUnload);
});

/* ---------------- summary ---------------- */
const shown = computed(() => (editing.value ? draft.value : layout.value));
const summary = computed(() => {
  const s = { total: shown.value.lights.length, online: 0, offline: 0, nodata: 0, lit: 0 };
  for (const l of shown.value.lights) {
    const i = live.value[l.receiverId];
    if (i?.online === true) s.online += 1;
    else if (i?.online === false) s.offline += 1;
    else s.nodata += 1;
    if (i && (i.relay1 === true || i.relay2 === true)) s.lit += 1;
  }
  return s;
});

/* ---------------- editing ---------------- */
const editing = ref(false);
const draft = ref(null);
const draftName = ref('');
const undoStack = ref([]);
const redoStack = ref([]);
const tool = ref('select');
const selection = ref(null);
const snap = ref(true);
const armed = ref(null);
const saving = ref(false);
const canvasRef = ref(null);

const dirty = computed(() => editing.value && (JSON.stringify(draft.value) !== JSON.stringify(layout.value) || draftName.value.trim() !== roadName.value));

function startEdit() {
  draft.value = clone(layout.value);
  draftName.value = roadName.value;
  undoStack.value = [];
  redoStack.value = [];
  tool.value = 'select';
  selection.value = null;
  armed.value = null;
  error.value = '';
  notice.value = '';
  editing.value = true;
}

function beginEdit() {
  undoStack.value.push(clone(draft.value));
  if (undoStack.value.length > 60) undoStack.value.shift();
  redoStack.value = [];
}
function undo() {
  if (!undoStack.value.length) return;
  redoStack.value.push(clone(draft.value));
  draft.value = undoStack.value.pop();
  selection.value = null;
}
function redo() {
  if (!redoStack.value.length) return;
  undoStack.value.push(clone(draft.value));
  draft.value = redoStack.value.pop();
  selection.value = null;
}

async function saveEdit() {
  saving.value = true;
  error.value = '';
  try {
    await roadsApi.update(roadId.value, { name: draftName.value.trim(), layout: draft.value });
    layout.value = clone(draft.value);
    roadName.value = draftName.value.trim();
    editing.value = false;
    roads.value = await roadsApi.list();
    await Promise.all([loadLive(), loadReceivers()]);
    notice.value = 'Road saved.';
  } catch (err) {
    error.value = messageOf(err, 'Could not save the road');
  } finally {
    saving.value = false;
  }
}

const confirmDiscard = ref(false);
function cancelEdit() {
  if (dirty.value) confirmDiscard.value = true;
  else editing.value = false;
}
function discard() {
  confirmDiscard.value = false;
  editing.value = false;
  error.value = '';
}

function onBeforeUnload(e) {
  if (dirty.value) { e.preventDefault(); e.returnValue = ''; }
}
onBeforeRouteLeave(() => (dirty.value ? window.confirm('You have unsaved changes to this road. Leave without saving?') : true));

function itemOf(sel) {
  if (!sel) return null;
  const list = sel.type === 'segment' ? draft.value.segments : sel.type === 'light' ? draft.value.lights : draft.value.labels;
  return list.find((x) => x.id === sel.id) ?? null;
}

function updateSelected(patch) {
  const sel = selection.value;
  if (!sel) return;
  beginEdit();
  const key = sel.type === 'segment' ? 'segments' : sel.type === 'light' ? 'lights' : 'labels';
  const next = { ...patch };
  if (sel.type === 'light' && 'label' in next && !next.label) next.label = undefined;
  draft.value = { ...draft.value, [key]: draft.value[key].map((x) => (x.id === sel.id ? { ...x, ...next } : x)) };
}

function deleteSelected() {
  const sel = selection.value;
  if (!sel) return;
  beginEdit();
  const key = sel.type === 'segment' ? 'segments' : sel.type === 'light' ? 'lights' : 'labels';
  draft.value = { ...draft.value, [key]: draft.value[key].filter((x) => x.id !== sel.id) };
  selection.value = null;
}

function onPlaceLight(p) {
  if (!armed.value) { notice.value = 'Pick a receiver from the list first, then click on the map.'; return; }
  beginEdit();
  const light = { id: newId('l'), receiverId: armed.value, x: p.x, y: p.y };
  draft.value = { ...draft.value, lights: [...draft.value.lights, light] };
  selection.value = { type: 'light', id: light.id };
  armed.value = null;
  tool.value = 'select';
  notice.value = '';
}

function onPlaceLabel(p) {
  beginEdit();
  const label = { id: newId('t'), text: 'Label', x: p.x, y: p.y, size: 18 };
  draft.value = { ...draft.value, labels: [...draft.value.labels, label] };
  selection.value = { type: 'label', id: label.id };
  tool.value = 'select';
}

function onAddSegment(points) {
  beginEdit();
  const seg = { id: newId('s'), points, lanes: 2, curved: false };
  draft.value = { ...draft.value, segments: [...draft.value.segments, seg] };
  selection.value = { type: 'segment', id: seg.id };
  tool.value = 'select';
}

function onDeletePoint({ id, index }) {
  const seg = draft.value.segments.find((s) => s.id === id);
  if (!seg) return;
  if (seg.points.length <= 2) { notice.value = 'A road piece needs at least 2 points — delete the whole piece instead.'; return; }
  beginEdit();
  draft.value = { ...draft.value, segments: draft.value.segments.map((s) => (s.id === id ? { ...s, points: s.points.filter((_, i) => i !== index) } : s)) };
}

function onUpdateCanvas(patch) {
  beginEdit();
  draft.value = { ...draft.value, canvas: { ...draft.value.canvas, ...patch } };
}

function armReceiver(id) { armed.value = id; tool.value = 'light'; notice.value = ''; }
function setTool(t) { tool.value = t; if (t !== 'light') armed.value = null; }

function onKey(e) {
  if (!editing.value) return;
  const tag = e.target?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selection.value) { e.preventDefault(); deleteSelected(); }
  if (e.key === 'Escape') { canvasRef.value?.cancelDraft(); armed.value = null; tool.value = 'select'; }
}

/* ---------------- templates ---------------- */
const tpl = reactive({ open: false, type: 'straight', lanes: 2, sides: 'both', count: 4, perArm: 2 });
const unplaced = computed(() => {
  const used = new Set((draft.value?.lights ?? []).map((l) => l.receiverId));
  return receivers.value.filter((r) => !used.has(r.id));
});
function openTemplate() {
  tpl.count = Math.max(1, Math.min(unplaced.value.length || 1, 8));
  tpl.perArm = 2;
  tpl.open = true;
}
function applyTemplate() {
  const pool = unplaced.value;
  beginEdit();
  draft.value = tpl.type === 'straight'
    ? straightRoad({ receivers: pool.slice(0, Math.min(tpl.count, pool.length)), lanes: tpl.lanes, sides: tpl.sides })
    : crossroad({ receivers: pool.slice(0, tpl.perArm * 4), lanes: tpl.lanes, perArm: tpl.perArm });
  selection.value = null;
  tpl.open = false;
}

/* ---------------- new / delete road ---------------- */
const newRoad = reactive({ open: false, name: '', busy: false, error: '' });
async function createRoad() {
  newRoad.busy = true;
  newRoad.error = '';
  try {
    const { id } = await roadsApi.create({ name: newRoad.name });
    newRoad.open = false;
    newRoad.name = '';
    await loadRoads(id);
    startEdit();
  } catch (err) {
    newRoad.error = messageOf(err, 'Could not create the road');
  } finally {
    newRoad.busy = false;
  }
}

const delRoad = reactive({ open: false, busy: false, error: '' });
async function deleteRoad() {
  delRoad.busy = true;
  delRoad.error = '';
  try {
    await roadsApi.remove(roadId.value);
    delRoad.open = false;
    editing.value = false;
    await loadRoads();
  } catch (err) {
    delRoad.error = messageOf(err, 'Could not delete the road');
  } finally {
    delRoad.busy = false;
  }
}

async function onRoadChange(e) {
  error.value = '';
  notice.value = '';
  try { await selectRoad(Number(e.target.value)); } catch (err) { error.value = messageOf(err, 'Could not load that road'); }
}

// While designing, a light that was just placed has no saved live data yet.
// Show it as "no data" with the receiver's real name instead of as a missing device.
const liveForCanvas = computed(() => {
  if (!editing.value || !draft.value) return live.value;
  const map = { ...live.value };
  for (const l of draft.value.lights) {
    if (map[l.receiverId]) continue;
    const r = receivers.value.find((x) => x.id === l.receiverId);
    if (r) map[l.receiverId] = { receiverId: r.id, name: r.device_name, address: r.lora_address, enabled: r.status === 'active', online: null, relay1: null, relay2: null, brightness: null };
  }
  return map;
});

/* ---------------- lights panel (search + filter) ---------------- */
const query = ref('');
const filter = ref('all');
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'online', label: 'Online' },
  { id: 'offline', label: 'Offline' },
  { id: 'lit', label: 'Lit' },
];
const stateOf = (i) => (!i ? 'nodata' : i.online === true ? 'online' : i.online === false ? 'offline' : 'nodata');
const isLit = (i) => Boolean(i && (i.relay1 === true || i.relay2 === true));
const lightRows = computed(() => {
  const q = query.value.trim().toLowerCase();
  return layout.value.lights
    .map((l) => ({ key: l.id, info: live.value[l.receiverId], receiverId: l.receiverId, label: l.label }))
    .filter((r) => r.info)
    .filter((r) => {
      if (filter.value === 'online' && stateOf(r.info) !== 'online') return false;
      if (filter.value === 'offline' && stateOf(r.info) !== 'offline') return false;
      if (filter.value === 'lit' && !isLit(r.info)) return false;
      if (!q) return true;
      return `${r.info.name} ${r.info.address} ${r.label ?? ''}`.toLowerCase().includes(q);
    });
});

/* ---------------- bulk switching ---------------- */
const bulk = reactive({ open: false, relay: 'both', state: true, busy: false, done: 0, total: 0, failed: [], finished: false });
const bulkTargets = computed(() => layout.value.lights.map((l) => live.value[l.receiverId]).filter((i) => i && i.enabled));
function openBulk(state) {
  Object.assign(bulk, { open: true, state, relay: 'both', busy: false, done: 0, total: 0, failed: [], finished: false });
}
async function runBulk() {
  const targets = bulkTargets.value;
  const relays = bulk.relay === 'both' ? [1, 2] : [Number(bulk.relay)];
  Object.assign(bulk, { busy: true, done: 0, total: targets.length, failed: [], finished: false });
  // One light at a time: the transmitter handles a single command at once.
  for (const t of targets) {
    let ok = true;
    for (const n of relays) {
      try {
        const r = await devicesApi.sendCommand(t.receiverId, { type: `relay${n}`, state: bulk.state });
        if (r.status && !['SUCCESS', 'SENT_OVER_LORA'].includes(r.status)) ok = false;
      } catch { ok = false; }
    }
    if (!ok) bulk.failed.push(t.name);
    bulk.done += 1;
  }
  bulk.busy = false;
  bulk.finished = true;
  await loadLive();
}

/* ---------------- opening a light ---------------- */
const openLight = computed(() => (openId.value != null ? live.value[openId.value] ?? null : null));
function onLightClick(receiverId) {
  if (editing.value) return;
  if (!live.value[receiverId]) { notice.value = 'This light points at a receiver that no longer exists. Edit the layout to fix it.'; return; }
  openId.value = receiverId;
}
</script>

<template>
  <div>
    <div class="tabs" role="tablist">
      <button role="tab" :class="{ on: tab === 'map' }" :aria-selected="tab === 'map'" @click="tab = 'map'">Road map</button>
      <button role="tab" :class="{ on: tab === 'list' }" :aria-selected="tab === 'list'" :disabled="editing" @click="tab = 'list'">List view</button>
    </div>

    <DeviceControlView v-if="tab === 'list'" />

    <template v-else>
      <div v-if="error" class="alert error">{{ error }}</div>
      <div v-if="notice" class="alert success">{{ notice }}</div>

      <div v-if="loading" class="card"><p class="muted">Loading roads…</p></div>

      <div v-else-if="!roads.length && !editing" class="card empty-state">
        <h2>No roads yet</h2>
        <p class="muted">A road is a drawing of where your lights are. Each light on it is linked to a receiver and shows its live status.</p>
        <button v-if="isAdmin" class="btn" @click="newRoad.open = true">+ Create your first road</button>
        <p v-else class="muted">Ask an Admin to create one.</p>
      </div>

      <template v-else>
        <div class="bar">
          <div class="bar-left">
            <select v-if="!editing" :value="roadId" class="road-select" aria-label="Road" @change="onRoadChange">
              <option v-for="r in roads" :key="r.id" :value="r.id">{{ r.name }} ({{ r.light_count }})</option>
            </select>
            <strong v-else class="editing-title">Editing: {{ draftName || roadName }}</strong>
            <span v-if="editing && dirty" class="badge amber">unsaved changes</span>
          </div>
          <div class="bar-right">
            <template v-if="!editing">
              <span class="updated" title="The map refreshes by itself every 5 seconds"><i class="pulse" /> Updated {{ updatedText }}</span>
              <button v-if="canControl && roadId" class="btn success" data-action="all-on" @click="openBulk(true)">All ON</button>
              <button v-if="canControl && roadId" class="btn danger" data-action="all-off" @click="openBulk(false)">All OFF</button>
              <button class="btn secondary" @click="loadLive">Refresh</button>
              <button v-if="isAdmin" class="btn secondary" @click="newRoad.open = true">+ New road</button>
              <button v-if="isAdmin && roadId" class="btn" data-action="edit-layout" @click="startEdit">✎ Edit layout</button>
            </template>
            <template v-else>
              <button class="btn secondary" @click="cancelEdit">Cancel</button>
              <button class="btn success" :disabled="saving" data-action="save-layout" @click="saveEdit">{{ saving ? 'Saving…' : 'Save road' }}</button>
            </template>
          </div>
        </div>

        <div class="kpis" data-summary>
          <div class="kpi"><span class="k-ico primary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z"/></svg></span><div><div class="k-val">{{ summary.total }}</div><div class="k-lbl">Lights</div></div></div>
          <div class="kpi"><span class="k-ico green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg></span><div><div class="k-val">{{ summary.online }}</div><div class="k-lbl">Online</div></div></div>
          <div class="kpi"><span class="k-ico red"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></span><div><div class="k-val">{{ summary.offline }}</div><div class="k-lbl">Offline</div></div></div>
          <div class="kpi"><span class="k-ico amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v10m6.4-6.4a9 9 0 11-12.8 0"/></svg></span><div><div class="k-val">{{ summary.lit }}</div><div class="k-lbl">Lit now</div></div></div>
          <div v-if="summary.nodata" class="kpi"><span class="k-ico gray"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 9a3 3 0 115 2c-1 1-2 1.5-2 3M12 18h.01"/></svg></span><div><div class="k-val">{{ summary.nodata }}</div><div class="k-lbl">No data</div></div></div>
        </div>

        <div class="stage" :class="{ editing, browsing: !editing }">
          <RoadCanvas
            ref="canvasRef"
            :layout="shown"
            :live="liveForCanvas"
            :live-loaded="liveLoaded"
            :editable="editing"
            :tool="tool"
            :selection="selection"
            :snap="snap"
            @update:layout="draft = $event"
            @begin-edit="beginEdit"
            @select="selection = $event"
            @light-click="onLightClick"
            @place-light="onPlaceLight"
            @place-label="onPlaceLabel"
            @add-segment="onAddSegment"
            @delete-point="onDeletePoint"
          />
          <RoadEditorSidebar
            v-if="editing"
            v-model:road-name="draftName"
            :layout="draft"
            :receivers="receivers"
            :tool="tool"
            :selection="selection"
            :snap="snap"
            :armed-receiver-id="armed"
            :can-undo="undoStack.length > 0"
            :can-redo="redoStack.length > 0"
            :draft-length="canvasRef?.draftLength ?? 0"
            @update:tool="setTool"
            @update:snap="snap = $event"
            @undo="undo"
            @redo="redo"
            @delete-selected="deleteSelected"
            @arm-receiver="armReceiver"
            @open-template="openTemplate"
            @update-item="updateSelected"
            @update-canvas="onUpdateCanvas"
            @finish-draft="canvasRef?.finishDraft()"
            @cancel-draft="canvasRef?.cancelDraft()"
            @delete-road="delRoad.open = true"
          />
          <aside v-else class="lights-panel" aria-label="Lights on this road">
            <div class="lp-head">
              <h3>Lights</h3>
              <span class="muted">{{ lightRows.length }} of {{ summary.total }}</span>
            </div>
            <input v-model="query" class="lp-search" type="search" placeholder="Search name or address…" aria-label="Search lights" />
            <div class="lp-filters" role="group" aria-label="Filter lights">
              <button v-for="f in FILTERS" :key="f.id" type="button" :class="{ on: filter === f.id }" :aria-pressed="filter === f.id" @click="filter = f.id">{{ f.label }}</button>
            </div>
            <ul class="lp-list">
              <li v-for="r in lightRows" :key="r.key">
                <button type="button" class="lp-row" :data-state="stateOf(r.info)" @click="onLightClick(r.receiverId)">
                  <span class="lp-dot" :class="stateOf(r.info)" />
                  <span class="lp-main">
                    <span class="lp-name">{{ r.label || r.info.name }}</span>
                    <span class="lp-sub">address {{ r.info.address }} · {{ stateOf(r.info) === 'online' ? 'online' : stateOf(r.info) === 'offline' ? 'offline' : 'no data' }}</span>
                  </span>
                  <span class="lp-relays" title="Relay 1 · Relay 2">
                    <i :class="{ on: r.info.relay1 === true, off: r.info.relay1 === false }" />
                    <i :class="{ on: r.info.relay2 === true, off: r.info.relay2 === false }" />
                  </span>
                </button>
              </li>
              <li v-if="!lightRows.length" class="lp-empty">{{ summary.total ? 'No lights match.' : 'No lights on this road yet.' }}</li>
            </ul>
          </aside>
        </div>

        <div class="legend">
          <span><i class="dot green" /> Online</span>
          <span><i class="dot red" /> Offline</span>
          <span><i class="dot gray" /> No data yet</span>
          <span><i class="dot glow" /> Light is ON (glow)</span>
          <span class="muted">Small dots under a light: Relay 1 · Relay 2 (green = ON)</span>
          <span v-if="!editing" class="muted">Click a light to control it · scroll to zoom · drag to pan</span>
        </div>
      </template>
    </template>

    <!-- light control -->
    <LightControlModal v-if="openLight" :light="openLight" :can-control="canControl" @close="openId = null" @changed="loadLive" />

    <!-- bulk switch -->
    <Modal v-if="bulk.open" :title="bulk.state ? 'Switch all lights ON' : 'Switch all lights OFF'" width="460px" @close="!bulk.busy && (bulk.open = false)">
      <div class="stack">
        <p v-if="!bulk.finished">
          This sends <strong>{{ bulk.state ? 'ON' : 'OFF' }}</strong> to <strong>{{ bulkTargets.length }}</strong> light{{ bulkTargets.length === 1 ? '' : 's' }} on
          <strong>{{ roadName }}</strong>, one after another. Disabled lights are skipped.
        </p>
        <div v-if="!bulk.finished" class="field">
          <label for="bulkRelay">Which relay</label>
          <select id="bulkRelay" v-model="bulk.relay" :disabled="bulk.busy">
            <option value="both">Both relays</option>
            <option value="1">Relay 1 only</option>
            <option value="2">Relay 2 only</option>
          </select>
        </div>
        <div v-if="bulk.busy || bulk.finished" class="progress" role="progressbar" :aria-valuenow="bulk.done" :aria-valuemax="bulk.total">
          <div class="bar-fill" :style="{ width: (bulk.total ? (bulk.done / bulk.total) * 100 : 0) + '%' }" />
        </div>
        <p v-if="bulk.busy" class="muted">Sending… {{ bulk.done }} of {{ bulk.total }}</p>
        <div v-if="bulk.finished && !bulk.failed.length" class="alert success">Done — all {{ bulk.total }} lights accepted the command.</div>
        <div v-if="bulk.finished && bulk.failed.length" class="alert warn">
          {{ bulk.total - bulk.failed.length }} of {{ bulk.total }} succeeded. No confirmation from: {{ bulk.failed.join(', ') }}.
        </div>
        <p v-if="!bulkTargets.length" class="alert info">There are no enabled lights on this road.</p>
      </div>
      <template #footer>
        <button class="btn secondary" :disabled="bulk.busy" @click="bulk.open = false">{{ bulk.finished ? 'Close' : 'Cancel' }}</button>
        <button v-if="!bulk.finished" class="btn" :class="bulk.state ? 'success' : 'danger'" :disabled="bulk.busy || !bulkTargets.length" data-action="bulk-run" @click="runBulk">
          {{ bulk.busy ? 'Sending…' : bulk.state ? 'Switch ON' : 'Switch OFF' }}
        </button>
      </template>
    </Modal>

    <!-- new road -->
    <Modal v-if="newRoad.open" title="New road" width="440px" @close="newRoad.open = false">
      <form id="newRoadForm" class="stack" @submit.prevent="createRoad">
        <div v-if="newRoad.error" class="alert error">{{ newRoad.error }}</div>
        <div class="field"><label>Road name *</label><input v-model="newRoad.name" maxlength="100" placeholder="e.g. NH-48 Highway" required autofocus /></div>
        <p class="hint">You'll go straight into the designer to draw it.</p>
      </form>
      <template #footer>
        <button class="btn secondary" type="button" @click="newRoad.open = false">Cancel</button>
        <button class="btn" type="submit" form="newRoadForm" :disabled="newRoad.busy">{{ newRoad.busy ? 'Creating…' : 'Create & design' }}</button>
      </template>
    </Modal>

    <!-- templates -->
    <Modal v-if="tpl.open" title="Start from a template" width="480px" @close="tpl.open = false">
      <div class="stack">
        <div class="field">
          <label>Layout</label>
          <select v-model="tpl.type">
            <option value="straight">Straight road</option>
            <option value="crossroad">Crossroad</option>
          </select>
        </div>
        <div class="field">
          <label>Lanes</label>
          <select v-model.number="tpl.lanes"><option v-for="n in 6" :key="n" :value="n">{{ n }}</option></select>
        </div>
        <template v-if="tpl.type === 'straight'">
          <div class="field">
            <label>Lights (from receivers not yet on this road: {{ unplaced.length }})</label>
            <input v-model.number="tpl.count" type="number" min="0" :max="Math.max(unplaced.length, 0)" />
          </div>
          <div class="field">
            <label>Lights on</label>
            <select v-model="tpl.sides"><option value="both">Both sides (alternating)</option><option value="one">One side</option></select>
          </div>
        </template>
        <div v-else class="field">
          <label>Lights per arm (4 arms · {{ unplaced.length }} receivers available)</label>
          <input v-model.number="tpl.perArm" type="number" min="1" max="6" />
        </div>
        <p class="hint warn">This replaces everything currently drawn on this road (you can Undo).</p>
      </div>
      <template #footer>
        <button class="btn secondary" @click="tpl.open = false">Cancel</button>
        <button class="btn" data-action="apply-template" @click="applyTemplate">Create layout</button>
      </template>
    </Modal>

    <!-- discard -->
    <Modal v-if="confirmDiscard" title="Discard changes?" width="420px" @close="confirmDiscard = false">
      <p>You have unsaved changes to this road. Leave the designer without saving?</p>
      <template #footer>
        <button class="btn secondary" @click="confirmDiscard = false">Keep editing</button>
        <button class="btn danger" @click="discard">Discard</button>
      </template>
    </Modal>

    <!-- delete road -->
    <Modal v-if="delRoad.open" title="Delete this road?" width="440px" @close="delRoad.open = false">
      <div v-if="delRoad.error" class="alert error">{{ delRoad.error }}</div>
      <p>Delete the road drawing <strong>{{ roadName }}</strong>? Your receivers and transmitters are not affected, only this map.</p>
      <template #footer>
        <button class="btn secondary" @click="delRoad.open = false">Cancel</button>
        <button class="btn danger" :disabled="delRoad.busy" @click="deleteRoad">{{ delRoad.busy ? 'Deleting…' : 'Delete road' }}</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.tabs { display: inline-flex; gap: 0.25rem; padding: 0.25rem; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 1rem; }
.tabs button { border: 0; background: transparent; color: var(--text-muted); font: inherit; font-weight: 700; padding: 0.45rem 1.1rem; border-radius: 9px; cursor: pointer; }
.tabs button.on { background: var(--primary); color: var(--on-primary); }
.tabs button:disabled { opacity: 0.5; cursor: not-allowed; }

.bar { display: flex; justify-content: space-between; align-items: center; gap: 0.8rem; flex-wrap: wrap; margin-bottom: 0.8rem; }
.bar-left, .bar-right { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
.road-select { min-width: min(240px, 100%); max-width: 100%; font-weight: 700; }
.editing-title { font-size: 1.05rem; }

.updated { display: inline-flex; align-items: center; gap: 0.45rem; font-size: 0.8rem; color: var(--text-muted); margin-right: 0.3rem; }
.pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--online); animation: pulse 2s infinite; }
@keyframes pulse { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--online) 55%, transparent); } 70% { box-shadow: 0 0 0 7px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
@media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }

.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(130px, 100%), 1fr)); gap: 0.7rem; margin-bottom: 0.9rem; }
.kpi { display: flex; align-items: center; gap: 0.75rem; padding: 0.7rem 0.9rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.k-ico { width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; flex: none; }
.k-ico svg { width: 20px; height: 20px; }
.k-ico.primary { background: var(--primary-soft); color: var(--primary); }
.k-ico.green { background: var(--green-soft); color: var(--green-fg); }
.k-ico.red { background: var(--red-soft); color: var(--red-fg); }
.k-ico.amber { background: var(--amber-soft); color: var(--amber-fg); }
.k-ico.gray { background: var(--surface-2); color: var(--text-muted); }
.k-val { font-size: 1.45rem; font-weight: 800; line-height: 1.1; }
.k-lbl { font-size: 0.78rem; color: var(--text-muted); font-weight: 600; }

.stage.browsing { grid-template-columns: minmax(0, 1fr) 300px; }
@media (max-width: 1100px) { .stage.browsing { grid-template-columns: minmax(0, 1fr); } }
.lights-panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 0.9rem; display: flex; flex-direction: column; gap: 0.6rem; max-height: 640px; }
.lp-head { display: flex; align-items: baseline; justify-content: space-between; }
.lp-head h3 { font-size: 1rem; }
.lp-search { width: 100%; }
.lp-filters { display: flex; gap: 0.3rem; }
.lp-filters button { flex: 1; border: 1px solid var(--border); background: var(--surface-2); color: var(--text-muted); font: inherit; font-size: 0.8rem; font-weight: 600; padding: 0.3rem 0; border-radius: 8px; cursor: pointer; }
.lp-filters button.on { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
.lp-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 0.3rem; }
.lp-row { width: 100%; display: flex; align-items: center; gap: 0.65rem; text-align: left; padding: 0.55rem 0.65rem; border: 1px solid var(--border); background: var(--surface-2); border-radius: 10px; color: var(--text); font: inherit; cursor: pointer; transition: border-color 0.15s; }
.lp-row:hover { border-color: var(--primary); }
.lp-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; background: var(--lamp-unknown); }
.lp-dot.online { background: var(--online); }
.lp-dot.offline { background: var(--offline); }
.lp-main { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.lp-name { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lp-sub { font-size: 0.75rem; color: var(--text-muted); }
.lp-relays { display: flex; gap: 4px; }
.lp-relays i { width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid var(--text-muted); opacity: 0.6; }
.lp-relays i.on { background: var(--online); border-color: var(--online); opacity: 1; }
.lp-empty { color: var(--text-muted); text-align: center; padding: 1rem 0; font-size: 0.85rem; }
.progress { height: 10px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; overflow: hidden; }
.bar-fill { height: 100%; background: var(--primary); transition: width 0.2s; }

.chips { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.9rem; }
.chip { padding: 0.28rem 0.8rem; border-radius: 999px; background: var(--surface); border: 1px solid var(--border); font-size: 0.85rem; }
.chip.green { background: var(--green-soft); color: var(--green-fg); border-color: transparent; }
.chip.red { background: var(--red-soft); color: var(--red-fg); border-color: transparent; }
.chip.gray { background: var(--surface-2); color: var(--text-muted); }
.chip.amber { background: var(--amber-soft); color: var(--amber-fg); border-color: transparent; }

.stage { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1rem; align-items: start; }
.stage.editing { grid-template-columns: minmax(0, 1fr) 310px; }
@media (max-width: 1000px) { .stage.editing { grid-template-columns: minmax(0, 1fr); } }

.legend { display: flex; gap: 1.2rem; flex-wrap: wrap; align-items: center; margin-top: 0.8rem; font-size: 0.85rem; }
.dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 0.35rem; vertical-align: middle; }
.dot.green { background: var(--online); }
.dot.red { background: var(--offline); }
.dot.gray { background: var(--lamp-unknown); }
.dot.glow { background: #fbbf24; box-shadow: 0 0 8px 3px rgba(251, 191, 36, 0.6); }
.muted { color: var(--text-muted); }
.empty-state { text-align: center; padding: 3rem 1rem; }
.empty-state p { max-width: 460px; margin: 0.6rem auto 1.2rem; }
.stack { display: flex; flex-direction: column; gap: 0.9rem; }
.hint.warn { color: var(--amber-fg); }
</style>
