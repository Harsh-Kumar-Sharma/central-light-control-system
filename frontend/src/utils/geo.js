// Small geography helpers for the GPS map. Points are [latitude, longitude] pairs.

const R = 6371008.8; // mean Earth radius, metres
const rad = (d) => (d * Math.PI) / 180;

export function distanceM(a, b) {
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pathLengthM(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceM(points[i - 1], points[i]);
  return total;
}

export const kmText = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`);

// A guess at a road's route from where its lights stand: order them along the
// line between the two that are furthest apart. Right for straight stretches,
// only approximate for bends - which is why the map labels it "estimated".
export function estimateRoute(points) {
  if (points.length < 2) return null;
  let a = points[0];
  let b = points[1];
  let best = -1;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = distanceM(points[i], points[j]);
      if (d > best) { best = d; a = points[i]; b = points[j]; }
    }
  }
  if (best <= 0) return null; // all lights on the same spot
  // Work in a flat local grid (metres) around the first point.
  const cos = Math.cos(rad(a[0]));
  const flat = (p) => [(p[1] - a[1]) * cos, p[0] - a[0]];
  const ab = flat(b);
  const len2 = ab[0] ** 2 + ab[1] ** 2;
  const t = (p) => { const q = flat(p); return (q[0] * ab[0] + q[1] * ab[1]) / len2; };
  return [...points].sort((p, q) => t(p) - t(q));
}
