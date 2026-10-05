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
const isAdmin = computed(() => auth.role === 'Admin');
const canControl = computed(() => auth.role === 'Admin' || auth.role === 'Operator');

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
  } catch (err) {
    error.value = messageOf(err, 'Could not load live status');
  }
}

async function loadReceivers() {
  try { receivers.value = await devicesApi.list(); } catch { /* the sidebar just stays empty */ }
}

let timer = null;
onMounted(async () => {
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

        <div class="chips" data-summary>
          <span class="chip"><b>{{ summary.total }}</b> lights</span>
          <span class="chip green"><b>{{ summary.online }}</b> online</span>
          <span class="chip red"><b>{{ summary.offline }}</b> offline</span>
          <span v-if="summary.nodata" class="chip gray"><b>{{ summary.nodata }}</b> no data</span>
          <span class="chip amber"><b>{{ summary.lit }}</b> lit</span>
        </div>

        <div class="stage" :class="{ editing }">
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
.tabs button.on { background: var(--primary); color: #fff; }
.tabs button:disabled { opacity: 0.5; cursor: not-allowed; }

.bar { display: flex; justify-content: space-between; align-items: center; gap: 0.8rem; flex-wrap: wrap; margin-bottom: 0.8rem; }
.bar-left, .bar-right { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
.road-select { min-width: 240px; font-weight: 700; }
.editing-title { font-size: 1.05rem; }

.chips { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.9rem; }
.chip { padding: 0.28rem 0.8rem; border-radius: 999px; background: var(--surface); border: 1px solid var(--border); font-size: 0.85rem; }
.chip.green { background: var(--green-soft); color: var(--green); border-color: transparent; }
.chip.red { background: var(--red-soft); color: var(--red); border-color: transparent; }
.chip.gray { background: var(--surface-2); color: var(--text-muted); }
.chip.amber { background: var(--amber-soft); color: #b7791f; border-color: transparent; }

.stage { display: grid; grid-template-columns: 1fr; gap: 1rem; align-items: start; }
.stage.editing { grid-template-columns: minmax(0, 1fr) 310px; }
@media (max-width: 1000px) { .stage.editing { grid-template-columns: 1fr; } }

.legend { display: flex; gap: 1.2rem; flex-wrap: wrap; align-items: center; margin-top: 0.8rem; font-size: 0.85rem; }
.dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 0.35rem; vertical-align: middle; }
.dot.green { background: var(--green); }
.dot.red { background: var(--red); }
.dot.gray { background: #94a3b8; }
.dot.glow { background: #fbbf24; box-shadow: 0 0 8px 3px rgba(251, 191, 36, 0.6); }
.muted { color: var(--text-muted); }
.empty-state { text-align: center; padding: 3rem 1rem; }
.empty-state p { max-width: 460px; margin: 0.6rem auto 1.2rem; }
.stack { display: flex; flex-direction: column; gap: 0.9rem; }
.hint.warn { color: #b7791f; }
</style>
