<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import { plansApi } from '../api/resources.js';
import { useAuthStore } from '../stores/auth.js';
import { useMiniPlan } from '../stores/miniPlan.js';
import { loadGeometry } from '../utils/planCache.js';
import PlanViewer from '../components/plan/PlanViewer.vue';
import LightControlModal from '../components/LightControlModal.vue';
import Modal from '../components/Modal.vue';
import MapTabs from '../components/plan/MapTabs.vue';

const route = useRoute();
const auth = useAuthStore();
const mini = useMiniPlan();
const canPlace = computed(() => auth.can('plans', 'place'));
const canEdit = computed(() => auth.can('plans', 'edit'));
const canControl = computed(() => auth.can('control', 'control'));

const planId = computed(() => Number(route.params.id));
const plan = ref(null);
const geometry = shallowRef(null);          // large: kept out of Vue's deep reactivity
const lights = ref([]);
const hidden = ref(new Set());
const saved = ref(new Set());               // what the team has saved
const loading = ref(true);
const error = ref('');
const notice = ref('');

const tab = ref('lights');
const query = ref('');
const layerQuery = ref('');
const arming = ref(null);                   // receiverId waiting for a click on the plan
const dragMode = ref(false);
const showText = ref(true);
const showLabels = ref(true);
const openId = ref(null);
const stageEl = ref(null);
const viewer = ref(null);
const fullscreen = ref(false);

const messageOf = (err, fallback) => err.response?.data?.error?.message ?? fallback;

async function loadLights() {
  try {
    lights.value = (await plansApi.lights(planId.value)).lights;
  } catch (err) {
    error.value = messageOf(err, 'Could not load the lights');
  }
}
async function loadPlan() {
  loading.value = true;
  error.value = '';
  geometry.value = null;
  try {
    const [p, g] = await Promise.all([plansApi.get(planId.value), loadGeometry(planId.value)]);
    plan.value = p;
    const h = new Set(p.layers.filter((l) => l.hidden).map((l) => l.name));
    hidden.value = h;
    saved.value = new Set(h);
    geometry.value = g;
    await loadLights();
  } catch (err) {
    error.value = messageOf(err, 'Could not open this plan');
  } finally {
    loading.value = false;
  }
}

