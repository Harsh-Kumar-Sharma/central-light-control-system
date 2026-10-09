// Drawings are big, so they are downloaded once and kept for the whole session.
// The full-page viewer and the floating mini map share this cache.
import { plansApi } from '../api/resources.js';

const geometries = new Map(); // planId -> Promise<geometry>

export function loadGeometry(id) {
  const key = Number(id);
  if (!geometries.has(key)) {
    const p = plansApi.geometry(key);
    p.catch(() => geometries.delete(key)); // a failed download must be retried next time
    geometries.set(key, p);
  }
  return geometries.get(key);
}
export const forgetGeometry = (id) => geometries.delete(Number(id));
