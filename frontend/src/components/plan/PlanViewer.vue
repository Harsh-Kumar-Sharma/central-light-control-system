<script setup>
// Draws an uploaded CAD plan on a canvas (pan, scroll, zoom, rotate, layers, text) with the lights standing on it.
// Coordinates inside are the drawing's own, relative to geometry.origin. The parent passes and
// receives ABSOLUTE drawing coordinates (what is stored in the database).
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({
  geometry: { type: Object, required: true },
  hiddenLayers: { type: Object, default: () => new Set() },   // Set of layer names
  lights: { type: Array, default: () => [] },                  // { receiverId, name, enabled, online, relay1, relay2, plan:{x,y} }
  showText: { type: Boolean, default: true },
  showLabels: { type: Boolean, default: true },
  placing: { type: Boolean, default: false },                  // next click places a light
  movable: { type: Boolean, default: false },                  // lights can be dragged
  compact: { type: Boolean, default: false },                  // mini window: fewer controls
  fullscreenEl: { type: Object, default: null },               // element to put in full screen (defaults to this viewer)
  selectedId: { type: Number, default: null },
  viewKey: { type: String, default: '' },                      // remembers this plan's rotation (same key = same orientation everywhere)
});
const emit = defineEmits(['light-click', 'place', 'move', 'fullscreen-change']);

const root = ref(null);
const canvas = ref(null);
const overview = ref(null);
const size = { w: 0, h: 0, dpr: 1 };
// View: centre (world, relative to origin), pixels per drawing unit, and a rotation in radians
// (counter-clockwise on screen). The drawing is turned, the labels you read stay upright.
const view = { cx: 0, cy: 0, s: 1, r: 0 };
const isFullscreen = ref(false);
const wheelMode = ref(readLocal('planWheel') === 'zoom' ? 'zoom' : 'scroll');
const sb = ref({ show: false, hx: 0, hw: 100, vy: 0, vh: 100 }); // scrollbar thumbs, in percent of their track
let ro = null;
let themeObserver = null;
let frame = 0;
let fitted = false;
let fitBox = null; // { x1, y1, x2, y2 }: what "fit" and the scroll range are based on

function readLocal(k) { try { return localStorage.getItem(k); } catch { return null; } }
function writeLocal(k, v) { try { localStorage.setItem(k, v); } catch { /* not remembered */ } }

const origin = computed(() => props.geometry.origin);
const toRel = (x, y) => [x - origin.value[0], y - origin.value[1]];
const toAbs = (x, y) => [x + origin.value[0], y + origin.value[1]];

/* ---------------- theme colours ---------------- */
let theme = 'light';
let palette = [];
let ui = {};
function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const v = (n, f) => cs.getPropertyValue(n).trim() || f;
  ui = {
    bg: theme === 'dark' ? '#0c1530' : '#f6f8fd',
    online: v('--online', '#16a34a'), offline: v('--offline', '#e11d48'), unknown: v('--lamp-unknown', '#77849f'),
    glyph: v('--lamp-glyph', '#fff'), text: v('--text', '#111'), surface: v('--surface', '#fff'), primary: v('--primary', '#192496'),
  };
  palette = (props.geometry.palette ?? []).map(adapt);
}
// CAD colours assume a black background (white lines, dark blues). Keep them readable on either theme.
function adapt(hex) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255; let g = (n >> 8) & 255; let b = n & 255;
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (theme === 'dark' && luma < 0.32) { const t = 0.62; r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; }
  if (theme === 'light' && luma > 0.72) { const t = 0.62; r *= 1 - t; g *= 1 - t; b *= 1 - t; }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

/* ---------------- geometry -> Path2D, once ---------------- */
let built = null; // { layers: Map(name -> { groups:[{c, path}], texts }) }
function build() {
  const layers = new Map();
  for (const l of props.geometry.layers) {
    const byColor = new Map();
    const get = (c) => { if (!byColor.has(c)) byColor.set(c, new Path2D()); return byColor.get(c); };
    for (const p of l.polys) {
      const path = get(p[0]);
      path.moveTo(p[1], p[2]);
      for (let i = 3; i < p.length; i += 2) path.lineTo(p[i], p[i + 1]);
    }
    for (const [x, y, r, c] of l.circles) { const path = get(c); path.moveTo(x + r, y); path.arc(x, y, r, 0, Math.PI * 2); }
    layers.set(l.name, { groups: [...byColor].map(([c, path]) => ({ c, path })), texts: l.texts });
  }
  built = { layers };
}
const visibleLayers = () => [...built.layers].filter(([name]) => !props.hiddenLayers.has(name));

