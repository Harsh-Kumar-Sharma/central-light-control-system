// Validates and normalises a road drawing before it is stored. Only known
// fields survive, so the stored JSON can't carry arbitrary extra data, and
// size limits keep a layout well inside the request body limit.

const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
const LIMITS = { segments: 200, pointsPerSegment: 60, lights: 500, labels: 200 };
const COORD_MIN = -2000;
const COORD_MAX = 8000;

export const emptyLayout = () => ({ version: 1, canvas: { width: 1200, height: 700 }, segments: [], lights: [], labels: [] });

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const r1 = (v) => Math.round(v * 10) / 10;
const inRange = (v) => isNum(v) && v >= COORD_MIN && v <= COORD_MAX;

function uniqueIds(items, what) {
  const seen = new Set();
  for (const item of items) {
    if (!ID_PATTERN.test(item.id ?? '')) return `${what} has a missing or invalid id`;
    if (seen.has(item.id)) return `duplicate ${what} id "${item.id}"`;
    seen.add(item.id);
  }
  return null;
}

export function validateLayout(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'layout must be an object' };

  const canvasIn = input.canvas ?? {};
  const width = canvasIn.width ?? 1200;
  const height = canvasIn.height ?? 700;
  if (!isNum(width) || !isNum(height) || width < 400 || width > 6000 || height < 300 || height > 6000) {
    return { error: 'canvas width must be 400–6000 and height 300–6000' };
  }

  const segIn = input.segments ?? [];
  const lightIn = input.lights ?? [];
  const labelIn = input.labels ?? [];
  if (![segIn, lightIn, labelIn].every(Array.isArray)) return { error: 'segments, lights and labels must be arrays' };
  if (segIn.length > LIMITS.segments) return { error: `at most ${LIMITS.segments} road segments` };
  if (lightIn.length > LIMITS.lights) return { error: `at most ${LIMITS.lights} lights per road` };
  if (labelIn.length > LIMITS.labels) return { error: `at most ${LIMITS.labels} labels` };

  const segments = [];
  for (const s of segIn) {
    if (!Array.isArray(s.points) || s.points.length < 2 || s.points.length > LIMITS.pointsPerSegment) {
      return { error: `each road segment needs 2–${LIMITS.pointsPerSegment} points` };
    }
    if (!s.points.every((p) => p && inRange(p.x) && inRange(p.y))) return { error: 'road points must be numbers inside the canvas range' };
    const lanes = s.lanes ?? 2;
    if (!Number.isInteger(lanes) || lanes < 1 || lanes > 8) return { error: 'lanes must be a whole number from 1 to 8' };
    segments.push({ id: s.id, points: s.points.map((p) => ({ x: r1(p.x), y: r1(p.y) })), lanes, curved: s.curved === true });
  }

  const lights = [];
  const usedReceivers = new Set();
  for (const l of lightIn) {
    if (!Number.isInteger(l.receiverId) || l.receiverId <= 0) return { error: 'every light must be linked to a receiver' };
    if (usedReceivers.has(l.receiverId)) return { error: `receiver ${l.receiverId} is placed more than once on this road` };
    usedReceivers.add(l.receiverId);
    if (!inRange(l.x) || !inRange(l.y)) return { error: 'light position must be numbers inside the canvas range' };
    if (l.label != null && (typeof l.label !== 'string' || l.label.length > 40)) return { error: 'light label can be at most 40 characters' };
    lights.push({ id: l.id, receiverId: l.receiverId, x: r1(l.x), y: r1(l.y), ...(l.label ? { label: l.label } : {}) });
  }

  const labels = [];
  for (const l of labelIn) {
    if (typeof l.text !== 'string' || l.text.trim() === '' || l.text.length > 80) return { error: 'label text is required (max 80 characters)' };
    if (!inRange(l.x) || !inRange(l.y)) return { error: 'label position must be numbers inside the canvas range' };
    const size = l.size ?? 16;
    if (!isNum(size) || size < 10 || size > 48) return { error: 'label size must be 10–48' };
    labels.push({ id: l.id, text: l.text, x: r1(l.x), y: r1(l.y), size });
  }

  const idError = uniqueIds(segments, 'segment') ?? uniqueIds(lights, 'light') ?? uniqueIds(labels, 'label');
  if (idError) return { error: idError };

  return { layout: { version: 1, canvas: { width, height }, segments, lights, labels } };
}
