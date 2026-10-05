<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { segmentGeometry, nearestEdgeIndex } from '../../utils/roadGeometry.js';

const props = defineProps({
  layout: { type: Object, required: true },
  live: { type: Object, default: () => ({}) },       // receiverId -> live light info
  liveLoaded: { type: Boolean, default: false },
  editable: { type: Boolean, default: false },
  tool: { type: String, default: 'select' },          // select | road | light | label
  selection: { type: Object, default: null },         // { type: 'segment'|'light'|'label', id }
  snap: { type: Boolean, default: true },
});
const emit = defineEmits(['update:layout', 'begin-edit', 'select', 'light-click', 'place-light', 'place-label', 'add-segment', 'delete-point']);

const svg = ref(null);
const vb = reactive({ x: 0, y: 0, w: 1200, h: 700 });
const draft = ref([]);          // road being drawn (tool = road)
const hover = ref(null);        // last pointer position in canvas units
const panning = ref(false);

function fit() {
  const { width, height } = props.layout.canvas;
  Object.assign(vb, { x: 0, y: 0, w: width, h: height });
}
watch(() => [props.layout.canvas.width, props.layout.canvas.height], fit, { immediate: true });
watch(() => props.tool, () => { draft.value = []; });

const viewBox = computed(() => `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
const geoms = computed(() => props.layout.segments.map((s) => ({ s, g: segmentGeometry(s) })));

/* ---------------- light appearance ---------------- */
function lightView(l) {
  const info = props.live[l.receiverId];
  if (!info) return { state: props.liveLoaded ? 'missing' : 'unknown', lit: false, name: l.label || 'Light', info: null };
  const state = !info.enabled ? 'disabled' : info.online === true ? 'online' : info.online === false ? 'offline' : 'unknown';
  return { state, lit: info.relay1 === true || info.relay2 === true, name: l.label || info.name, info };
}
const dotClass = (v) => (v === true ? 'on' : v === false ? 'off' : 'unk');
// Short tag under each relay dot: the first letters of its name ("LHS", "RHS"), or R1 / R2.
const tag = (name, fallback) => (name ? name.trim().slice(0, 3).toUpperCase() : fallback);
const tip = (l) => {
  const v = lightView(l);
  if (v.state === 'missing') return `${v.name} — receiver no longer exists`;
  const i = v.info;
  const relay = (v1) => (v1 === true ? 'ON' : v1 === false ? 'OFF' : '?');
  return i ? `${v.name} — ${v.state}; ${i.relay1Name || 'Relay 1'} ${relay(i.relay1)}, ${i.relay2Name || 'Relay 2'} ${relay(i.relay2)}` : v.name;
};

/* ---------------- coordinates ---------------- */
function toSvg(e) {
  const el = svg.value;
  const pt = el.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const p = pt.matrixTransform(el.getScreenCTM().inverse());
  return { x: p.x, y: p.y };
}
const snapped = (p) => (props.snap ? { x: Math.round(p.x / 10) * 10, y: Math.round(p.y / 10) * 10 } : { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });
const scale = () => svg.value.getScreenCTM().a;

/* ---------------- pointer handling ---------------- */
let down = null; // active gesture
let drag = null; // item being dragged

function onPointerDown(e) {
  if (e.button !== undefined && e.button !== 0) return;
  const hit = e.target.closest?.('[data-kind]');
  const kind = hit?.dataset.kind;
  const p = toSvg(e);
  down = { pointerId: e.pointerId, cx: e.clientX, cy: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false, kind, id: hit?.dataset.id, p };
  drag = null;
  try { svg.value.setPointerCapture(e.pointerId); } catch { /* synthetic pointers can't be captured */ }

  const draggable = props.editable && props.tool === 'select';
  if (kind === 'light') {
    if (props.editable) emit('select', { type: 'light', id: hit.dataset.id });
    if (draggable) {
      const item = props.layout.lights.find((l) => l.id === hit.dataset.id);
      if (item) drag = { kind: 'light', id: item.id, orig: { x: item.x, y: item.y } };
    }
    return;
  }
  if (kind === 'label' && props.editable && props.tool !== 'road') {
    emit('select', { type: 'label', id: hit.dataset.id });
    const item = props.layout.labels.find((l) => l.id === hit.dataset.id);
    if (draggable && item) drag = { kind: 'label', id: item.id, orig: { x: item.x, y: item.y } };
    return;
  }
  if (kind === 'point' && draggable) {
    const seg = props.layout.segments.find((s) => s.id === hit.dataset.id);
    const index = Number(hit.dataset.index);
    if (seg) drag = { kind: 'point', id: seg.id, index, orig: { ...seg.points[index] } };
    return;
  }
  if (kind === 'segment' && props.editable && props.tool === 'select') {
    emit('select', { type: 'segment', id: hit.dataset.id });
    return;
  }

  // background (or a non-editable shape)
  if (props.editable && props.tool === 'road') {
    const s = snapped(p);
    const last = draft.value.at(-1);
    if (!last || Math.hypot(last.x - s.x, last.y - s.y) > 2) draft.value = [...draft.value, s];
    down.kind = 'draw';
  } else if (props.editable && props.tool === 'light') {
    emit('place-light', snapped(p));
    down.kind = 'placed';
  } else if (props.editable && props.tool === 'label') {
    emit('place-label', snapped(p));
    down.kind = 'placed';
  } else {
    panning.value = true; // select tool / view mode: drag the background to pan
  }
}

function onPointerMove(e) {
  if (!svg.value) return;
  hover.value = toSvg(e);
  if (!down || e.pointerId !== down.pointerId) return;
  if (!down.moved && Math.hypot(e.clientX - down.cx, e.clientY - down.cy) > 3) {
    down.moved = true;
    if (drag) emit('begin-edit');
  }
  if (!down.moved) return;

  if (drag) {
    const p = toSvg(e);
    const next = snapped({ x: drag.orig.x + (p.x - down.p.x), y: drag.orig.y + (p.y - down.p.y) });
    const L = props.layout;
    if (drag.kind === 'light') emit('update:layout', { ...L, lights: L.lights.map((l) => (l.id === drag.id ? { ...l, ...next } : l)) });
    else if (drag.kind === 'label') emit('update:layout', { ...L, labels: L.labels.map((l) => (l.id === drag.id ? { ...l, ...next } : l)) });
    else emit('update:layout', { ...L, segments: L.segments.map((s) => (s.id === drag.id ? { ...s, points: s.points.map((pt, i) => (i === drag.index ? next : pt)) } : s)) });
  } else if (panning.value) {
    const k = scale();
    vb.x -= (e.clientX - down.lastX) / k;
    vb.y -= (e.clientY - down.lastY) / k;
  }
  down.lastX = e.clientX;
  down.lastY = e.clientY;
}

function onPointerUp(e) {
  if (!down || e.pointerId !== down.pointerId) return;
  const wasClick = !down.moved;
  const { kind, id } = down;
  if (wasClick && kind === 'light' && !props.editable) emit('light-click', Number(props.layout.lights.find((l) => l.id === id)?.receiverId));
  if (wasClick && panning.value && props.editable) emit('select', null); // click on empty space clears selection
  panning.value = false;
  down = null;
  drag = null;
  try { svg.value.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
}

function onKeyDown(e) {
  const light = e.target.closest?.('[data-kind="light"]');
  if (light && !props.editable && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    emit('light-click', Number(props.layout.lights.find((l) => l.id === light.dataset.id)?.receiverId));
  }
  if (props.tool === 'road' && e.key === 'Enter') finishDraft();
  if (props.tool === 'road' && e.key === 'Escape') cancelDraft();
}

function onDoubleClick(e) {
  if (!props.editable) return;
  if (props.tool === 'road') {
    const d = draft.value;
    if (d.length >= 2 && Math.hypot(d.at(-1).x - d.at(-2).x, d.at(-1).y - d.at(-2).y) < 4) draft.value = d.slice(0, -1); // the double-click's extra point
    finishDraft();
    return;
  }
  const hit = e.target.closest?.('[data-kind="segment"]');
  if (hit && props.tool === 'select') {
    const seg = props.layout.segments.find((s) => s.id === hit.dataset.id);
    if (!seg || seg.points.length >= 60) return;
    const p = snapped(toSvg(e));
    const at = nearestEdgeIndex(seg.points, p.x, p.y) + 1;
    emit('begin-edit');
    const points = [...seg.points.slice(0, at), p, ...seg.points.slice(at)];
    emit('update:layout', { ...props.layout, segments: props.layout.segments.map((s) => (s.id === seg.id ? { ...s, points } : s)) });
  }
}

function onWheel(e) {
  const f = e.deltaY < 0 ? 0.88 : 1.14;
  zoomAt(toSvg(e), f);
}

function zoomAt(p, f) {
  const maxW = props.layout.canvas.width * 3;
  const minW = props.layout.canvas.width * 0.12;
  const w = Math.min(Math.max(vb.w * f, minW), maxW);
  const k = w / vb.w;
  vb.x = p.x - (p.x - vb.x) * k;
  vb.y = p.y - (p.y - vb.y) * k;
  vb.h *= k;
  vb.w = w;
}
const zoomBy = (f) => zoomAt({ x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 }, f);

function finishDraft() {
  if (draft.value.length >= 2) emit('add-segment', draft.value);
  draft.value = [];
}
function cancelDraft() { draft.value = []; }

defineExpose({ fit, zoomBy, finishDraft, cancelDraft, draftLength: computed(() => draft.value.length) });

const isSel = (type, id) => props.selection?.type === type && props.selection.id === id;
const selSegment = computed(() => (props.selection?.type === 'segment' ? props.layout.segments.find((s) => s.id === props.selection.id) : null));
const draftPath = computed(() => {
  const pts = hover.value && draft.value.length ? [...draft.value, snapped(hover.value)] : draft.value;
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
});
const empty = computed(() => !props.layout.segments.length && !props.layout.lights.length && !props.layout.labels.length);
</script>

<template>
  <div class="canvas-wrap" :class="{ editable }">
    <svg
      ref="svg"
      class="road-canvas"
      :class="[`tool-${editable ? tool : 'view'}`, { panning }]"
      :viewBox="viewBox"
      tabindex="0"
      role="application"
      aria-label="Road map"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel.prevent="onWheel"
      @dblclick="onDoubleClick"
      @keydown="onKeyDown"
      @pointerleave="hover = null"
    >
      <defs>
        <pattern id="grid-dots" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" class="grid-dot" />
        </pattern>
        <radialGradient id="lamp-glow">
          <stop offset="0%" stop-color="#fde68a" stop-opacity="0.95" />
          <stop offset="55%" stop-color="#fbbf24" stop-opacity="0.45" />
          <stop offset="100%" stop-color="#fbbf24" stop-opacity="0" />
        </radialGradient>
      </defs>

      <rect class="bg" :width="layout.canvas.width" :height="layout.canvas.height" rx="10" />
      <rect v-if="editable" :width="layout.canvas.width" :height="layout.canvas.height" fill="url(#grid-dots)" pointer-events="none" />

      <!-- asphalt -->
      <g class="roads">
        <template v-for="{ s, g } in geoms" :key="s.id">
          <path v-if="isSel('segment', s.id)" :d="g.centre" class="road-select" :stroke-width="g.width + 10" />
          <path :d="g.centre" class="asphalt" :stroke-width="g.width" data-kind="segment" :data-id="s.id" />
        </template>
      </g>
      <!-- markings sit above ALL asphalt so crossings don't hide each other -->
      <g class="markings" pointer-events="none">
        <template v-for="{ s, g } in geoms" :key="`m-${s.id}`">
          <path :d="g.leftEdge" class="edge-line" />
          <path :d="g.rightEdge" class="edge-line" />
          <path v-for="(d, i) in g.dividers" :key="i" :d="d" class="lane-line" />
        </template>
      </g>

      <!-- text labels -->
      <g class="labels">
        <text
          v-for="l in layout.labels"
          :key="l.id"
          :x="l.x"
          :y="l.y"
          :font-size="l.size"
          class="road-label"
          :class="{ selected: isSel('label', l.id) }"
          data-kind="label"
          :data-id="l.id"
        >{{ l.text }}</text>
      </g>

      <!-- road being drawn -->
      <g v-if="draft.length" class="draft" pointer-events="none">
        <path :d="draftPath" class="draft-line" />
        <circle v-for="(p, i) in draft" :key="i" :cx="p.x" :cy="p.y" r="5" class="handle" />
      </g>

      <!-- control points of the selected road -->
      <g v-if="editable && selSegment && tool === 'select'" class="handles">
        <circle
          v-for="(p, i) in selSegment.points"
          :key="i"
          :cx="p.x"
          :cy="p.y"
          r="8"
          class="handle drag"
          data-kind="point"
          :data-id="selSegment.id"
          :data-index="i"
          @contextmenu.prevent="emit('delete-point', { id: selSegment.id, index: i })"
        />
      </g>

      <!-- lights -->
      <g class="lights">
        <g
          v-for="l in layout.lights"
          :key="l.id"
          class="light"
          :class="{ selected: isSel('light', l.id), clickable: !editable }"
          :transform="`translate(${l.x} ${l.y})`"
          data-kind="light"
          :data-id="l.id"
          :data-receiver="l.receiverId"
          :data-state="lightView(l).state"
          :data-lit="lightView(l).lit"
          :tabindex="editable ? -1 : 0"
          role="button"
          :aria-label="tip(l)"
        >
          <title>{{ tip(l) }}</title>
          <!-- one glow per lit relay: relay 1 on the left, relay 2 on the right -->
          <circle v-if="lightView(l).info?.relay1 === true" cx="-15" r="32" class="glow glow-1" fill="url(#lamp-glow)" />
          <circle v-if="lightView(l).info?.relay2 === true" cx="15" r="32" class="glow glow-2" fill="url(#lamp-glow)" />
          <circle v-if="isSel('light', l.id)" r="25" class="sel-ring" />
          <circle r="17" class="base" />
          <g class="glyph" transform="translate(-11 -11) scale(0.92)">
            <path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.5.4.8 1 .8 1.6V16h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0012 3z" />
          </g>
          <line v-if="lightView(l).state === 'disabled'" x1="-12" y1="12" x2="12" y2="-12" class="slash" />
          <text v-if="lightView(l).state === 'missing'" y="5" class="qmark">?</text>
          <circle cx="-13" cy="26" r="4" class="relay-dot" :class="dotClass(lightView(l).info?.relay1)" data-relay="1" />
          <circle cx="13" cy="26" r="4" class="relay-dot" :class="dotClass(lightView(l).info?.relay2)" data-relay="2" />
          <text x="-13" y="40" class="relay-tag">{{ tag(lightView(l).info?.relay1Name, 'R1') }}</text>
          <text x="13" y="40" class="relay-tag">{{ tag(lightView(l).info?.relay2Name, 'R2') }}</text>
          <text y="56" class="light-name">{{ lightView(l).name }}</text>
        </g>
      </g>
    </svg>

    <div class="zoom">
      <button type="button" title="Zoom in" aria-label="Zoom in" @click="zoomBy(0.8)">+</button>
      <button type="button" title="Zoom out" aria-label="Zoom out" @click="zoomBy(1.25)">−</button>
      <button type="button" title="Fit to screen" aria-label="Fit to screen" @click="fit">⤢</button>
    </div>
    <div v-if="empty" class="empty-hint">
      {{ editable ? 'Empty road — pick “Draw road” and click on the canvas, or use a template.' : 'Nothing drawn on this road yet.' }}
    </div>
  </div>
</template>

<style scoped>
.canvas-wrap { position: relative; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; background: var(--surface-2); }
.road-canvas { display: block; width: 100%; height: min(66vh, 640px); min-height: 360px; outline: none; touch-action: none; cursor: grab; user-select: none; }
.road-canvas.panning { cursor: grabbing; }
.road-canvas.tool-road, .road-canvas.tool-light, .road-canvas.tool-label { cursor: crosshair; }

.bg { fill: var(--surface); stroke: var(--border); }
.grid-dot { fill: var(--border); }
.asphalt { fill: none; stroke: #3b4256; stroke-linejoin: round; stroke-linecap: round; }
.road-select { fill: none; stroke: var(--primary); stroke-opacity: 0.35; stroke-linejoin: round; stroke-linecap: round; }
.edge-line { fill: none; stroke: #e5e7eb; stroke-width: 2.2; stroke-linejoin: round; stroke-linecap: round; opacity: 0.9; }
.lane-line { fill: none; stroke: #fbbf24; stroke-width: 2; stroke-dasharray: 14 12; stroke-linejoin: round; }

.road-label { fill: var(--text); font-weight: 700; paint-order: stroke; stroke: var(--surface); stroke-width: 4px; cursor: default; }
.road-label.selected { fill: var(--primary); }
.editable .road-label { cursor: move; }

.draft-line { fill: none; stroke: var(--primary); stroke-width: 3; stroke-dasharray: 8 6; }
.handle { fill: #fff; stroke: var(--primary); stroke-width: 3; }
.handle.drag { cursor: move; }

.light { cursor: default; outline: none; }
.light.clickable { cursor: pointer; }
.editable .light { cursor: move; }
.light .base { fill: #94a3b8; stroke: #fff; stroke-width: 3; transition: fill 0.25s; filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35)); }
.light[data-state='online'] .base { fill: var(--green); }
.light[data-state='offline'] .base { fill: var(--red); }
.light[data-state='unknown'] .base { fill: #94a3b8; }
.light[data-state='disabled'] .base { fill: #cbd5e1; }
.light[data-state='missing'] .base { fill: #e2e8f0; stroke: #94a3b8; stroke-dasharray: 4 3; }
.light.clickable:hover .base, .light.clickable:focus-visible .base { stroke: var(--primary); stroke-width: 4; }
.glyph path { fill: none; stroke: #fff; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.light[data-state='disabled'] .glyph path, .light[data-state='missing'] .glyph path { stroke: #64748b; }
.slash { stroke: #64748b; stroke-width: 3; stroke-linecap: round; }
.qmark { text-anchor: middle; font-size: 18px; font-weight: 800; fill: #64748b; }
.glow { pointer-events: none; animation: pulse 2.6s ease-in-out infinite; }
.light[data-state='offline'] .glow, .light[data-state='unknown'] .glow { opacity: 0.5; animation: none; }
@keyframes pulse { 0%, 100% { opacity: 0.8; } 50% { opacity: 1; } }
.sel-ring { fill: none; stroke: var(--primary); stroke-width: 3; stroke-dasharray: 5 4; }

.relay-dot { stroke: #fff; stroke-width: 1.5; }
.relay-dot.on { fill: #22c55e; }
.relay-dot.off { fill: #94a3b8; }
.relay-dot.unk { fill: #fff; stroke: #94a3b8; }
.relay-tag { text-anchor: middle; font-size: 9px; font-weight: 700; fill: var(--text-muted); paint-order: stroke; stroke: var(--surface); stroke-width: 2px; }
.light-name { text-anchor: middle; font-size: 12px; font-weight: 700; fill: var(--text); paint-order: stroke; stroke: var(--surface); stroke-width: 3px; }

.zoom { position: absolute; right: 12px; top: 12px; display: flex; flex-direction: column; gap: 6px; }
.zoom button {
  width: 34px; height: 34px; border-radius: 9px; border: 1px solid var(--border); background: var(--surface);
  color: var(--text); font-size: 1.1rem; cursor: pointer; box-shadow: var(--shadow);
}
.zoom button:hover { background: var(--primary-soft); color: var(--primary); }
.empty-hint { position: absolute; inset: 0; display: grid; place-items: center; color: var(--text-muted); pointer-events: none; text-align: center; padding: 1rem; }
</style>
