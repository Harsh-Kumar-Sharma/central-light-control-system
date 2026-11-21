// End-to-end API test against a running backend + the device simulator (backend/sim/simulator.js).
//   API=http://localhost:4100 SIM=http://127.0.0.1:4200 ADMIN_PW=... node backend/sim/e2e.mjs [section ...]
// Needs an EMPTY, freshly migrated + seeded database (it creates its own devices, groups, ...).
import { results, check, sections, login, setToken, ctx } from './lib.mjs';

const mods = ['./t1_auth_devices.mjs', './t2_control_groups.mjs', './t3_monitoring.mjs', './t4_features.mjs', './t5_users_misc.mjs'];
const only = process.argv.slice(2);
for (const m of mods) { try { await import(m); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; } }
setToken(await login()); ctx.admin = await login();
for (const [name, fn] of Object.entries(sections)) {
  if (only.length && !only.some((o) => name.startsWith(o))) continue;
  console.log(`\n=== ${name} ===`);
  try { await fn(); } catch (e) { check(`${name}: section crashed`, false, e.stack ?? String(e)); }
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
for (const f of failed) console.log(`  FAIL ${f.name}  ${typeof f.detail === 'string' ? f.detail : JSON.stringify(f.detail)}`.slice(0, 500));
process.exit(0);
