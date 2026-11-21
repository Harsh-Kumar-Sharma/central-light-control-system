// Shared helpers for the e2e tests. See e2e.mjs.
// (was: End-to-end API test against a running backend + the device simulator (backend/sim/simulator.js).
//   API=http://localhost:4100 SIM=http://127.0.0.1:4200 ADMIN_PW=... node backend/sim/e2e.mjs [section ...]
// Needs an EMPTY, freshly migrated + seeded database (it creates its own devices, groups, ...).
const API = process.env.API ?? 'http://localhost:4100';
const SIM = process.env.SIM ?? 'http://127.0.0.1:4200';
const ADMIN = { username: 'admin', password: process.env.ADMIN_PW ?? 'SimAdmin#2026' };

export const results = [];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '   <-- ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400)}`);
  return ok;
}

let token = null;
export const setToken = (t) => { token = t; };
export async function api(method, path, body, tok = token) {
  const res = await fetch(API + '/api' + path, {
    method,
    headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}
export const sim = async (method, path, body) => (await fetch(SIM + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json();
export async function login(u = ADMIN.username, p = ADMIN.password) {
  const r = await api('POST', '/auth/login', { username: u, password: p }, null);
  return r.status === 200 ? r.data.token : null;
}
export async function waitFor(fn, ms = 20000, step = 500) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(step); }
  return null;
}

export const sections = {};
export const section = (name, fn) => { sections[name] = fn; };
export const ctx = {}; // shared ids between sections

