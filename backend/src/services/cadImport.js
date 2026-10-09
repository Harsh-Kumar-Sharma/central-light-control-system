// Turns a CAD drawing (DWG or DXF) into compact vector geometry the browser can draw.
//
//   DWG -> LibreDWG (WebAssembly)   [GPL-3.0, see docs/RUNBOOK.md before redistributing]
//   DXF -> dxf-parser               [MIT]
//
// Both readers are first turned into one canonical shape (adapters below), so the
// real work - expanding blocks, sampling arcs and bulges, colours, bounds - exists once.
//
// Output (all coordinates are relative to `origin`, rounded to 3 decimals):
//   { version, origin:[x,y], bounds:{x1,y1,x2,y2}, palette:[hex], units,
//     layers:[{ name, color, hidden, polys:[[colorIdx, x,y,x,y,...]], circles:[[x,y,r,colorIdx]],
//               texts:[[x,y,height,rotationDeg,string,colorIdx,top]] }] }
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import DxfParser from 'dxf-parser';

const MAX_PRIMITIVES = 600_000;   // stop expanding blocks beyond this
const MAX_VERTICES = 6_000_000;
const MAX_DEPTH = 6;

/* ---------------- colours (AutoCAD index colours) ---------------- */
const BASE = ['#000000', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffffff', '#414141', '#808080'];
function hsv(h, s, v) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(Math.min(k, 4 - k, 1), 0); };
  return `#${[f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`;
}
const SHADES = [[1, 1], [0.5, 1], [1, 0.65], [0.5, 0.65], [1, 0.5], [0.5, 0.5], [1, 0.3], [0.5, 0.3], [1, 0.15], [0.5, 0.15]];
export function aciColor(i) {
  if (i >= 1 && i <= 9) return i === 8 ? '#808080' : i === 9 ? '#c0c0c0' : BASE[i];
  if (i >= 10 && i <= 249) { const [s, v] = SHADES[(i - 10) % 10]; return hsv(Math.floor((i - 10) / 10) * 15, s, v); }
  if (i >= 250 && i <= 255) return ['#333333', '#505050', '#696969', '#828282', '#bebebe', '#ffffff'][i - 250];
  return '#ffffff';
}

/* ---------------- text ---------------- */
export function cleanText(raw) {
  return String(raw ?? '')
    .replace(/\\P/gi, '\n')
    .replace(/\\~/g, ' ')
    .replace(/\\[A-Za-z][^;\\]*;/g, '')          // \fArial|b0; \C1; \H2.5; ...
    .replace(/\\S([^^;]*)\^([^;]*);/g, '$1/$2')   // stacked fractions
    .replace(/[{}]/g, '')
    .replace(/%%[uo]/gi, '')                          // underline / overline switches
    .replace(/%%d/gi, '°').replace(/%%p/gi, '±').replace(/%%c/gi, 'Ø').replace(/%%%/g, '%')
    .replace(/\\\\/g, '\\')
    .trim();
}

/* ---------------- geometry helpers ---------------- */
const TAU = Math.PI * 2;
function sampleArc(cx, cy, r, a0, a1, ccw = true) {
  let span = ccw ? a1 - a0 : a0 - a1;
  while (span <= 0) span += TAU;
  while (span > TAU) span -= TAU;
  const steps = Math.max(6, Math.ceil(span / (Math.PI / 36))); // every 5 degrees
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = ccw ? a0 + (span * i) / steps : a0 - (span * i) / steps;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

// The arc a polyline "bulge" describes between two vertices, as extra points (excluding the ends).
function bulgePoints(p1, p2, bulge) {
  const theta = 4 * Math.atan(bulge);
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const chord = Math.hypot(dx, dy);
  if (chord === 0 || Math.abs(theta) < 1e-6) return [];
  const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
  const mx = (p1[0] + p2[0]) / 2;
  const my = (p1[1] + p2[1]) / 2;
  const h = Math.sqrt(Math.max(r * r - (chord / 2) ** 2, 0));
  const sign = bulge > 0 ? 1 : -1;
  const cx = mx - (sign * h * dy) / chord;
  const cy = my + (sign * h * dx) / chord;
  const a0 = Math.atan2(p1[1] - cy, p1[0] - cx);
  const pts = sampleArc(cx, cy, r, a0, a0 + theta, bulge > 0);
  return pts.slice(1, -1);
}

function polyWithBulges(verts, closed) {
  const out = [];
  const n = verts.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < n; i++) {
    out.push([verts[i].x, verts[i].y]);
    if (i < segs && verts[i].bulge) out.push(...bulgePoints([verts[i].x, verts[i].y], [verts[(i + 1) % n].x, verts[(i + 1) % n].y], verts[i].bulge));
  }
  if (closed && n > 1) out.push([verts[0].x, verts[0].y]);
  return out;
}