let timer = null;
onMounted(() => {
  loadPlan();
  timer = setInterval(() => { if (!document.hidden && geometry.value) loadLights(); }, 5000);
  document.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => { clearInterval(timer); document.removeEventListener('keydown', onKey); });
watch(planId, () => { arming.value = null; openId.value = null; loadPlan(); });

/* ---------- lights ---------- */
const stateOf = (l) => (!l.enabled ? 'disabled' : l.online === true ? 'online' : l.online === false ? 'offline' : 'nodata');
const isLit = (l) => l.relay1 === true || l.relay2 === true;
const placed = computed(() => lights.value.filter((l) => l.plan));
const unplaced = computed(() => lights.value.filter((l) => !l.plan));
const match = (l) => !query.value.trim() || `${l.name} ${l.address}`.toLowerCase().includes(query.value.trim().toLowerCase());
const placedList = computed(() => placed.value.filter(match));
const unplacedList = computed(() => unplaced.value.filter(match));
const counts = computed(() => {
  const c = { online: 0, offline: 0, nodata: 0, lit: 0 };
  for (const l of placed.value) {
    const s = stateOf(l);
    if (s === 'online') c.online += 1; else if (s === 'offline') c.offline += 1; else c.nodata += 1;
    if (isLit(l)) c.lit += 1;
  }
  return c;
});
const openLight = computed(() => (openId.value != null ? lights.value.find((l) => l.receiverId === openId.value) ?? null : null));

function arm(l) {
  arming.value = arming.value === l.receiverId ? null : l.receiverId;
  notice.value = arming.value ? `Click the plan where ${l.name} stands.` : '';
}
async function onPlace({ x, y }) {
  const id = arming.value;
  if (id == null) return;
  arming.value = null;
  notice.value = '';
  try {
    await plansApi.setLight(planId.value, id, { x, y });
    await loadLights();
    notice.value = 'Light placed. Turn on "Move lights" if it needs adjusting.';
  } catch (err) {
    error.value = messageOf(err, 'Could not save the position');
  }
}
async function onMove({ receiverId, x, y }) {
  try {
    await plansApi.setLight(planId.value, receiverId, { x, y });
    notice.value = 'Position saved.';
  } catch (err) {
    error.value = messageOf(err, 'Could not save the position');
  }
  await loadLights();
}
function onLightClick(id) {
  if (arming.value != null) return;
  openId.value = id;
}
async function removePos(l) {
  try {
    await plansApi.setLight(planId.value, l.receiverId, { x: null, y: null });
    if (openId.value === l.receiverId) openId.value = null;
    notice.value = `${l.name} taken off the plan.`;
    await loadLights();
  } catch (err) {
    error.value = messageOf(err, 'Could not remove the light');
  }
}
function focus(l) {
  viewer.value?.flyTo(l.plan.x, l.plan.y, 90);
  openId.value = l.receiverId;
}
function onKey(e) {
  if (e.key === 'Escape' && arming.value != null) { arming.value = null; notice.value = ''; }
}

/* ---------- layers ---------- */
const layers = computed(() => plan.value?.layers ?? []);
const layerList = computed(() => {
  const q = layerQuery.value.trim().toLowerCase();
  return layers.value.filter((l) => !q || l.name.toLowerCase().includes(q));
});
const shownCount = computed(() => layers.value.filter((l) => !hidden.value.has(l.name)).length);
const dirty = computed(() => hidden.value.size !== saved.value.size || [...hidden.value].some((n) => !saved.value.has(n)));
function toggleLayer(name) {
  const h = new Set(hidden.value);
  if (h.has(name)) h.delete(name); else h.add(name);
  hidden.value = h;
}
const setAll = (on) => { hidden.value = on ? new Set() : new Set(layers.value.map((l) => l.name)); };
function setVisibleMatches(on) {
  const h = new Set(hidden.value);
  for (const l of layerList.value) { if (on) h.delete(l.name); else h.add(l.name); }
  hidden.value = h;
}
async function saveLayers() {
  try {
    await plansApi.setLayers(planId.value, [...hidden.value]);
    saved.value = new Set(hidden.value);
    notice.value = 'Layer choice saved for everyone.';
  } catch (err) {
    error.value = messageOf(err, 'Could not save the layers');
  }
}
async function resetLayers() {
  try {
    await plansApi.setLayers(planId.value, null);
    const p = await plansApi.get(planId.value);
    plan.value = p;
    const h = new Set(p.layers.filter((l) => l.hidden).map((l) => l.name));
    hidden.value = h; saved.value = new Set(h);
    notice.value = 'Layers back to the drawing file\'s own settings.';
  } catch (err) {
    error.value = messageOf(err, 'Could not reset the layers');
  }
}

/* ---------- rename / mini ---------- */
const rename = ref({ open: false, name: '', busy: false, error: '' });
function openRename() { rename.value = { open: true, name: plan.value.name, busy: false, error: '' }; }
async function saveRename() {
  rename.value.busy = true;
  try {
    await plansApi.rename(planId.value, rename.value.name);
    plan.value.name = rename.value.name.trim();
    rename.value.open = false;
  } catch (err) {
    rename.value.error = messageOf(err, 'Could not rename');
  }
  rename.value.busy = false;
}
const pinned = computed(() => mini.planId === planId.value);
const togglePin = () => (pinned.value ? mini.close() : mini.pin(planId.value));
const sizeText = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
</script>

<template>
  <div>
    <MapTabs />
    <div class="page-header">
      <div>
        <router-link to="/plans" class="back">← All plans</router-link>
        <h2 v-if="plan" class="title">
          {{ plan.name }}
          <button v-if="canEdit" class="icon-btn" aria-label="Rename plan" title="Rename" @click="openRename">✎</button>
        </h2>
        <h2 v-else>Plan</h2>
        <p v-if="plan" class="meta">
          <span class="type">{{ plan.source_type.toUpperCase() }}</span> {{ plan.source_name }} · {{ sizeText(plan.size_bytes) }}<template v-if="plan.units"> · units: {{ plan.units }}</template> · {{ layers.length }} layers
        </p>
      </div>
      <div class="head-actions">
        <button class="btn secondary" data-action="pin" :disabled="!plan" @click="togglePin">{{ pinned ? '✓ Pinned as mini map' : 'Pin as mini map' }}</button>
      </div>
    </div>

    <div v-if="error" class="alert error">{{ error }}</div>
    <div v-if="loading" class="card"><p class="muted">Opening the drawing…</p></div>

    <div v-if="geometry && plan" ref="stageEl" class="stage" :class="{ fs: fullscreen }">
      <div class="vwrap">
        <PlanViewer
          ref="viewer"
          :geometry="geometry"
          :hidden-layers="hidden"
          :lights="lights"
          :show-text="showText"
          :show-labels="showLabels"
          :placing="arming != null"
          :movable="dragMode && canPlace"
          :selected-id="openId"
          :fullscreen-el="stageEl"
          :view-key="'plan-' + planId"
          @light-click="onLightClick"
          @place="onPlace"
          @move="onMove"
          @fullscreen-change="fullscreen = $event"
        >
          <div class="chips">
            <span class="chip"><b>{{ placed.length }}</b> on plan</span>
            <span class="chip green"><b>{{ counts.online }}</b> online</span>
            <span class="chip red"><b>{{ counts.offline }}</b> offline</span>
            <span class="chip amber"><b>{{ counts.lit }}</b> lit</span>
          </div>
          <div v-if="notice" class="toast" role="status">{{ notice }} <button aria-label="Dismiss" @click="notice = ''">✕</button></div>
        </PlanViewer>
      </div>

      <aside class="side" aria-label="Lights and layers">
        <div class="tabs" role="tablist">
          <button role="tab" :class="{ on: tab === 'lights' }" :aria-selected="tab === 'lights'" @click="tab = 'lights'">Lights</button>
          <button role="tab" :class="{ on: tab === 'layers' }" :aria-selected="tab === 'layers'" @click="tab = 'layers'">Layers <span class="muted">{{ shownCount }}/{{ layers.length }}</span></button>
        </div>

        <template v-if="tab === 'lights'">
          <input v-model="query" type="search" placeholder="Search name or address…" aria-label="Search lights" />
          <div class="opts">
            <label v-if="canPlace" class="tg" :class="{ on: dragMode }"><input v-model="dragMode" type="checkbox" /> Move lights</label>
            <label class="tg" :class="{ on: showLabels }"><input v-model="showLabels" type="checkbox" /> Names</label>
          </div>

          <template v-if="unplaced.length">
            <h3>Not placed <span class="muted">({{ unplacedList.length }})</span></h3>
            <ul class="list">
              <li v-for="l in unplacedList" :key="l.receiverId" class="row">
                <span class="dot" :class="stateOf(l)" />
                <span class="name">{{ l.name }}<small>address {{ l.address }}</small></span>
                <button v-if="canPlace" class="btn sm" :class="{ secondary: arming !== l.receiverId }" :data-place="l.receiverId" @click="arm(l)">{{ arming === l.receiverId ? 'Cancel' : 'Place' }}</button>
              </li>
            </ul>
          </template>
          <p v-else-if="!lights.length" class="muted small">No lights yet. Add receivers in Devices first.</p>

          <h3>On this plan <span class="muted">({{ placedList.length }})</span></h3>
          <ul class="list">
            <li v-for="l in placedList" :key="l.receiverId" class="with-act">
              <button type="button" class="row link" :class="{ sel: openId === l.receiverId }" @click="focus(l)">
                <span class="dot" :class="stateOf(l)" />
                <span class="name">{{ l.name }}<small>{{ stateOf(l) === 'online' ? 'online' : stateOf(l) === 'offline' ? 'offline' : stateOf(l) === 'disabled' ? 'disabled' : 'no data' }}</small></span>
                <span v-if="isLit(l)" class="lit-tag">lit</span>
              </button>
              <button v-if="canPlace && dragMode" class="btn danger sm" :aria-label="'Take ' + l.name + ' off the plan'" title="Take off the plan" @click="removePos(l)">✕</button>
            </li>
            <li v-if="!placedList.length" class="none">{{ placed.length ? 'No match.' : 'Nothing placed yet.' }}</li>
          </ul>
        </template>

        <template v-else>
          <input v-model="layerQuery" type="search" placeholder="Search layers…" aria-label="Search layers" />
          <div class="opts">
            <label class="tg" :class="{ on: showText }"><input v-model="showText" type="checkbox" /> Text</label>
            <button class="btn secondary sm" @click="setVisibleMatches(true)">{{ layerQuery ? 'Show matches' : 'Show all' }}</button>
            <button class="btn secondary sm" @click="setVisibleMatches(false)">{{ layerQuery ? 'Hide matches' : 'Hide all' }}</button>
          </div>
          <div v-if="canEdit" class="save-bar" :class="{ dirty }">
            <span>{{ dirty ? 'Layer view changed on this screen' : plan.customised ? 'Saved layer view' : 'The file\'s own layer settings' }}</span>
            <button v-if="dirty" class="btn sm" data-action="save-layers" @click="saveLayers">Save for everyone</button>
            <button v-else-if="plan.customised" class="btn secondary sm" @click="resetLayers">Reset</button>
          </div>
          <ul class="list layers">
            <li v-for="l in layerList" :key="l.name">
              <label class="layer">
                <input type="checkbox" :checked="!hidden.has(l.name)" :data-layer="l.name" @change="toggleLayer(l.name)" />
                <i class="sw" :style="{ background: l.color }" />
                <span class="ln" :title="l.name">{{ l.name }}</span>
                <span class="cnt">{{ l.count }}</span>
              </label>
            </li>
            <li v-if="!layerList.length" class="none">No layer matches.</li>
          </ul>
        </template>
      </aside>

      <LightControlModal v-if="openLight" :light="openLight" :can-control="canControl" @close="openId = null" @changed="loadLights" />
    </div>

    <Modal v-if="rename.open" title="Rename plan" width="420px" @close="rename.open = false">
      <div v-if="rename.error" class="alert error">{{ rename.error }}</div>
      <div class="field"><label for="rn">Name</label><input id="rn" v-model="rename.name" maxlength="150" @keydown.enter="saveRename" /></div>
      <template #footer>
        <button class="btn secondary" @click="rename.open = false">Cancel</button>
        <button class="btn" :disabled="rename.busy || !rename.name.trim()" @click="saveRename">Save</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.muted { color: var(--text-muted); font-weight: 400; }
.small { font-size: 0.85rem; }
.back { font-size: 0.85rem; font-weight: 600; }
.title { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.2rem; }
.icon-btn { border: 1px solid var(--border); background: var(--surface-2); color: var(--text-muted); border-radius: 8px; width: 28px; height: 28px; cursor: pointer; font-size: 0.9rem; }
.meta { margin: 0.2rem 0 0; color: var(--text-muted); font-size: 0.86rem; }
.type { padding: 0.08rem 0.45rem; border-radius: 6px; background: var(--primary-soft); color: var(--primary); font-size: 0.7rem; font-weight: 800; letter-spacing: 0.04em; }
.head-actions { display: flex; gap: 0.6rem; }

.stage { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 1rem; align-items: stretch; }
@media (max-width: 1000px) { .stage { grid-template-columns: minmax(0, 1fr); } }
.vwrap { position: relative; height: min(72vh, 720px); min-height: 420px; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow); }
.side { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 0.85rem; display: flex; flex-direction: column; gap: 0.5rem; height: min(72vh, 720px); min-height: 420px; overflow-y: auto; }
.side input[type='search'] { width: 100%; }
/* "fs" = real full screen or, where the browser refuses it, the window filled by the page */
.stage.fs { position: fixed; inset: 0; z-index: 45; grid-template-columns: minmax(0, 1fr) 330px; padding: 0.7rem; gap: 0.7rem; background: var(--bg); }
.stage.fs .vwrap, .stage.fs .side { height: 100%; min-height: 0; max-height: none; }
@media (max-width: 1000px) { .stage.fs { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) 40vh; } }

