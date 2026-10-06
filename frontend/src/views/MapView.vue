<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { mapApi } from '../api/resources.js';
import { estimateRoute, pathLengthM, kmText } from '../utils/geo.js';
import { useAuthStore } from '../stores/auth.js';
import LightControlModal from '../components/LightControlModal.vue';

const auth = useAuthStore();
const canControl = computed(() => auth.can('control', 'control'));
const canPlace = computed(() => auth.can('devices', 'edit'));
const canDesign = computed(() => auth.can('control', 'design')); // draw road routes

const lights = ref([]);
const roads = ref([]);
const roadId = ref('');
const loading = ref(true);
const error = ref('');
const notice = ref('');
const arming = ref(null);     // receiverId waiting for a map click
const dragMode = ref(false);
const openId = ref(null);
const query = ref('');
const showRoads = ref(true);

const mapEl = ref(null);
let map = null;
const markers = new Map();    // receiverId -> L.Marker
let fitted = false;
let timer = null;

const messageOf = (err, fallback) => err.response?.data?.error?.message ?? fallback;
const stateOf = (l) => (!l.enabled ? 'disabled' : l.online === true ? 'online' : l.online === false ? 'offline' : 'nodata');
const isLit = (l) => l.relay1 === true || l.relay2 === true;

const inRoad = (l) => !roadId.value || l.roadIds.includes(Number(roadId.value));
const visible = computed(() => lights.value.filter(inRoad));
const placed = computed(() => visible.value.filter((l) => l.latitude != null));
const unplaced = computed(() => visible.value.filter((l) => l.latitude == null));
const matches = (l) => !query.value.trim() || `${l.name} ${l.address}`.toLowerCase().includes(query.value.trim().toLowerCase());
const placedList = computed(() => placed.value.filter(matches));
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

/* ---------- data ---------- */
async function load() {
  try {
    const d = await mapApi.lights();
    lights.value = d.lights;
    roads.value = d.roads;
    error.value = '';
  } catch (err) {
    error.value = messageOf(err, 'Could not load the lights');
  } finally {
    loading.value = false;
  }
}