/* 2D affine matrix [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f */
const IDENT = [1, 0, 0, 1, 0, 0];
const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const insertMatrix = (p, sx, sy, rot, base) => {
  const c = Math.cos(rot); const s = Math.sin(rot);
  return mul([1, 0, 0, 1, p.x, p.y], mul([c * sx, s * sx, -s * sy, c * sy, 0, 0], [1, 0, 0, 1, -(base?.x ?? 0), -(base?.y ?? 0)]));
};
const rotOf = (m) => Math.atan2(m[1], m[0]);
const scaleOf = (m) => Math.hypot(m[0], m[1]);

/* ---------------- adapters: reader output -> canonical entities ----------------
 * canonical kinds:
 *   poly   { pts:[{x,y,bulge?}], closed }
 *   circle { c:{x,y}, r }
 *   arc    { c:{x,y}, r, a0, a1 }              (radians, counter-clockwise)
 *   ellipse{ c, major:{x,y}, ratio, a0, a1 }
 *   text   { p:{x,y}, h, rot (rad), text, top }
 *   insert { name, p, sx, sy, rot (rad), cols, rows, dx, dy }
 *   hatch  { loops:[[[x,y],...]] }
 * each also carries { layer, colorIndex, trueColor }
 */
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const common = (e) => ({ layer: e.layer ?? '0', colorIndex: e.colorIndex, trueColor: e.trueColor ?? e.color });

function fromLibreDwg(e) {
  const c = common(e);
  switch (e.type) {
    case 'LINE': return [{ ...c, kind: 'poly', pts: [e.startPoint, e.endPoint], closed: false }];
    case 'LWPOLYLINE': case 'POLYLINE2D': case 'POLYLINE3D':
      return e.vertices?.length > 1 ? [{ ...c, kind: 'poly', pts: e.vertices, closed: Boolean(num(e.flag) & 512) }] : []; // DWG flag: 512 = closed
    case 'CIRCLE': return [{ ...c, kind: 'circle', c: e.center, r: e.radius }];
    case 'ARC': return [{ ...c, kind: 'arc', c: e.center, r: e.radius, a0: e.startAngle, a1: e.endAngle }];
    case 'ELLIPSE': return e.center && e.majorAxisEndPoint ? [{ ...c, kind: 'ellipse', c: e.center, major: e.majorAxisEndPoint, ratio: e.axisRatio, a0: e.startAngle ?? 0, a1: e.endAngle ?? TAU }] : [];
    case 'TEXT': return e.startPoint ? [{ ...c, kind: 'text', p: e.startPoint, h: e.textHeight, rot: num(e.rotation), text: e.text, top: false }] : [];
    case 'MTEXT': {
      const rot = e.direction ? Math.atan2(e.direction.y, e.direction.x) : num(e.rotation);
      return e.insertionPoint ? [{ ...c, kind: 'text', p: e.insertionPoint, h: e.height ?? e.textHeight, rot, text: e.text, top: true }] : [];
    }
    case 'INSERT': return e.insertionPoint ? [{ ...c, kind: 'insert', name: e.name, p: e.insertionPoint, sx: num(e.xScale, 1), sy: num(e.yScale, 1), rot: num(e.rotation), cols: Math.max(1, num(e.columnCount, 1)), rows: Math.max(1, num(e.rowCount, 1)), dx: num(e.columnSpacing), dy: num(e.rowSpacing) }] : [];
    case 'LEADER': return e.vertices?.length > 1 ? [{ ...c, kind: 'poly', pts: e.vertices, closed: false }] : [];
    case 'SPLINE': {
      const pts = e.fitPoints?.length > 1 ? e.fitPoints : e.controlPoints;
      return pts?.length > 1 ? [{ ...c, kind: 'poly', pts, closed: false }] : [];
    }
    case 'HATCH': {
      const loops = [];
      for (const path of e.boundaryPaths ?? []) {
        const pts = [];
        for (const edge of path.edges ?? []) {
          if (edge.type === 1 && edge.start && edge.end) { if (!pts.length) pts.push([edge.start.x, edge.start.y]); pts.push([edge.end.x, edge.end.y]); }
          else if (edge.type === 2 && edge.center) {
            const ccw = edge.isCCW !== false && edge.counterClockwise !== false;
            pts.push(...sampleArc(edge.center.x, edge.center.y, edge.radius, edge.startAngle, edge.endAngle, ccw));
          }
        }
        if (pts.length > 1) loops.push(pts);
      }
      return loops.length ? [{ ...c, kind: 'hatch', loops }] : [];
    }
    default: return [];
  }
}