/* ---------------- what to fit: everything that is switched on ---------------- */
// The drawing's own "bounds" come from where its text sits. Fit uses the geometry that is actually showing
// (so hiding a layer changes the fit), ignoring a few stray points, but never wandering far from the main drawing.
function computeFitBox() {
  const core = props.geometry.bounds;
  const w = core.x2 - core.x1; const h = core.y2 - core.y1;
  // Look at the main drawing's neighbourhood (its text-based bounds, plus 60% each way).
  const reg = { x1: core.x1 - w * 0.6, x2: core.x2 + w * 0.6, y1: core.y1 - h * 0.6, y2: core.y2 + h * 0.6 };
  const G = 96;
  const cw = (reg.x2 - reg.x1) / G; const ch = (reg.y2 - reg.y1) / G;
  const cells = new Uint32Array(G * G);
  let total = 0;
  const add = (x, y) => {
    if (x < reg.x1 || x >= reg.x2 || y < reg.y1 || y >= reg.y2) return;
    cells[Math.floor((y - reg.y1) / ch) * G + Math.floor((x - reg.x1) / cw)] += 1;
    total += 1;
  };
  for (const l of props.geometry.layers) {
    if (props.hiddenLayers.has(l.name)) continue;
    for (const p of l.polys) {
      const step = p.length > 600 ? 8 : 2; // very long polylines: a sample is enough
      for (let i = 1; i < p.length; i += step) add(p[i], p[i + 1]);
    }
    for (const c of l.circles) add(c[0], c[1]);
    for (const t of l.texts) add(t[0], t[1]);
  }
  if (total < 20) return { ...core };
  // Fit everything that is showing near the main drawing. Only points far from it (stray CAD leftovers kilometres
  // away) are ignored, and the sparse ones in between stay in: a lone service road is still part of the drawing.
  let gx1 = G; let gx2 = -1; let gy1 = G; let gy2 = -1;
  for (let gy = 0; gy < G; gy++) {
    for (let gx = 0; gx < G; gx++) {
      if (cells[gy * G + gx] > 0) { gx1 = Math.min(gx1, gx); gx2 = Math.max(gx2, gx); gy1 = Math.min(gy1, gy); gy2 = Math.max(gy2, gy); }
    }
  }
  if (gx2 < 0) return { ...core };
  const box = { x1: reg.x1 + gx1 * cw, x2: reg.x1 + (gx2 + 1) * cw, y1: reg.y1 + gy1 * ch, y2: reg.y1 + (gy2 + 1) * ch };
  return box.x2 > box.x1 && box.y2 > box.y1 ? box : { ...core };
}

/* ---------------- rotation maths ---------------- */
const cosR = () => Math.cos(view.r);
const sinR = () => Math.sin(view.r);
const rot = (x, y, r = view.r) => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
function worldToScreen(x, y) {
  const [ru, rv] = rot(x - view.cx, y - view.cy);
  return [size.w / 2 + ru * view.s, size.h / 2 - rv * view.s];
}
function screenToWorld(px, py) {
  const ru = (px - size.w / 2) / view.s;
  const rv = -(py - size.h / 2) / view.s;
  const [du, dv] = rot(ru, rv, -view.r);
  return [view.cx + du, view.cy + dv];
}

/* ---------------- view ---------------- */
function rotatedExtent(box, r) {
  const pts = [[box.x1, box.y1], [box.x2, box.y1], [box.x2, box.y2], [box.x1, box.y2]].map(([x, y]) => rot(x, y, r));
  const us = pts.map((p) => p[0]); const vs = pts.map((p) => p[1]);
  return { u1: Math.min(...us), u2: Math.max(...us), v1: Math.min(...vs), v2: Math.max(...vs) };
}
function fit(redrawNow = true) {
  if (!size.w || !size.h) return;
  fitBox = computeFitBox();
  const e = rotatedExtent(fitBox, view.r);
  const bw = Math.max(e.u2 - e.u1, 1e-6); const bh = Math.max(e.v2 - e.v1, 1e-6);
  view.s = Math.min(size.w / bw, size.h / bh) * 0.92;
  const [cx, cy] = rot((e.u1 + e.u2) / 2, (e.v1 + e.v2) / 2, -view.r);
  view.cx = cx; view.cy = cy;
  fitted = true;
  if (redrawNow) redraw();
}
// Landscape screens suit a road that runs left to right. A drawing that is taller than wide is turned a quarter
// so it fills the width; the user's own choice (the rotate button) is remembered per plan.
function initialRotation() {
  const saved = props.viewKey ? readLocal(`planRot:${props.viewKey}`) : null;
  if (saved !== null && Number.isFinite(Number(saved))) return Number(saved) * (Math.PI / 2);
  const b = computeFitBox();
  return b.y2 - b.y1 > (b.x2 - b.x1) * 1.1 ? -Math.PI / 2 : 0;
}
function rotateBy(quarters) {
  view.r += quarters * (Math.PI / 2);
  if (props.viewKey) writeLocal(`planRot:${props.viewKey}`, String(Math.round(view.r / (Math.PI / 2))));
  fit();
}
function zoomAt(px, py, factor) {
  const before = screenToWorld(px, py);
  view.s = Math.min(Math.max(view.s * factor, 1e-4), 800);
  const ru = (px - size.w / 2) / view.s;
  const rv = -(py - size.h / 2) / view.s;
  const [du, dv] = rot(ru, rv, -view.r);
  view.cx = before[0] - du; view.cy = before[1] - dv;
  redraw();
}
const zoomBy = (f) => zoomAt(size.w / 2, size.h / 2, f);
// Move the content by (dx, dy) screen pixels, as if dragged.
function panBy(dx, dy) {
  const [du, dv] = rot(dx / view.s, -dy / view.s, -view.r);
  view.cx -= du; view.cy -= dv;
  redraw();
}