/* ---------- markers ---------- */
const BULB = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z"/></svg>';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const iconFor = (l) => L.divIcon({
  className: 'gps-pin',
  html: `<span class="pin ${stateOf(l)}${isLit(l) ? ' lit' : ''}${arming.value === l.receiverId ? ' armed' : ''}">${BULB}</span>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});
const labelFor = (l) => `<b>${esc(l.name)}</b><br><span>${stateOf(l) === 'online' ? 'online' : stateOf(l) === 'offline' ? 'offline' : stateOf(l) === 'disabled' ? 'disabled' : 'no data'}${isLit(l) ? ' · lit' : ''}</span>`;

/* ---------- road lines ---------- */
let roadGroup = null;
const roadLayers = new Map();   // roadId -> bounds helper
const lightsOfRoad = (id) => lights.value.filter((l) => l.roadIds.includes(id) && l.latitude != null);

// What to draw for a road: its drawn route, else a guess through its lights.
function routeOf(road) {
  if (road.path?.length >= 2) return { points: road.path, kind: 'drawn' };
  const est = estimateRoute(lightsOfRoad(road.id).map((l) => [l.latitude, l.longitude]));
  return est ? { points: est, kind: 'estimated' } : { points: null, kind: 'none' };
}
const roadInfo = computed(() => roads.value
  .filter((rd) => !roadId.value || String(rd.id) === String(roadId.value))
  .map((rd) => {
    const route = routeOf(rd);
    const ls = lightsOfRoad(rd.id);
    const state = !ls.length ? 'none' : ls.some((l) => stateOf(l) === 'offline') ? 'offline' : ls.every((l) => stateOf(l) === 'online') ? 'online' : 'nodata';
    return { ...rd, ...route, state, lights: ls.length, length: route.points ? pathLengthM(route.points) : 0 };
  }));

function drawRoads() {
  if (!map) return;
  if (!roadGroup) roadGroup = L.layerGroup().addTo(map);
  roadGroup.clearLayers();
  roadLayers.clear();
  if (!showRoads.value) return;
  for (const rd of roadInfo.value) {
    if (!rd.points || editing.roadId === rd.id) continue;
    const tip = `<b>${esc(rd.name)}</b><br><span>${kmText(rd.length)} · ${rd.kind === 'drawn' ? 'route drawn' : 'estimated from the lights'}</span>`;
    const casing = L.polyline(rd.points, { className: 'road-casing', weight: 11, interactive: true }).bindTooltip(tip, { sticky: true, className: 'gps-tip' });
    const line = L.polyline(rd.points, { className: `road-line ${rd.state}${rd.kind === 'estimated' ? ' est' : ''}`, weight: 3, interactive: false });
    roadGroup.addLayer(casing).addLayer(line);
    roadLayers.set(rd.id, casing);
  }
}

/* ---------- drawing a route ---------- */
const editing = reactive({ roadId: null, name: '', points: [], saving: false });
let editLine = null;
const vertexMarkers = [];

const vertexIcon = L.divIcon({ className: 'gps-vertex', html: '<span></span>', iconSize: [16, 16], iconAnchor: [8, 8] });

function renderEdit() {
  if (!map) return;
  if (editLine) { editLine.remove(); editLine = null; }
  vertexMarkers.splice(0).forEach((m) => m.remove());
  if (editing.roadId == null) return;
  editLine = L.polyline(editing.points, { className: 'road-edit', weight: 5, interactive: false }).addTo(map);
  editing.points.forEach((p, i) => {
    const m = L.marker(p, { icon: vertexIcon, draggable: true, keyboard: false, title: 'Drag to move · right-click to delete' }).addTo(map);
    m.on('drag', () => { editing.points[i] = [m.getLatLng().lat, m.getLatLng().lng]; editLine.setLatLngs(editing.points); });
    m.on('contextmenu', () => removeVertex(i));
    m.on('dblclick', () => removeVertex(i));
    vertexMarkers.push(m);
  });
}
function removeVertex(i) {
  if (editing.points.length <= 2) { notice.value = 'A route needs at least 2 points. Use Undo or Start over instead.'; return; }
  editing.points.splice(i, 1);
  renderEdit();
}
function startRoute(rd) {
  arming.value = null;
  openId.value = null;
  error.value = '';
  notice.value = '';
  Object.assign(editing, { roadId: rd.id, name: rd.name, points: rd.kind === 'drawn' ? rd.points.map((p) => [...p]) : [], saving: false });
  drawRoads();
  renderEdit();
  if (!editing.points.length) {
    const ls = lightsOfRoad(rd.id);
    if (ls.length) map.fitBounds(ls.map((l) => [l.latitude, l.longitude]), { padding: [80, 80], maxZoom: 17 });
    notice.value = `Click along the road to draw its route for ${rd.name}.`;
  }
}
function addVertex(ll) { editing.points.push([ll.lat, ll.lng]); renderEdit(); }
function undoVertex() { editing.points.pop(); renderEdit(); }
function startOver() { editing.points = []; renderEdit(); }
function cancelRoute() {
  editing.roadId = null;
  editing.points = [];
  notice.value = '';
  renderEdit();
  drawRoads();
}
async function saveRoute() {
  if (editing.points.length < 2) { error.value = 'Click at least 2 points on the map first.'; return; }
  editing.saving = true;
  try {
    await mapApi.setRoadPath(editing.roadId, editing.points);
    const name = editing.name;
    editing.roadId = null;
    editing.points = [];
    renderEdit();
    notice.value = `Route saved for ${name}.`;
    await load();
  } catch (err) {
    error.value = messageOf(err, 'Could not save the route');
  } finally {
    editing.saving = false;
  }
}
async function clearRoute(rd) {
  if (!window.confirm(`Remove the drawn route of ${rd.name}? The map will go back to an estimated line.`)) return;
  try {
    await mapApi.setRoadPath(rd.id, null);
    notice.value = `Route of ${rd.name} removed.`;
    await load();
  } catch (err) {
    error.value = messageOf(err, 'Could not remove the route');
  }
}
function focusRoad(rd) {
  if (!map || !rd.points) return;
  map.fitBounds(rd.points, { padding: [60, 60], maxZoom: 18 });
}

function syncMarkers() {
  if (!map) return;
  drawRoads();
  const want = new Set(placed.value.map((l) => l.receiverId));
  for (const [id, m] of markers) {
    if (!want.has(id)) { m.remove(); markers.delete(id); }
  }
  for (const l of placed.value) {
    let m = markers.get(l.receiverId);
    if (!m) {
      m = L.marker([l.latitude, l.longitude], { icon: iconFor(l), draggable: false, keyboard: true, title: l.name });
      m.bindTooltip('', { direction: 'top', offset: [0, -14], className: 'gps-tip' });
      m.on('click', () => { if (!arming.value && editing.roadId == null) openId.value = l.receiverId; });
      m.on('dragend', () => savePosition(l.receiverId, m.getLatLng()));
      m.addTo(map);
      markers.set(l.receiverId, m);
    } else {
      m.setIcon(iconFor(l));
      if (!m.dragging?._draggable?._moving) m.setLatLng([l.latitude, l.longitude]);
    }
    m.getTooltip().setContent(labelFor(l));
    const drag = dragMode.value && canPlace.value;
    if (drag) m.dragging.enable(); else m.dragging.disable();
  }
  if (!fitted && placed.value.length) fitToLights();
}

function fitToLights() {
  if (!map || !placed.value.length) return;
  const pts = [
    ...placed.value.map((l) => [l.latitude, l.longitude]),
    ...(showRoads.value ? roadInfo.value.flatMap((rd) => rd.points ?? []) : []),
  ];
  if (pts.length === 1) map.setView(pts[0], 16);
  else map.fitBounds(pts, { padding: [60, 60], maxZoom: 17 });
  fitted = true;
}

async function savePosition(id, ll) {
  try {
    await mapApi.setPosition(id, { latitude: ll.lat, longitude: ll.lng });
    notice.value = 'Position saved.';
    await load();
  } catch (err) {
    error.value = messageOf(err, 'Could not save the position');
    await load();
  }
}

async function removePosition(l) {
  try {
    await mapApi.setPosition(l.receiverId, { latitude: null, longitude: null });
    openId.value = null;
    notice.value = `${l.name} taken off the map.`;
    await load();
  } catch (err) {
    error.value = messageOf(err, 'Could not remove the position');
  }
}

function arm(l) {
  arming.value = arming.value === l.receiverId ? null : l.receiverId;
  notice.value = arming.value ? `Click the map where ${l.name} is.` : '';
  syncMarkers();
}

function focusLight(l) {
  if (!map) return;
  map.flyTo([l.latitude, l.longitude], Math.max(map.getZoom(), 17), { duration: 0.6 });
  openId.value = l.receiverId;
}

function onKey(e) {
  if (e.key === 'Escape' && editing.roadId != null) { cancelRoute(); return; }
  if (e.key === 'Escape' && arming.value) { arming.value = null; notice.value = ''; syncMarkers(); }
}

/* ---------- lifecycle ---------- */
onMounted(async () => {
  map = L.map(mapEl.value, { zoomControl: true, worldCopyJump: true }).setView([22.5, 79], 5);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  }).addTo(map);
  map.on('click', async (e) => {
    if (editing.roadId != null) { addVertex(e.latlng); return; }
    if (!arming.value) return;
    const id = arming.value;
    arming.value = null;
    notice.value = '';
    try {
      await mapApi.setPosition(id, { latitude: e.latlng.lat, longitude: e.latlng.lng });
      await load();
      const l = lights.value.find((x) => x.receiverId === id);
      if (l) { notice.value = `${l.name} placed. Turn on "Move lights" to drag it if it is slightly off.`; }
    } catch (err) {
      error.value = messageOf(err, 'Could not save the position');
    }
  });
  window.addEventListener('keydown', onKey);
  await load();
  timer = setInterval(() => { if (!document.hidden) load(); }, 5000);
});
onBeforeUnmount(() => {
  clearInterval(timer);
  window.removeEventListener('keydown', onKey);
  if (map) { map.remove(); map = null; }
  markers.clear();
  roadGroup = null;
  editLine = null;
  vertexMarkers.length = 0;
});

watch([placed, dragMode, roads, showRoads], syncMarkers);
watch(roadId, () => { fitted = false; syncMarkers(); });
watch([arming, () => editing.roadId], ([a, e]) => { if (map) map.getContainer().style.cursor = a || e != null ? 'crosshair' : ''; });
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h2>GPS map</h2>
        <p>Where every light really is, with live status. Click a light to control it.</p>
      </div>
      <div class="head-actions">
        <select v-model="roadId" aria-label="Road">
          <option value="">All roads</option>
          <option v-for="r in roads" :key="r.id" :value="r.id">{{ r.name }}</option>
        </select>
        <button class="btn secondary" :disabled="!placed.length" @click="fitToLights">Fit to lights</button>
        <label class="toggle" :class="{ on: showRoads }">
          <input v-model="showRoads" type="checkbox" />
          <span>Show roads</span>
        </label>
        <label v-if="canPlace" class="toggle" :class="{ on: dragMode }">
          <input v-model="dragMode" type="checkbox" />
          <span>Move lights</span>
        </label>
      </div>
    </div>

    <div v-if="error" class="alert error">{{ error }}</div>
    <div v-if="notice" class="alert info">{{ notice }}</div>

    <div class="kpis">
      <span class="chip"><b>{{ placed.length }}</b> on map</span>
      <span class="chip green"><b>{{ counts.online }}</b> online</span>
      <span class="chip red"><b>{{ counts.offline }}</b> offline</span>
      <span v-if="counts.nodata" class="chip gray"><b>{{ counts.nodata }}</b> no data</span>
      <span class="chip amber"><b>{{ counts.lit }}</b> lit</span>
      <span v-if="unplaced.length" class="chip warn"><b>{{ unplaced.length }}</b> not placed</span>
    </div>

    <div class="stage">
      <div class="map-wrap">
        <div ref="mapEl" class="map" data-map />
        <div v-if="!loading && !placed.length" class="empty-note">
          <b>No lights are on the map yet.</b>
          <span v-if="canPlace && unplaced.length">Pick a light under “Not placed” and click its spot on the map, or type its latitude and longitude in Devices → edit receiver.</span>
          <span v-else-if="!canPlace">Ask an Admin to place the lights.</span>
          <span v-else>Add receivers in Devices first.</span>
        </div>
        <div v-if="arming" class="arming">Click the map to place the light · Esc to cancel</div>
        <div v-if="editing.roadId != null" class="drawbar" role="group" aria-label="Draw road route">
          <b>{{ editing.name }}</b>
          <span class="muted">{{ editing.points.length }} point{{ editing.points.length === 1 ? '' : 's' }}<template v-if="editing.points.length > 1"> · {{ kmText(pathLengthM(editing.points)) }}</template></span>
          <span class="how">Click to add · drag to move · right-click a point to delete</span>
          <button class="btn secondary sm" :disabled="!editing.points.length" @click="undoVertex">Undo</button>
          <button class="btn secondary sm" :disabled="!editing.points.length" @click="startOver">Start over</button>
          <button class="btn secondary sm" @click="cancelRoute">Cancel</button>
          <button class="btn success sm" :disabled="editing.saving || editing.points.length < 2" data-action="save-route" @click="saveRoute">{{ editing.saving ? 'Saving…' : 'Save route' }}</button>
        </div>
      </div>

      <aside class="panel" aria-label="Lights">
        <input v-model="query" type="search" placeholder="Search name or address…" aria-label="Search lights" />

        <template v-if="unplaced.length">
          <h3>Not placed <span class="muted">({{ unplaced.length }})</span></h3>
          <ul class="list">
            <li v-for="l in unplaced" :key="l.receiverId">
              <div class="row">
                <span class="dot" :class="stateOf(l)" />
                <span class="name">{{ l.name }}<small>address {{ l.address }}</small></span>
                <button v-if="canPlace" class="btn sm" :class="{ secondary: arming !== l.receiverId }" :data-place="l.receiverId" @click="arm(l)">{{ arming === l.receiverId ? 'Cancel' : 'Place' }}</button>
              </div>
            </li>
          </ul>
        </template>

        <h3>On the map <span class="muted">({{ placedList.length }})</span></h3>
        <ul class="list">
          <li v-for="l in placedList" :key="l.receiverId" class="with-act">
            <button type="button" class="row link" @click="focusLight(l)">
              <span class="dot" :class="stateOf(l)" />
              <span class="name">{{ l.name }}<small>{{ l.latitude.toFixed(5) }}, {{ l.longitude.toFixed(5) }}</small></span>
              <span v-if="isLit(l)" class="lit-tag">lit</span>
            </button>
            <button v-if="canPlace && dragMode" type="button" class="btn danger sm" :aria-label="'Take ' + l.name + ' off the map'" title="Take off the map" @click="removePosition(l)">✕</button>
          </li>
          <li v-if="!placedList.length" class="none">{{ placed.length ? 'No match.' : 'Nothing placed yet.' }}</li>
        </ul>
        <template v-if="roadInfo.length">
          <h3>Roads <span class="muted">({{ roadInfo.length }})</span></h3>
          <ul class="list">
            <li v-for="rd in roadInfo" :key="rd.id" class="with-act">
              <button type="button" class="row link" :disabled="!rd.points" @click="focusRoad(rd)">
                <span class="dot" :class="rd.state" />
                <span class="name">{{ rd.name }}<small>{{ rd.points ? kmText(rd.length) + ' · ' + (rd.kind === 'drawn' ? 'drawn' : 'estimated') : rd.lights < 2 ? 'place 2+ lights or draw it' : 'no line yet' }}</small></span>
              </button>
              <button v-if="canDesign" type="button" class="btn secondary sm" :data-draw="rd.id" :disabled="editing.roadId != null" @click="startRoute(rd)">{{ rd.kind === 'drawn' ? 'Edit' : 'Draw' }}</button>
              <button v-if="canDesign && rd.kind === 'drawn'" type="button" class="btn danger sm" :aria-label="'Remove route of ' + rd.name" title="Remove the drawn route" :disabled="editing.roadId != null" @click="clearRoute(rd)">✕</button>
            </li>
          </ul>
        </template>
        <p class="legend"><span><i class="dot online" /> online</span><span><i class="dot offline" /> offline</span><span><i class="dot nodata" /> no data</span></p>
      </aside>
    </div>

    <LightControlModal v-if="openLight" :light="openLight" :can-control="canControl" @close="openId = null" @changed="load" />
  </div>
</template>

<style scoped>
.head-actions { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
.muted { color: var(--text-muted); font-weight: 400; }
.toggle { display: inline-flex; align-items: center; gap: 0.45rem; padding: 0.45rem 0.8rem; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-2); color: var(--text); cursor: pointer; font-weight: 600; font-size: 0.9rem; }
.toggle.on { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
.toggle input { accent-color: var(--primary); width: 15px; height: 15px; padding: 0; }
.kpis { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.9rem; }
.chip { padding: 0.28rem 0.8rem; border-radius: 999px; background: var(--surface); border: 1px solid var(--border); font-size: 0.85rem; }
.chip.green { background: var(--green-soft); color: var(--green-fg); border-color: transparent; }
.chip.red { background: var(--red-soft); color: var(--red-fg); border-color: transparent; }
.chip.gray { background: var(--surface-2); color: var(--text-muted); }
.chip.amber, .chip.warn { background: var(--amber-soft); color: var(--amber-fg); border-color: transparent; }

.stage { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 1rem; align-items: start; }
@media (max-width: 1000px) { .stage { grid-template-columns: 1fr; } }
.map-wrap { position: relative; isolation: isolate; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow); }
.map { height: min(68vh, 640px); min-height: 380px; background: var(--surface-2); }
.empty-note { position: absolute; z-index: 500; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(420px, 86%); text-align: center; display: flex; flex-direction: column; gap: 0.4rem; padding: 1rem 1.2rem; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.empty-note span { color: var(--text-muted); font-size: 0.88rem; }
.arming { position: absolute; z-index: 500; left: 50%; top: 12px; transform: translateX(-50%); padding: 0.4rem 0.9rem; border-radius: 999px; background: var(--primary); color: var(--on-primary); font-weight: 700; font-size: 0.85rem; box-shadow: var(--shadow); }

.panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 0.9rem; display: flex; flex-direction: column; gap: 0.5rem; max-height: min(68vh, 640px); overflow-y: auto; }
.panel input { width: 100%; }
.panel h3 { font-size: 0.85rem; margin-top: 0.4rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
.row { width: 100%; display: flex; align-items: center; gap: 0.6rem; padding: 0.5rem 0.6rem; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-2); color: var(--text); font: inherit; text-align: left; }
.row.link { cursor: pointer; }
.with-act { display: flex; gap: 0.3rem; align-items: stretch; }
.with-act .row { flex: 1; min-width: 0; }
.row.link:hover { border-color: var(--primary); }
.name { flex: 1; min-width: 0; font-weight: 700; display: flex; flex-direction: column; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.name small { font-weight: 400; font-size: 0.74rem; color: var(--text-muted); }
.dot { width: 10px; height: 10px; border-radius: 50%; flex: none; display: inline-block; background: var(--lamp-unknown); }
.dot.online { background: var(--online); }
.dot.offline { background: var(--offline); }
.dot.disabled { background: var(--border); }
.lit-tag { font-size: 0.7rem; font-weight: 700; padding: 0.05rem 0.45rem; border-radius: 999px; background: var(--amber-soft); color: var(--amber-fg); }
.none { text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 0.6rem 0; }
.legend { display: flex; gap: 0.9rem; flex-wrap: wrap; margin: 0.4rem 0 0; font-size: 0.78rem; color: var(--text-muted); }
.legend .dot { margin-right: 0.3rem; }
.drawbar { position: absolute; z-index: 500; left: 12px; right: 12px; top: 12px; display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; padding: 0.5rem 0.7rem; background: var(--surface); color: var(--text); border: 1px solid var(--primary); border-radius: var(--radius-sm); box-shadow: var(--shadow); font-size: 0.85rem; }
.drawbar .how { color: var(--text-muted); flex: 1 1 200px; font-size: 0.8rem; }
.row:disabled { opacity: 0.7; cursor: default; }
</style>

<style>
/* Leaflet draws outside Vue's scoped styles, so the pins live here. */
.gps-pin { background: none; border: 0; }
.gps-pin .pin { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: var(--lamp-unknown); color: var(--lamp-glyph); border: 3px solid #fff; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45); transition: transform 0.12s; }
.gps-pin .pin svg { width: 15px; height: 15px; }
.gps-pin .pin.online { background: var(--online); }
.gps-pin .pin.offline { background: var(--offline); }
.gps-pin .pin.disabled { background: var(--border); }
.gps-pin .pin.lit { box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.55), 0 0 16px 6px rgba(251, 191, 36, 0.55); }
.gps-pin .pin.armed { transform: scale(1.25); outline: 3px solid var(--primary); }
.leaflet-marker-draggable .pin { cursor: move; }
.gps-tip { background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 8px; box-shadow: var(--shadow); font: inherit; font-size: 0.8rem; line-height: 1.25; }
.gps-tip::before { display: none; }
.gps-tip span { color: var(--text-muted); }
/* Roads: asphalt casing with a thin status line on top (dashed = estimated from the lights). */
.road-casing { stroke: var(--asphalt); stroke-opacity: 0.85; stroke-linecap: round; stroke-linejoin: round; fill: none; }
.road-line { stroke: var(--lamp-unknown); stroke-linecap: round; stroke-linejoin: round; fill: none; }
.road-line.online { stroke: var(--online); }
.road-line.offline { stroke: var(--offline); }
.road-line.est { stroke-dasharray: 9 8; }
.road-edit { stroke: var(--primary); stroke-linecap: round; stroke-linejoin: round; fill: none; }
.gps-vertex { background: none; border: 0; }
.gps-vertex span { display: block; width: 16px; height: 16px; border-radius: 50%; background: #fff; border: 3px solid var(--primary); box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5); cursor: move; }
/* Dark theme: darken the (light) map tiles, not the pins. */
:root[data-theme='dark'] .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.88); }
:root[data-theme='dark'] .leaflet-container { background: #0f1b37; }
.leaflet-container { font-family: inherit; }
</style>
