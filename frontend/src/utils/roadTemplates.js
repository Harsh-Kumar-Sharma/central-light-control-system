// Starting layouts for the road designer. Each takes the receivers to place
// (as many lights as receivers given) and returns a complete layout object.
import { roadWidth } from './roadGeometry.js';

export const newId = (prefix) => `${prefix}${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;

export const emptyLayout = () => ({ version: 1, canvas: { width: 1200, height: 700 }, segments: [], lights: [], labels: [] });

const light = (receiver, x, y) => ({ id: newId('l'), receiverId: receiver.id, x: Math.round(x), y: Math.round(y) });

// One straight road across the canvas. sides: 'one' (all on top) or 'both' (alternating).
export function straightRoad({ receivers, lanes = 2, sides = 'both', width = 1200, height = 700 }) {
  const cy = height / 2;
  const offset = roadWidth(lanes) / 2 + 32;
  const lights = [];
  const sideOf = (i) => (sides === 'one' || i % 2 === 0 ? -1 : 1);
  const perSide = { '-1': 0, '1': 0 };
  receivers.forEach((_, i) => { perSide[sideOf(i)] += 1; });
  const seen = { '-1': 0, '1': 0 };
  const x0 = 130;
  const span = width - 260;
  receivers.forEach((rx, i) => {
    const s = sideOf(i);
    const x = x0 + ((seen[s] + 0.5) * span) / perSide[s];
    seen[s] += 1;
    lights.push(light(rx, x, cy + s * offset));
  });
  return {
    version: 1,
    canvas: { width, height },
    segments: [{ id: newId('s'), points: [{ x: 60, y: cy }, { x: width - 60, y: cy }], lanes, curved: false }],
    lights,
    labels: [],
  };
}

// Two roads crossing in the middle, with lights along each of the four arms.
export function crossroad({ receivers, lanes = 2, perArm = 2 }) {
  const width = 1000;
  const height = 800;
  const cx = width / 2;
  const cy = height / 2;
  const offset = roadWidth(lanes) / 2 + 32;
  const arms = [
    (d, side) => ({ x: cx - d, y: cy + side * offset }), // west
    (d, side) => ({ x: cx + d, y: cy + side * offset }), // east
    (d, side) => ({ x: cx + side * offset, y: cy - d }), // north
    (d, side) => ({ x: cx + side * offset, y: cy + d }), // south
  ];
  const lights = [];
  let n = 0;
  for (const arm of arms) {
    for (let i = 0; i < perArm && n < receivers.length; i++, n++) {
      const p = arm(170 + i * 110, i % 2 === 0 ? -1 : 1);
      lights.push(light(receivers[n], p.x, p.y));
    }
  }
  return {
    version: 1,
    canvas: { width, height },
    segments: [
      { id: newId('s'), points: [{ x: 50, y: cy }, { x: width - 50, y: cy }], lanes, curved: false },
      { id: newId('s'), points: [{ x: cx, y: 50 }, { x: cx, y: height - 50 }], lanes, curved: false },
    ],
    lights,
    labels: [],
  };
}