// Smoothly centre on an absolute point; zoom so ~`metres` of drawing are across the view.
function flyTo(ax, ay, metres = 120) {
  const [x, y] = toRel(ax, ay);
  const target = { cx: x, cy: y, s: Math.min(Math.max(size.w / metres, 0.02), 800) };
  const from = { ...view };
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min((now - t0) / 450, 1);
    const e = 1 - (1 - k) ** 3;
    view.cx = from.cx + (target.cx - from.cx) * e;
    view.cy = from.cy + (target.cy - from.cy) * e;
    view.s = from.s * (target.s / from.s) ** e;
    redraw();
    if (k < 1) setTimeout(() => step(performance.now()), 16);
  };
  step(performance.now());
}

/* ---------------- drawing ---------------- */
// Draw at most once per frame. A timer backs up requestAnimationFrame, which browsers pause for a hidden
// tab: without it a redraw queued while hidden would never run and later redraws would be swallowed.
let pending = false;
let timer = 0;
function redraw() {
  if (pending) return;
  pending = true;
  const run = () => {
    if (!pending) return;
    pending = false;
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    draw();
  };
  frame = requestAnimationFrame(run);
  timer = setTimeout(run, 120);
}

const BULB = new Path2D('M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z');
function stateColor(l) {
  if (!l.enabled) return ui.unknown;
  return l.online === true ? ui.online : l.online === false ? ui.offline : ui.unknown;
}
const isLit = (l) => l.relay1 === true || l.relay2 === true;
const markerR = () => (props.compact ? 9 : 12);

function draw() {
  const el = canvas.value;
  if (!el || !built || !size.w) return;
  const ctx = el.getContext('2d');
  const { dpr } = size;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = ui.bg;
  ctx.fillRect(0, 0, el.width, el.height);

  // the drawing, turned by view.r about the view centre
  const c = cosR(); const s = sinR(); const k = view.s;
  ctx.setTransform(dpr * k * c, -dpr * k * s, -dpr * k * s, -dpr * k * c,
    dpr * (size.w / 2 - k * (c * view.cx - s * view.cy)),
    dpr * (size.h / 2 + k * (s * view.cx + c * view.cy)));
  ctx.lineWidth = 1 / view.s;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const [, layer] of visibleLayers()) {
    for (const g of layer.groups) { ctx.strokeStyle = palette[g.c] ?? '#888'; ctx.stroke(g.path); }
  }

  // text, in screen space so it stays crisp
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (props.showText) {
    let drawn = 0;
    for (const [, layer] of visibleLayers()) {
      for (const [x, y, h, rotDeg, str, col, top] of layer.texts) {
        const px = h * view.s;
        if (px < 4.5 || px > 400) continue;
        const [sx, sy] = worldToScreen(x, y);
        if (sx < -300 || sy < -300 || sx > size.w + 300 || sy > size.h + 300) continue;
        if (++drawn > 3500) break;
        ctx.save();
        ctx.translate(sx, sy);
        const turn = (rotDeg * Math.PI) / 180 + view.r;
        if (turn) ctx.rotate(-turn);
        ctx.font = `${px.toFixed(1)}px sans-serif`;
        ctx.fillStyle = palette[col] ?? ui.text;
        ctx.textBaseline = top ? 'top' : 'alphabetic';
        str.split('\n').forEach((line, i) => ctx.fillText(line, 0, i * px * 1.2));
        ctx.restore();
      }
    }
  }

  drawLights(ctx);
  drawOverview();
  updateScrollbars();
}