const rad = (deg) => (num(deg) * Math.PI) / 180;
function fromDxfParser(e) {
  const c = { layer: e.layer ?? '0', colorIndex: e.colorNumber ?? e.colorIndex, trueColor: e.color };
  switch (e.type) {
    case 'LINE': return e.vertices?.length >= 2 ? [{ ...c, kind: 'poly', pts: e.vertices.slice(0, 2), closed: false }] : [];
    case 'LWPOLYLINE': case 'POLYLINE':
      return e.vertices?.length > 1 ? [{ ...c, kind: 'poly', pts: e.vertices, closed: Boolean(e.shape) }] : [];
    case 'CIRCLE': return [{ ...c, kind: 'circle', c: e.center, r: e.radius }];
    case 'ARC': return [{ ...c, kind: 'arc', c: e.center, r: e.radius, a0: e.startAngle, a1: e.endAngle }]; // already radians
    case 'ELLIPSE': return e.center && e.majorAxisEndPoint ? [{ ...c, kind: 'ellipse', c: e.center, major: e.majorAxisEndPoint, ratio: e.axisRatio, a0: e.startAngle ?? 0, a1: e.endAngle ?? TAU }] : [];
    case 'TEXT': return e.startPoint ? [{ ...c, kind: 'text', p: e.startPoint, h: e.textHeight, rot: rad(e.rotation), text: e.text, top: false }] : [];
    case 'MTEXT': return e.position ? [{ ...c, kind: 'text', p: e.position, h: e.height, rot: rad(e.rotation), text: e.text, top: true }] : [];
    case 'INSERT': return e.position ? [{ ...c, kind: 'insert', name: e.name, p: e.position, sx: num(e.xScale, 1), sy: num(e.yScale, 1), rot: rad(e.rotation), cols: Math.max(1, num(e.columnCount, 1)), rows: Math.max(1, num(e.rowCount, 1)), dx: num(e.columnSpacing), dy: num(e.rowSpacing) }] : [];
    case 'SPLINE': {
      const pts = e.fitPoints?.length > 1 ? e.fitPoints : e.controlPoints;
      return pts?.length > 1 ? [{ ...c, kind: 'poly', pts, closed: false }] : [];
    }
    default: return [];
  }
}

/* ---------------- readers ---------------- */
let libredwgPromise = null;
async function getLibreDwg() {
  if (!libredwgPromise) {
    libredwgPromise = (async () => {
      const { LibreDwg } = await import('@mlightcad/libredwg-web');
      const entry = fileURLToPath(import.meta.resolve('@mlightcad/libredwg-web'));
      const wasmDir = `${path.resolve(path.dirname(entry), '..', 'wasm')}${path.sep}`;
      return LibreDwg.create(wasmDir);
    })();
    libredwgPromise.catch(() => { libredwgPromise = null; });
  }
  return libredwgPromise;
}

async function readDwg(buffer) {
  const { Dwg_File_Type } = await import('@mlightcad/libredwg-web');
  const lib = await getLibreDwg();
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const dwg = lib.dwg_read_data(ab, Dwg_File_Type.DWG);
  if (!dwg) throw Object.assign(new Error('This DWG could not be read. Save it as an older DWG version or as DXF and try again.'), { code: 'UNREADABLE' });
  const db = lib.convert(dwg);
  try { lib.dwg_free(dwg); } catch { /* freed with the instance */ }

  const records = db.tables?.BLOCK_RECORD?.entries ?? [];
  const model = records.find((r) => /^\*model_space$/i.test(r.name));
  const modelEntities = model?.entities?.length ? model.entities : (db.entities ?? []).filter((e) => !model || e.ownerBlockRecordSoftId === model.handle);
  const blocks = new Map();
  for (const r of records) if (r.entities?.length && !/^\*(model|paper)_space/i.test(r.name)) blocks.set(r.name, { base: r.basePoint, entities: r.entities });
  const layers = (db.tables?.LAYER?.entries ?? []).map((l) => ({ name: l.name, colorIndex: Math.abs(num(l.colorIndex, 7)), hidden: Boolean(l.frozen || l.off) }));
  return { modelEntities, blocks, layers, adapt: fromLibreDwg, units: db.header?.INSUNITS };
}