.chips { position: absolute; top: 10px; left: 10px; display: flex; gap: 0.4rem; flex-wrap: wrap; z-index: 2; pointer-events: none; }
.chip { padding: 0.2rem 0.65rem; border-radius: 999px; background: var(--surface); border: 1px solid var(--border); font-size: 0.8rem; box-shadow: var(--shadow); }
.chip.green { background: var(--green-soft); color: var(--green-fg); border-color: transparent; }
.chip.red { background: var(--red-soft); color: var(--red-fg); border-color: transparent; }
.chip.amber { background: var(--amber-soft); color: var(--amber-fg); border-color: transparent; }
.toast { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); z-index: 3; max-width: 80%; display: flex; gap: 0.6rem; align-items: center; padding: 0.5rem 0.9rem; border-radius: 12px; background: var(--surface); color: var(--text); border: 1px solid var(--primary); box-shadow: var(--shadow); font-size: 0.86rem; }
.toast button { border: 0; background: none; color: var(--text-muted); cursor: pointer; font-size: 0.9rem; }

.tabs { display: flex; gap: 0.25rem; padding: 0.2rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; }
.tabs button { flex: 1; border: 0; background: transparent; color: var(--text-muted); font: inherit; font-weight: 700; padding: 0.4rem; border-radius: 8px; cursor: pointer; }
.tabs button.on { background: var(--primary); color: var(--on-primary); }
.tabs button.on .muted { color: inherit; opacity: 0.85; }
.opts { display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center; }
.tg { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.3rem 0.65rem; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-2); color: var(--text); cursor: pointer; font-weight: 600; font-size: 0.82rem; }
.tg.on { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
.tg input { accent-color: var(--primary); width: 14px; height: 14px; padding: 0; }
.side h3 { font-size: 0.8rem; margin-top: 0.3rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
.row { width: 100%; display: flex; align-items: center; gap: 0.6rem; padding: 0.45rem 0.6rem; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-2); color: var(--text); font: inherit; text-align: left; }
.row.link { cursor: pointer; }
.row.link:hover, .row.sel { border-color: var(--primary); }
.with-act { display: flex; gap: 0.3rem; align-items: stretch; }
.with-act .row { flex: 1; min-width: 0; }
.name { flex: 1; min-width: 0; font-weight: 700; display: flex; flex-direction: column; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.name small { font-weight: 400; font-size: 0.74rem; color: var(--text-muted); }
.dot { width: 10px; height: 10px; border-radius: 50%; flex: none; background: var(--lamp-unknown); }
.dot.online { background: var(--online); }
.dot.offline { background: var(--offline); }
.dot.disabled { background: var(--border); }
.lit-tag { font-size: 0.7rem; font-weight: 700; padding: 0.05rem 0.45rem; border-radius: 999px; background: var(--amber-soft); color: var(--amber-fg); }
.none { text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 0.6rem 0; }

.save-bar { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.45rem 0.6rem; border-radius: 10px; background: var(--surface-2); border: 1px solid var(--border); font-size: 0.8rem; color: var(--text-muted); }
.save-bar.dirty { border-color: var(--primary); color: var(--text); }
.layers { gap: 0.15rem; }
.layer { display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0.3rem; border-radius: 8px; cursor: pointer; font-weight: 500; color: var(--text); font-size: 0.84rem; }
.layer:hover { background: var(--surface-2); }
.layer input { accent-color: var(--primary); width: 15px; height: 15px; padding: 0; flex: none; }
.sw { width: 12px; height: 12px; border-radius: 3px; border: 1px solid var(--border); flex: none; }
.ln { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cnt { font-size: 0.74rem; color: var(--text-muted); font-variant-numeric: tabular-nums; }
</style>