function drawLights(ctx) {
  const r = markerR();
  for (const l of props.lights) {
    if (!l.plan) continue;
    const [x, y] = toRel(l.plan.x, l.plan.y);
    const [sx, sy] = worldToScreen(x, y);
    if (sx < -40 || sy < -40 || sx > size.w + 40 || sy > size.h + 40) continue;
    const color = stateColor(l);
    ctx.save();
    ctx.translate(sx, sy);
    if (isLit(l)) { ctx.shadowColor = 'rgba(251,191,36,0.95)'; ctx.shadowBlur = 18; ctx.beginPath(); ctx.arc(0, 0, r + 3, 0, 7); ctx.fillStyle = 'rgba(251,191,36,0.6)'; ctx.fill(); ctx.shadowBlur = 0; }
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7);
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = l.receiverId === props.selectedId ? 3.5 : 2.5;
    ctx.strokeStyle = l.receiverId === props.selectedId ? ui.primary : '#ffffff';
    ctx.stroke();
    const kk = (r * 1.15) / 24;
    ctx.translate(-12 * kk, -12 * kk); ctx.scale(kk, kk);
    ctx.lineWidth = 2.2; ctx.strokeStyle = ui.glyph; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke(BULB);
    ctx.restore();
    if (props.showLabels && !props.compact) {
      ctx.font = '600 11px sans-serif';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = ui.bg; ctx.strokeText(l.name, sx, sy + r + 4);
      ctx.fillStyle = ui.text; ctx.fillText(l.name, sx, sy + r + 4);
      ctx.textAlign = 'start';
    }
  }
}

/* ---------------- scrollbars ---------------- */
// The scroll range is the fitted drawing plus a margin all round, measured along the turned axes.
function updateScrollbars() {
  if (!fitBox || !size.w) return;
  const e = rotatedExtent(fitBox, view.r);
  const mu = (e.u2 - e.u1) * 0.3; const mv = (e.v2 - e.v1) * 0.3;
  const u1 = e.u1 - mu; const u2 = e.u2 + mu; const v1 = e.v1 - mv; const v2 = e.v2 + mv;
  const [uc, vc] = rot(view.cx, view.cy);
  const vw = size.w / view.s; const vh = size.h / view.s;
  const clamp = (n) => Math.min(Math.max(n, 0), 100);
  const hw = clamp((vw / (u2 - u1)) * 100);
  const hx = clamp(((uc - vw / 2 - u1) / (u2 - u1)) * 100);
  const vhh = clamp((vh / (v2 - v1)) * 100);
  const vy = clamp(((v2 - (vc + vh / 2)) / (v2 - v1)) * 100);
  const next = { show: true, hx: Math.min(hx, 100 - hw), hw, vy: Math.min(vy, 100 - vhh), vh: vhh };
  const old = sb.value;
  if (!old.show || Math.abs(old.hx - next.hx) > 0.1 || Math.abs(old.hw - next.hw) > 0.1 || Math.abs(old.vy - next.vy) > 0.1 || Math.abs(old.vh - next.vh) > 0.1) sb.value = next;
}
const sbDrag = { axis: null, startPx: 0, startCenter: 0, trackPx: 1 };
function sbRange(axis) {
  const e = rotatedExtent(fitBox, view.r);
  const mu = (e.u2 - e.u1) * 0.3; const mv = (e.v2 - e.v1) * 0.3;
  return axis === 'h' ? { lo: e.u1 - mu, hi: e.u2 + mu } : { lo: e.v1 - mv, hi: e.v2 + mv };
}
function setCenterAlong(axis, value) {
  const [uc, vc] = rot(view.cx, view.cy);
  const [cx, cy] = axis === 'h' ? rot(value, vc, -view.r) : rot(uc, value, -view.r);
  view.cx = cx; view.cy = cy;
  redraw();
}
function onSbDown(axis, e) {
  e.preventDefault();
  e.stopPropagation();
  const track = e.currentTarget.parentElement.getBoundingClientRect();
  const { lo, hi } = sbRange(axis);
  const [uc, vc] = rot(view.cx, view.cy);
  Object.assign(sbDrag, { axis, startPx: axis === 'h' ? e.clientX : e.clientY, startCenter: axis === 'h' ? uc : vc, trackPx: axis === 'h' ? track.width : track.height, span: hi - lo });
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
}
function onSbMove(e) {
  if (!sbDrag.axis) return;
  const d = (sbDrag.axis === 'h' ? e.clientX : e.clientY) - sbDrag.startPx;
  const delta = (d / sbDrag.trackPx) * sbDrag.span;
  setCenterAlong(sbDrag.axis, sbDrag.axis === 'h' ? sbDrag.startCenter + delta : sbDrag.startCenter - delta);
}
const onSbUp = () => { sbDrag.axis = null; };
function onTrackClick(axis, e) {
  if (e.target !== e.currentTarget) return;
  const r = e.currentTarget.getBoundingClientRect();
  const f = axis === 'h' ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
  const { lo, hi } = sbRange(axis);
  setCenterAlong(axis, axis === 'h' ? lo + f * (hi - lo) : hi - f * (hi - lo));
}