function readDxf(buffer) {
  const text = buffer.toString('utf8');
  const log = console.log;
  let d;
  try {
    d = new DxfParser().parseSync(text);
  } catch (err) {
    throw Object.assign(new Error(`This DXF could not be read (${err.message}).`), { code: 'UNREADABLE' });
  } finally {
    console.log = log;
  }
  if (!d?.entities) throw Object.assign(new Error('This DXF has no drawing in it.'), { code: 'UNREADABLE' });
  const blocks = new Map();
  for (const [name, b] of Object.entries(d.blocks ?? {})) blocks.set(name, { base: b.position, entities: b.entities ?? [] });
  const layers = Object.values(d.tables?.layer?.layers ?? {}).map((l) => ({ name: l.name, colorIndex: Math.abs(num(l.colorIndex, 7)), hidden: Boolean(l.frozen || l.visible === false) }));
  return { modelEntities: d.entities, blocks, layers, adapt: fromDxfParser, units: d.header?.$INSUNITS };
}

const UNITS = { 0: null, 1: 'inches', 2: 'feet', 3: 'miles', 4: 'millimetres', 5: 'centimetres', 6: 'metres', 7: 'kilometres', 8: 'microinches', 9: 'mils', 10: 'yards' };

/* ---------------- main ---------------- */
export function detectType(buffer, filename = '') {
  if (buffer.length > 6 && /^AC10\d\d/.test(buffer.subarray(0, 6).toString('latin1'))) return 'dwg';
  if (/\.dwg$/i.test(filename)) return 'dwg';
  const head = buffer.subarray(0, 4000).toString('utf8');
  if (/^\s*0\s*\r?\n\s*SECTION/m.test(head) || /\.dxf$/i.test(filename)) return 'dxf';
  return null;
}

