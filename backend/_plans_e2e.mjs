import fs from 'node:fs';
import zlib from 'node:zlib';
import { pool } from './src/db/pool.js';
import { env } from './src/config/env.js';
import jwt from 'jsonwebtoken';

const B = 'http://localhost:4000/api';
const [[admin]] = await pool.query("SELECT u.id, u.username, r.name role FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='Admin' ORDER BY u.id LIMIT 1");
const tok = jwt.sign({ sub: admin.id, username: admin.username, role: admin.role }, env.jwt.secret, { expiresIn: '40m' });
const H = { authorization: 'Bearer ' + tok };
const j = async (m, p, body) => {
  const r = await fetch(B + p, { method: m, headers: { 'content-type': 'application/json', ...H }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, b: await r.json().catch(() => ({})), h: r.headers };
};
let pass = 0; let fail = 0;
const check = (label, cond, extra = '') => { (cond ? pass++ : fail++); console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`); };

const file = fs.readFileSync('C:/Users/Harsh/Downloads/MCW-PLAN.dwg COS (1).dwg');
const up = (body, name, plan) => fetch(B + '/plans/upload', { method: 'POST', headers: { ...H, 'content-type': 'application/octet-stream', 'x-filename': encodeURIComponent(name), 'x-plan-name': encodeURIComponent(plan) }, body });

console.log('--- upload ---');
const t0 = Date.now();
const r = await up(file, 'MCW-PLAN.dwg COS (1).dwg', 'MCW Plan (test)');
const out = await r.json();
check('real DWG uploaded', r.status === 201, `${r.status} in ${Date.now() - t0} ms ${JSON.stringify(out).slice(0, 160)}`);
const id = out.id;
check('garbage file -> 422 with a readable message', (await (async () => { const x = await up(Buffer.from('hello'), 'x.txt', 'bad'); const b = await x.json(); return x.status === 422 && /DWG or DXF/.test(b.error.message); })()));
check('empty body -> 400', (await up(Buffer.alloc(0), 'x.dwg', 'e')).status === 400);

console.log('--- read back ---');
const list = await j('GET', '/plans');
const row = list.b.plans.find((p) => p.id === id);
check('listed with name, type, size, stats', row && row.name === 'MCW Plan (test)' && row.source_type === 'dwg' && row.size_bytes === file.length && row.stats.drawn.text > 1000, JSON.stringify({ n: row?.name, t: row?.source_type }));
const det = await j('GET', `/plans/${id}`);
check('details: 49 layers, 2 hidden by default (stray)', det.b.plan.layers.length === 49 && det.b.plan.layers.filter((l) => l.hidden).length === 2, `${det.b.plan.layers.length} / hidden ${det.b.plan.layers.filter((l) => l.hidden).map((l) => l.name)}`);
const gRes = await fetch(`${B}/plans/${id}/geometry`, { headers: H });
check('geometry is gzip JSON', gRes.status === 200 && gRes.headers.get('content-encoding') === 'gzip');
const geom = await gRes.json(); // fetch decompresses
check('geometry content', geom.layers.length === 49 && geom.origin.length === 2 && geom.palette.length > 3, `layers=${geom.layers.length}`);
const etag = gRes.headers.get('etag');
check('conditional request -> 304', (await fetch(`${B}/plans/${id}/geometry`, { headers: { ...H, 'if-none-match': etag } })).status === 304);
const src = await fetch(`${B}/plans/${id}/source`, { headers: H });
check('original file can be downloaded unchanged', src.status === 200 && Buffer.from(await src.arrayBuffer()).equals(file));

console.log('--- layers ---');
check('save hidden layers', (await j('PUT', `/plans/${id}/layers`, { hidden: ['0', 'furniture', 'Survey'] })).s === 200);
const det2 = await j('GET', `/plans/${id}`);
check('saved choice replaces the defaults', det2.b.plan.customised && det2.b.plan.layers.filter((l) => l.hidden).length === 3);
check('bad layer list -> 400', (await j('PUT', `/plans/${id}/layers`, { hidden: 'x' })).s === 400);
check('null restores defaults', (await j('PUT', `/plans/${id}/layers`, { hidden: null })).s === 200 && !(await j('GET', `/plans/${id}`)).b.plan.customised);
check('rename', (await j('PUT', `/plans/${id}`, { name: 'MCW Plan (renamed)' })).s === 200);
check('empty name -> 400', (await j('PUT', `/plans/${id}`, { name: ' ' })).s === 400);

console.log('--- placing lights ---');
const lights = await j('GET', `/plans/${id}/lights`);
const rx = lights.b.lights[0];
check('lights listed with live data and no position yet', lights.s === 200 && rx.plan === null && 'online' in rx);
check('place a light', (await j('PUT', `/plans/${id}/lights/${rx.receiverId}`, { x: 400508, y: 1574970 })).s === 200);
const again = (await j('GET', `/plans/${id}/lights`)).b.lights.find((l) => l.receiverId === rx.receiverId);
check('position stored in drawing coordinates', again.plan && again.plan.x === 400508 && again.plan.y === 1574970);
check('moving updates, not duplicates', (await j('PUT', `/plans/${id}/lights/${rx.receiverId}`, { x: 400600, y: 1575000 })).s === 200 && (await pool.query('SELECT COUNT(*) n FROM plan_lights WHERE plan_id = ?', [id]))[0][0].n === 1);
check('text instead of numbers -> 400', (await j('PUT', `/plans/${id}/lights/${rx.receiverId}`, { x: '1', y: 'a' })).s === 400);
check('half a position -> 400', (await j('PUT', `/plans/${id}/lights/${rx.receiverId}`, { x: 5, y: null })).s === 400);
check('unknown light -> 404', (await j('PUT', `/plans/${id}/lights/999999`, { x: 1, y: 1 })).s === 404);
check('unknown plan -> 404', (await j('GET', '/plans/99999/lights')).s === 404);
check('list shows 1 placed light', (await j('GET', '/plans')).b.plans.find((p) => p.id === id).light_count === 1);
console.log('PLAN_ID', id);
console.log(`RESULT: ${pass} passed, ${fail} failed`);
await pool.end();