/* ---------------- overview (small map of the whole drawing) ---------------- */
let overviewBitmap = null;
const OV_W = 170;
const OV_H = 120;
function ovGeometry() {
  const e = rotatedExtent(fitBox ?? props.geometry.bounds, view.r);
  const sc = Math.min(OV_W / Math.max(e.u2 - e.u1, 1e-6), OV_H / Math.max(e.v2 - e.v1, 1e-6)) * 0.92;
  return { sc, uc: (e.u1 + e.u2) / 2, vc: (e.v1 + e.v2) / 2 };
}
const toOv = (x, y, g) => { const [u, v] = rot(x, y); return [OV_W / 2 + (u - g.uc) * g.sc, OV_H / 2 - (v - g.vc) * g.sc]; };
function buildOverview() {
  if (!built) return;
  const g = ovGeometry();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const off = document.createElement('canvas');
  off.width = OV_W * dpr; off.height = OV_H * dpr;
  const c = off.getContext('2d');
  const co = Math.cos(view.r); const si = Math.sin(view.r);
  const k = g.sc;
  c.setTransform(dpr * k * co, -dpr * k * si, -dpr * k * si, -dpr * k * co,
    dpr * (OV_W / 2 - k * g.uc * 1 + 0), dpr * (OV_H / 2 + k * g.vc));
  // x' = k(co x - si y) - k uc + W/2 ; y' = -k(si x + co y) + k vc + H/2  -> matches toOv
  c.lineWidth = 1 / k;
  c.strokeStyle = theme === 'dark' ? 'rgba(160,178,230,0.85)' : 'rgba(40,52,100,0.8)';
  for (const [, layer] of visibleLayers()) for (const gr of layer.groups) c.stroke(gr.path);
  overviewBitmap = { off, g };
}
function drawOverview() {
  const el = overview.value;
  if (!el || !overviewBitmap) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (el.width !== OV_W * dpr) { el.width = OV_W * dpr; el.height = OV_H * dpr; }
  const c = el.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, el.width, el.height);
  c.drawImage(overviewBitmap.off, 0, 0);
  const { g } = overviewBitmap;
  for (const l of props.lights) {
    if (!l.plan) continue;
    const [x, y] = toRel(l.plan.x, l.plan.y);
    const [ox, oy] = toOv(x, y, g);
    c.beginPath(); c.arc(ox * dpr, oy * dpr, 2.4 * dpr, 0, 7); c.fillStyle = stateColor(l); c.fill();
  }
  // where the main view is looking: the screen's four corners, mapped back into the drawing
  const corners = [[0, 0], [size.w, 0], [size.w, size.h], [0, size.h]].map(([px, py]) => { const [wx, wy] = screenToWorld(px, py); return toOv(wx, wy, g); });
  c.beginPath();
  corners.forEach(([x, y], i) => (i ? c.lineTo(x * dpr, y * dpr) : c.moveTo(x * dpr, y * dpr)));
  c.closePath();
  c.lineWidth = 1.5 * dpr; c.strokeStyle = ui.primary; c.fillStyle = 'rgba(120,140,255,0.16)';
  c.fill(); c.stroke();
}
function overviewPointer(e) {
  if (!overviewBitmap) return;
  const rect = overview.value.getBoundingClientRect();
  const px = ((e.clientX - rect.left) / rect.width) * OV_W;
  const py = ((e.clientY - rect.top) / rect.height) * OV_H;
  const { g } = overviewBitmap;
  const u = g.uc + (px - OV_W / 2) / g.sc;
  const v = g.vc - (py - OV_H / 2) / g.sc;
  const [cx, cy] = rot(u, v, -view.r);
  view.cx = cx; view.cy = cy;
  redraw();
}
let ovDrag = false;
const onOvDown = (e) => { ovDrag = true; try { overview.value.setPointerCapture(e.pointerId); } catch { /* ignore */ } overviewPointer(e); };
const onOvMove = (e) => { if (ovDrag) overviewPointer(e); };
const onOvUp = () => { ovDrag = false; };