export async function importCad(buffer, filename = '') {
  const type = detectType(buffer, filename);
  if (!type) throw Object.assign(new Error('Upload a DWG or DXF file.'), { code: 'UNSUPPORTED' });
  const src = type === 'dwg' ? await readDwg(buffer) : readDxf(buffer);

  const layerInfo = new Map(src.layers.map((l) => [l.name, l]));
  const layerColor = (name) => aciColor(layerInfo.get(name)?.colorIndex ?? 7);
  const palette = [];
  const paletteIdx = new Map();
  const colorIdx = (hex) => { let i = paletteIdx.get(hex); if (i === undefined) { i = palette.length; palette.push(hex); paletteIdx.set(hex, i); } return i; };

  const out = new Map(); // layer name -> { polys, circles, texts }
  const bucket = (name) => { if (!out.has(name)) out.set(name, { polys: [], circles: [], texts: [] }); return out.get(name); };
  const stats = { drawn: {}, skipped: {}, truncated: false };
  const count = (k, kind) => { stats[k][kind] = (stats[k][kind] ?? 0) + 1; };
  let primitives = 0;
  let vertices = 0;

  // sums for a robust view of the drawing
  const xs = [];
  const ys = [];
  const note = (x, y) => { if (xs.length < 400_000) { xs.push(x); ys.push(y); } };
  const tx = [];
  const ty = [];

  function colourFor(ent, ctx, layerName) {
    const ci = ent.colorIndex;
    if (ci === 0) return ctx.color ?? layerColor(layerName);
    if (ci === undefined || ci === null || ci === 256 || ci === 257) return layerColor(layerName);
    return aciColor(Math.abs(ci));
  }

  function emit(ent, m, ctx, depth) {
    if (primitives > MAX_PRIMITIVES || vertices > MAX_VERTICES) { stats.truncated = true; return; }
    const layerName = ent.layer === '0' && ctx.layer ? ctx.layer : ent.layer;
    const color = colorIdx(colourFor(ent, ctx, layerName));
    const b = () => bucket(layerName);
    const addPoly = (pts) => {
      if (pts.length < 2) return;
      const flat = [color];
      for (const [x, y] of pts) { const [wx, wy] = apply(m, x, y); if (!Number.isFinite(wx) || !Number.isFinite(wy)) return; flat.push(wx, wy); note(wx, wy); }
      b().polys.push(flat);
      primitives += 1;
      vertices += pts.length;
    };

    switch (ent.kind) {
      case 'poly': {
        const closed = ent.closed;
        const any = ent.pts.some((p) => p.bulge);
        const pts = any ? polyWithBulges(ent.pts, closed) : ent.pts.map((p) => [p.x, p.y]).concat(closed && ent.pts.length > 1 ? [[ent.pts[0].x, ent.pts[0].y]] : []);
        addPoly(pts); count('drawn', 'poly'); break;
      }
      case 'circle': {
        const [cx, cy] = apply(m, ent.c.x, ent.c.y);
        if (![cx, cy, ent.r].every(Number.isFinite)) break;
        b().circles.push([cx, cy, ent.r * scaleOf(m), color]);
        note(cx, cy); primitives += 1; count('drawn', 'circle'); break;
      }
      case 'arc': addPoly(sampleArc(ent.c.x, ent.c.y, ent.r, ent.a0, ent.a1)); count('drawn', 'arc'); break;
      case 'ellipse': {
        const a = Math.hypot(ent.major.x, ent.major.y);
        const rot = Math.atan2(ent.major.y, ent.major.x);
        const pts = sampleArc(0, 0, 1, ent.a0, ent.a1).map(([u, v]) => {
          const ex = a * u; const ey = a * (ent.ratio ?? 1) * v;
          return [ent.c.x + ex * Math.cos(rot) - ey * Math.sin(rot), ent.c.y + ex * Math.sin(rot) + ey * Math.cos(rot)];
        });
        addPoly(pts); count('drawn', 'ellipse'); break;
      }
      case 'hatch': for (const loop of ent.loops) addPoly(loop); count('drawn', 'hatch'); break;
      case 'text': {
        const text = cleanText(ent.text);
        const h = num(ent.h);
        if (!text || h <= 0) break;
        const [wx, wy] = apply(m, ent.p.x, ent.p.y);
        if (![wx, wy].every(Number.isFinite)) break;
        if (tx.length < 100_000) { tx.push(wx); ty.push(wy); }
        b().texts.push([wx, wy, +(h * scaleOf(m)).toFixed(3), +(((ent.rot + rotOf(m)) * 180) / Math.PI).toFixed(2), text.slice(0, 200), color, ent.top ? 1 : 0]);
        primitives += 1; count('drawn', 'text'); break;
      }
      case 'insert': {
        if (depth >= MAX_DEPTH) { count('skipped', 'INSERT (too deep)'); break; }
        const blk = src.blocks.get(ent.name);
        if (!blk) { count('skipped', 'INSERT (missing block)'); break; }
        const nested = { layer: layerName, color: colourFor(ent, ctx, layerName) };
        for (let r = 0; r < ent.rows; r++) {
          for (let c = 0; c < ent.cols; c++) {
            const p = { x: ent.p.x + c * ent.dx, y: ent.p.y + r * ent.dy };
            const mm = mul(m, insertMatrix(p, ent.sx, ent.sy, ent.rot, blk.base));
            for (const raw of blk.entities) for (const sub of src.adapt(raw)) emit(sub, mm, nested, depth + 1);
          }
        }
        count('drawn', 'insert'); break;
      }
      default: break;
    }
  }

  for (const raw of src.modelEntities) {
    if (raw.isVisible === false) continue;
    const canon = src.adapt(raw);
    if (!canon.length) { if (raw.type) count('skipped', raw.type); continue; }
    for (const e of canon) emit(e, IDENT, {}, 0);
  }

  // A sensible first view. CAD files often carry stray geometry far from the real drawing (a block
  // dropped kilometres away, a point left at 0,0), so "everything" can be mostly empty space.
  // The drawing's own text (chainages, labels, tables) sits where the drawing really is, so it is the
  // best guide; without enough text, fall back to ignoring the outermost 0.5% of points.
  const sorted = (arr) => [...arr].sort((p, q) => p - q);
  const pick = (arr, p) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor((arr.length - 1) * p)))];
  let core;
  if (tx.length >= 30) {
    const sx = sorted(tx); const sy = sorted(ty);
    core = { x1: pick(sx, 0.02), x2: pick(sx, 0.98), y1: pick(sy, 0.02), y2: pick(sy, 0.98) };
  } else if (xs.length) {
    const sx = sorted(xs); const sy = sorted(ys);
    core = { x1: pick(sx, 0.005), x2: pick(sx, 0.995), y1: pick(sy, 0.005), y2: pick(sy, 0.995) };
  } else {
    core = { x1: 0, y1: 0, x2: 100, y2: 100 };
  }
  const grow = (box, f) => {
    const w = Math.max(box.x2 - box.x1, 1); const h = Math.max(box.y2 - box.y1, 1);
    return { x1: box.x1 - w * f, x2: box.x2 + w * f, y1: box.y1 - h * f, y2: box.y2 + h * f };
  };
  const bounds = grow(core, 0.08);
  const near = grow(core, 0.3); // "inside the main drawing" for the layer check below
  const origin = [Math.round((bounds.x1 + bounds.x2) / 2), Math.round((bounds.y1 + bounds.y2) / 2)];

  const r3 = (n) => Math.round(n * 1000) / 1000;
  const shift = (flat) => flat.map((v, i) => (i === 0 ? v : r3(v - origin[(i - 1) % 2])));
  // Shapes much longer than the whole drawing are CAD leftovers (an oversized block, a runaway line):
  // they would cut straight across the map, so they are dropped and counted.
  const maxDiag = Math.hypot(core.x2 - core.x1, core.y2 - core.y1) * 2;
  const tooLong = (p) => {
    let x1 = Infinity; let x2 = -Infinity; let y1 = Infinity; let y2 = -Infinity;
    for (let i = 1; i < p.length; i += 2) { x1 = Math.min(x1, p[i]); x2 = Math.max(x2, p[i]); y1 = Math.min(y1, p[i + 1]); y2 = Math.max(y2, p[i + 1]); }
    return Math.hypot(x2 - x1, y2 - y1) > maxDiag;
  };
  let dropped = 0;
  for (const data of out.values()) {
    const keep = data.polys.filter((p) => !tooLong(p));
    dropped += data.polys.length - keep.length;
    data.polys = keep;
  }
  if (dropped) stats.skipped['oversized shapes'] = dropped;

  const layers = [];
  for (const [name, data] of out) {
    const info = layerInfo.get(name);
    const items = data.polys.length + data.circles.length + data.texts.length;
    if (!items) continue;
    // Many items, but mostly far from the main drawing: stray geometry. Off by default (one tick turns it on).
    // Judged by every vertex, not only where each shape starts: a block dropped on the road but scaled
    // up to cover kilometres starts inside the drawing and still fills the map with stray lines.
    let inside = 0;
    let total = 0;
    for (const p of data.polys) {
      for (let i = 1; i < p.length; i += 2) {
        total += 1;
        if (p[i] >= near.x1 && p[i] <= near.x2 && p[i + 1] >= near.y1 && p[i + 1] <= near.y2) inside += 1;
      }
    }
    const stray = data.polys.length > 150 && total > 0 && inside / total < 0.4;
    layers.push({
      name,
      color: layerColor(name),
      hidden: (info ? info.hidden : false) || stray,
      stray,
      count: items,
      polys: data.polys.map(shift),
      circles: data.circles.map(([x, y, r, c]) => [r3(x - origin[0]), r3(y - origin[1]), r3(r), c]),
      texts: data.texts.map(([x, y, h, rot, s, c, top]) => [r3(x - origin[0]), r3(y - origin[1]), h, rot, s, c, top]),
    });
  }
  layers.sort((a, b) => b.count - a.count);

  const shiftedBounds = { x1: r3(bounds.x1 - origin[0]), x2: r3(bounds.x2 - origin[0]), y1: r3(bounds.y1 - origin[1]), y2: r3(bounds.y2 - origin[1]) };
  const geometry = { version: 1, origin, bounds: shiftedBounds, palette, units: UNITS[src.units] ?? null, layers };
  return {
    type,
    geometry,
    summary: {
      units: geometry.units,
      origin,
      bounds,
      layers: layers.map((l) => ({ name: l.name, color: l.color, count: l.count, hidden: l.hidden, stray: l.stray })),
      stats,
    },
  };
}
