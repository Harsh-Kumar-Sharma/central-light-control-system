// Geometry for drawing roads as SVG: smoothing, lane offsets, path strings.
export const LANE_W = 28;
export const SHOULDER = 8;

export const roadWidth = (lanes) => lanes * LANE_W + SHOULDER * 2;

// Catmull-Rom through the points, sampled into a dense polyline.
export function samplePath(points, curved) {
  if (!curved || points.length < 3) return points.map((p) => ({ x: p.x, y: p.y }));
  const out = [];
  const n = points.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, n - 1)];
    for (let t = 0; t < 1; t += 1 / 14) {
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push({ x: points[n - 1].x, y: points[n - 1].y });
  return out;
}

// Shifts a polyline sideways by d (positive = to the left of travel), using
// averaged vertex normals so corners stay connected.
export function offsetPolyline(pts, d) {
  if (d === 0 || pts.length < 2) return pts;
  const normals = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    const len = Math.hypot(dx, dy) || 1;
    normals.push({ x: -dy / len, y: dx / len });
  }
  return pts.map((p, i) => {
    const a = normals[Math.max(i - 1, 0)];
    const b = normals[Math.min(i, normals.length - 1)];
    let nx = a.x + b.x;
    let ny = a.y + b.y;
    const len = Math.hypot(nx, ny);
    if (len < 0.2) { nx = a.x; ny = a.y; } else { nx /= len; ny /= len; }
    const dot = Math.max(nx * a.x + ny * a.y, 0.5); // limit the miter
    return { x: p.x + (nx * d) / dot, y: p.y + (ny * d) / dot };
  });
}

export const toPath = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

// Everything needed to draw one segment.
export function segmentGeometry(segment) {
  const centre = samplePath(segment.points, segment.curved);
  const width = roadWidth(segment.lanes);
  const half = width / 2;
  const dividers = [];
  for (let i = 1; i < segment.lanes; i++) dividers.push(toPath(offsetPolyline(centre, (i - segment.lanes / 2) * LANE_W)));
  return {
    width,
    centre: toPath(centre),
    leftEdge: toPath(offsetPolyline(centre, half - 4)),
    rightEdge: toPath(offsetPolyline(centre, -(half - 4))),
    dividers,
  };
}

// Index of the segment edge closest to (x, y) in the raw (control) points,
// used to insert a new point where the road was double-clicked.
export function nearestEdgeIndex(points, x, y) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
    const dist = Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
    if (dist < bestDist) { bestDist = dist; best = i; }
  }
  return best;
}