/* ---------------- pointer: pan, zoom, click lights, place, drag lights ---------------- */
const pointers = new Map();
let drag = null; // { mode:'pan'|'light', startX, startY, moved, id, lastX, lastY }
let pinch = null;
const localXY = (e) => { const r = canvas.value.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
function lightAt(px, py) {
  const r = markerR() + 5;
  let best = null; let bestD = Infinity;
  for (const l of props.lights) {
    if (!l.plan) continue;
    const [x, y] = toRel(l.plan.x, l.plan.y);
    const [sx, sy] = worldToScreen(x, y);
    const d = Math.hypot(sx - px, sy - py);
    if (d <= r && d < bestD) { best = l; bestD = d; }
  }
  return best;
}
function onDown(e) {
  try { canvas.value.setPointerCapture(e.pointerId); } catch { /* not an active pointer (e.g. a synthetic event): dragging still works without capture */ }
  const [px, py] = localXY(e);
  pointers.set(e.pointerId, [px, py]);
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { dist: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1 };
    drag = null;
    return;
  }
  const hit = props.placing ? null : lightAt(px, py);
  drag = { mode: hit && props.movable ? 'light' : 'pan', id: hit?.receiverId ?? null, hit, startX: px, startY: py, moved: false, lastX: px, lastY: py };
}
function onMove(e) {
  const [px, py] = localXY(e);
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [px, py]);
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
    zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, dist / pinch.dist);
    pinch.dist = dist;
    return;
  }
  if (!drag) { updateCursor(px, py); return; }
  const dx = px - drag.lastX; const dy = py - drag.lastY;
  if (!drag.moved && Math.hypot(px - drag.startX, py - drag.startY) > 4) drag.moved = true;
  if (!drag.moved) return;
  if (drag.mode === 'pan') {
    panBy(dx, dy);
    canvas.value.style.cursor = 'grabbing';
  } else {
    const l = props.lights.find((x) => x.receiverId === drag.id);
    if (l) { const [wx, wy] = screenToWorld(px, py); const [ax, ay] = toAbs(wx, wy); l.plan = { x: ax, y: ay }; }
    redraw();
  }
  drag.lastX = px; drag.lastY = py;
}
function onUp(e) {
  const [px, py] = localXY(e);
  pointers.delete(e.pointerId);
  if (pinch) { if (pointers.size < 2) pinch = null; drag = null; return; }
  if (!drag) return;
  const d = drag; drag = null;
  updateCursor(px, py);
  if (d.mode === 'light' && d.moved) {
    const l = props.lights.find((x) => x.receiverId === d.id);
    if (l?.plan) emit('move', { receiverId: d.id, x: l.plan.x, y: l.plan.y });
    return;
  }
  if (d.moved) return;
  if (props.placing) { const [wx, wy] = screenToWorld(px, py); const [ax, ay] = toAbs(wx, wy); emit('place', { x: ax, y: ay }); return; }
  if (d.hit) emit('light-click', d.hit.receiverId);
}
function updateCursor(px, py) {
  const el = canvas.value; if (!el) return;
  if (props.placing) el.style.cursor = 'crosshair';
  else el.style.cursor = lightAt(px, py) ? (props.movable ? 'move' : 'pointer') : 'grab';
}
// Mouse wheel: scrolls the drawing (up/down; Shift or a sideways wheel scrolls left/right) and Ctrl/Cmd+wheel
// zooms. The "Wheel" button flips it so the wheel zooms and Ctrl scrolls. Trackpad pinch arrives as Ctrl+wheel.
function onWheel(e) {
  e.preventDefault();
  const [px, py] = localXY(e);
  const zoomWheel = wheelMode.value === 'zoom' ? !(e.ctrlKey || e.metaKey) : (e.ctrlKey || e.metaKey);
  // One mouse notch is about 100; a trackpad pinch sends many small steps. Capping each event keeps both gentle.
  if (zoomWheel) { zoomAt(px, py, Math.exp(-Math.max(-50, Math.min(50, e.deltaY)) * 0.01)); return; }
  const unit = e.deltaMode === 1 ? 32 : 1;
  const dx = (e.shiftKey ? e.deltaY : e.deltaX) * unit;
  const dy = (e.shiftKey ? 0 : e.deltaY) * unit;
  panBy(-dx, -dy);
}
function toggleWheel() {
  wheelMode.value = wheelMode.value === 'scroll' ? 'zoom' : 'scroll';
  writeLocal('planWheel', wheelMode.value);
}
function onDblClick(e) {
  if (props.placing) return;
  const [px, py] = localXY(e);
  if (!lightAt(px, py)) zoomAt(px, py, 2);
}
function onKey(e) {
  if (e.target !== canvas.value) return;
  if (e.key === '+' || e.key === '=') zoomBy(1.4);
  else if (e.key === '-') zoomBy(1 / 1.4);
  else if (e.key === '0') fit();
  else if (e.key === 'r' || e.key === 'R') rotateBy(e.shiftKey ? 1 : -1);
  else if (e.key === 'ArrowLeft') panBy(80, 0);
  else if (e.key === 'ArrowRight') panBy(-80, 0);
  else if (e.key === 'ArrowUp') panBy(0, 80);
  else if (e.key === 'ArrowDown') panBy(0, -80);
  else return;
  e.preventDefault();
}

/* ---------------- full screen ---------------- */
// Real browser full screen where it works. Where it does not (iPhone/iPad Safari, an embedded frame, a
// refused request) the parent is told to fill the window instead ("page full screen"), so the button always works.
const fsTarget = () => props.fullscreenEl ?? root.value;
const pseudo = ref(false);
const nativeFs = () => Boolean(document.fullscreenElement) && Boolean(fsTarget()?.contains(root.value));
function announce() {
  const now = nativeFs() || pseudo.value;
  if (now !== isFullscreen.value) { isFullscreen.value = now; emit('fullscreen-change', now); }
  setTimeout(resize, 60);
  setTimeout(resize, 300);
}
async function toggleFullscreen() {
  if (pseudo.value) { pseudo.value = false; announce(); return; }
  if (document.fullscreenElement) { await document.exitFullscreen().catch(() => {}); return; }
  try {
    const el = fsTarget();
    if (!el?.requestFullscreen) throw new Error('unsupported');
    await el.requestFullscreen();
  } catch {
    pseudo.value = true;
    announce();
  }
}
const onFsChange = announce;
function onDocKey(e) { if (e.key === 'Escape' && pseudo.value) { pseudo.value = false; announce(); } }

/* ---------------- sizing + lifecycle ---------------- */
function resize() {
  const el = canvas.value; if (!el || !root.value) return;
  const w = Math.round(root.value.clientWidth); const h = Math.round(root.value.clientHeight);
  if (!w || !h) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (w === size.w && h === size.h && dpr === size.dpr) return;
  const first = !size.w;
  Object.assign(size, { w, h, dpr });
  el.width = Math.round(w * dpr); el.height = Math.round(h * dpr);
  if (first || !fitted) fit(); else redraw();
}

function setup() {
  readTheme();
  build();
  view.r = initialRotation();
  fitBox = computeFitBox();
  buildOverview();
  fitted = false;
  resize();
  if (size.w) fit();
}

onMounted(() => {
  setup();
  ro = new ResizeObserver(resize);
  ro.observe(root.value);
  themeObserver = new MutationObserver(() => { readTheme(); buildOverview(); redraw(); });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('keydown', onDocKey);
});
onBeforeUnmount(() => {
  ro?.disconnect();
  themeObserver?.disconnect();
  document.removeEventListener('fullscreenchange', onFsChange);
  document.removeEventListener('keydown', onDocKey);
  cancelAnimationFrame(frame);
  clearTimeout(timer);
  pending = false;
});

watch(() => props.geometry, setup);
// Hiding or showing layers changes what "everything" is: refit to what is showing.
watch(() => [...props.hiddenLayers].join('|'), () => { buildOverview(); fit(); });
watch(() => [props.showText, props.showLabels, props.selectedId, props.compact], redraw);
watch(() => props.lights, redraw, { deep: true });
watch(() => props.placing, () => updateCursor(-1, -1));

defineExpose({ fit, zoomBy, flyTo, toggleFullscreen, rotateBy, isFullscreen });

</script>

<template>
  <div ref="root" class="plan-viewer" :class="{ compact, fs: isFullscreen }">
    <canvas
      ref="canvas"
      tabindex="0"
      role="application"
      aria-label="Plan drawing. Scroll with the mouse wheel, hold Control to zoom, drag to pan. Keys: plus and minus zoom, arrows move, R rotates, 0 fits."
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @wheel="onWheel"
      @dblclick="onDblClick"
      @keydown="onKey"
    />

    <!-- scrollbars: same thing as dragging, just visible -->
    <div v-if="sb.show" class="sbar h" aria-hidden="true" @pointerdown="onTrackClick('h', $event)">
      <i :style="{ left: sb.hx + '%', width: sb.hw + '%' }" @pointerdown="onSbDown('h', $event)" @pointermove="onSbMove" @pointerup="onSbUp" @pointercancel="onSbUp" />
    </div>
    <div v-if="sb.show" class="sbar v" aria-hidden="true" @pointerdown="onTrackClick('v', $event)">
      <i :style="{ top: sb.vy + '%', height: sb.vh + '%' }" @pointerdown="onSbDown('v', $event)" @pointermove="onSbMove" @pointerup="onSbUp" @pointercancel="onSbUp" />
    </div>

    <div class="tools" role="group" aria-label="Map controls">
      <button type="button" title="Zoom in" aria-label="Zoom in" @click="zoomBy(1.5)">+</button>
      <button type="button" title="Zoom out" aria-label="Zoom out" @click="zoomBy(1 / 1.5)">−</button>
      <button type="button" title="Fit everything to the screen" aria-label="Fit everything to the screen" data-action="fit" @click="fit()">⤢</button>
      <button type="button" title="Turn the drawing a quarter (R)" aria-label="Rotate the drawing" data-action="rotate" @click="rotateBy(-1)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 11-3-6.7M21 4v5h-5" /></svg>
      </button>
      <button v-if="!compact" type="button" class="wheel" :class="{ on: wheelMode === 'zoom' }" :title="wheelMode === 'scroll' ? 'Mouse wheel scrolls (Ctrl+wheel zooms). Click to make the wheel zoom instead.' : 'Mouse wheel zooms (Ctrl+wheel scrolls). Click to make the wheel scroll instead.'" :aria-label="wheelMode === 'scroll' ? 'Wheel scrolls; switch to zoom' : 'Wheel zooms; switch to scroll'" data-action="wheel" @click="toggleWheel">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="3" width="10" height="18" rx="5" /><path d="M12 7v4" /></svg>
      </button>
      <button type="button" :title="isFullscreen ? 'Leave full screen' : 'Full screen'" :aria-label="isFullscreen ? 'Leave full screen' : 'Full screen'" data-action="fullscreen" @click="toggleFullscreen">
        <svg v-if="!isFullscreen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>
      </button>
      <slot name="tools" />
    </div>
    <canvas
      v-if="!compact || isFullscreen"
      ref="overview"
      class="overview"
      :width="170"
      :height="120"
      aria-label="Overview of the whole drawing. Click or drag to move the view."
      @pointerdown="onOvDown"
      @pointermove="onOvMove"
      @pointerup="onOvUp"
    />
    <div v-if="placing" class="hint-pill">Click the plan where the light is</div>
    <slot />
  </div>
</template>

<style scoped>
.plan-viewer { position: relative; width: 100%; height: 100%; min-height: 220px; overflow: hidden; background: var(--surface-2); isolation: isolate; user-select: none; }
canvas { display: block; width: 100%; height: 100%; touch-action: none; outline: none; }
canvas:focus-visible { box-shadow: inset 0 0 0 2px var(--primary); }
.tools { position: absolute; top: 10px; right: 20px; display: flex; flex-direction: column; gap: 6px; z-index: 2; }
.tools :deep(button), .tools button {
  width: 34px; height: 34px; display: grid; place-items: center; border-radius: 9px; border: 1px solid var(--border);
  background: var(--surface); color: var(--text); font: inherit; font-size: 1.15rem; font-weight: 700; cursor: pointer; box-shadow: var(--shadow); padding: 0;
}
.tools :deep(button:hover), .tools button:hover { background: var(--primary-soft); color: var(--primary); }
.tools button.on { background: var(--primary); color: var(--on-primary); }
.tools svg { width: 17px; height: 17px; }
.compact .tools button { width: 28px; height: 28px; font-size: 1rem; }
.compact .tools svg { width: 15px; height: 15px; }
.overview { position: absolute; left: 10px; bottom: 22px; width: 170px; height: 120px; z-index: 2; border: 1px solid var(--border); border-radius: 10px; background: color-mix(in srgb, var(--surface) 88%, transparent); box-shadow: var(--shadow); cursor: crosshair; }
.hint-pill { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 2; padding: 0.4rem 0.9rem; border-radius: 999px; background: var(--primary); color: var(--on-primary); font-weight: 700; font-size: 0.85rem; box-shadow: var(--shadow); pointer-events: none; }
.plan-viewer.fs { background: var(--surface-2); }

/* scrollbars */
.sbar { position: absolute; z-index: 3; background: color-mix(in srgb, var(--text) 8%, transparent); }
.sbar.h { left: 0; right: 12px; bottom: 0; height: 12px; }
.sbar.v { top: 0; bottom: 12px; right: 0; width: 12px; }
.sbar i { position: absolute; display: block; border-radius: 6px; background: color-mix(in srgb, var(--text) 38%, transparent); cursor: grab; touch-action: none; }
.sbar.h i { top: 2px; bottom: 2px; min-width: 24px; }
.sbar.v i { left: 2px; right: 2px; min-height: 24px; }
.sbar i:hover, .sbar i:active { background: var(--primary); }
</style>
