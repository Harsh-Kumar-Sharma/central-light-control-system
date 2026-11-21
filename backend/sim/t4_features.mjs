import { section, check, api, ctx, sim, sleep, waitFor } from './lib.mjs';

const simRx = async (tx, addr) => (await sim('GET', '/state'))[tx].receivers[addr];
const API = process.env.API ?? 'http://localhost:4100';

section('11. Roads (control center layouts)', async () => {
  const L = (addrs) => addrs.map((a, i) => ({ id: `l${a}`, receiverId: ctx.rx[a], x: 100 + i * 120, y: 200 }));
  const layout = { version: 1, canvas: { width: 1200, height: 700 }, segments: [{ id: 's1', points: [{ x: 50, y: 250 }, { x: 1100, y: 250 }], lanes: 2, curved: false }], lights: L([11, 12, 13, 21, 22]), labels: [{ id: 'b1', text: 'North Highway', x: 100, y: 80, size: 20 }] };
  const r = await api('POST', '/roads', { name: 'North Highway', layout });
  check('create road with 5 lights', r.status === 201, r);
  ctx.road = r.data.id;
  check('duplicate road name -> 409', (await api('POST', '/roads', { name: 'North Highway', layout })).status === 409);
  check('road without name -> 400', (await api('POST', '/roads', { layout })).status === 400);
  check('road with ghost receiver -> 400', (await api('POST', '/roads', { name: 'Ghost', layout: { ...layout, lights: [{ id: 'x', receiverId: 99999, x: 1, y: 1 }] } })).status === 400);
  check('road with same receiver twice -> 400', (await api('POST', '/roads', { name: 'Twice', layout: { ...layout, lights: [{ id: 'a', receiverId: ctx.rx[11], x: 1, y: 1 }, { id: 'b', receiverId: ctx.rx[11], x: 5, y: 5 }] } })).status === 400);
  check('road with out-of-range coordinates -> 400', (await api('POST', '/roads', { name: 'Far', layout: { ...layout, lights: [{ id: 'a', receiverId: ctx.rx[11], x: 99999, y: 1 }] } })).status === 400);
  check('road with 9 lanes -> 400', (await api('POST', '/roads', { name: 'Lanes', layout: { ...layout, segments: [{ id: 's', points: [{ x: 1, y: 1 }, { x: 5, y: 5 }], lanes: 9 }] } })).status === 400);
  check('road with <script> label stored safely (no 500)', [201, 400].includes((await api('POST', '/roads', { name: 'XSS <img src=x onerror=alert(1)>', layout: { ...layout, lights: [] } })).status));

  const list = await api('GET', '/roads');
  check('list roads', list.status === 200 && list.data.roads?.some((x) => x.id === ctx.road), list);
  const one = await api('GET', `/roads/${ctx.road}`);
  check('get road returns layout', one.status === 200 && one.data.layout?.lights?.length === 5 || one.data.road?.layout?.lights?.length === 5, one);
  const live = await api('GET', `/roads/${ctx.road}/live`);
  check('road live status lists 5 lights with state', live.status === 200 && (live.data.lights?.length === 5), live);
  const upd = await api('PUT', `/roads/${ctx.road}`, { name: 'North Highway', layout: { ...layout, lights: L([11, 12, 13, 21, 22, 23]) } });
  check('edit road layout (add a light)', upd.status === 200, upd);
  check('get missing road -> 404', (await api('GET', '/roads/99999')).status === 404);

  // map
  const map = await api('GET', '/map/lights');
  check('map lights', map.status === 200, map);
  const pos = await api('PUT', `/map/lights/${ctx.rx[11]}/position`, { latitude: 26.91, longitude: 75.79 });
  check('set GPS position of a light', pos.status === 200, pos);
  check('invalid GPS position -> 400', (await api('PUT', `/map/lights/${ctx.rx[11]}/position`, { latitude: 200, longitude: 75 })).status === 400);
});

section('12. Schedules (on/off/dim, sunrise/sunset, run-now, auto-fire)', async () => {
  const settings = await api('GET', '/schedules/settings');
  check('schedule settings', settings.status === 200, settings);
  const bad = await api('PUT', '/schedules/settings', { latitude: 26.9, longitude: 75.8, timezone: 'Not/AZone' });
  check('invalid timezone -> 400', bad.status === 400, bad);
  check('only latitude -> 400', (await api('PUT', '/schedules/settings', { latitude: 26.9, timezone: 'Asia/Kolkata' })).status === 400);
  const ok = await api('PUT', '/schedules/settings', { latitude: 26.9124, longitude: 75.7873, timezone: 'Asia/Kolkata' });
  check('save site position (Jaipur) + timezone', ok.status === 200, ok);
  const sun = await api('GET', '/schedules/settings');
  check('sunrise/sunset computed', sun.data.sun?.sunrise && sun.data.sun?.sunset, sun.data);

  const mk = (b) => api('POST', '/schedules', b);
  let s = await mk({ name: 'Evening ON', target_type: 'group', target_id: ctx.group, action: 'on', trigger_type: 'sunset', offset_minutes: -10, days: '1111111' });
  check('create sunset-10 ON schedule for group', s.status === 201, s);
  ctx.schedOn = s.data.id;
  s = await mk({ name: 'Morning OFF', target_type: 'group', target_id: ctx.group, action: 'off', trigger_type: 'sunrise', offset_minutes: 15 });
  check('create sunrise+15 OFF schedule', s.status === 201, s);
  s = await mk({ name: 'Night dim', target_type: 'road', target_id: ctx.road, action: 'brightness', brightness: 30, trigger_type: 'time', time_of_day: '23:30', days: '1111100' });
  check('create fixed-time DIM schedule for road, weekdays', s.status === 201, s);
  ctx.schedDim = s.data.id;
  const cases = [
    ['no name', { target_type: 'group', target_id: ctx.group, action: 'on', trigger_type: 'time', time_of_day: '10:00' }],
    ['bad time 25:99', { name: 'x', target_type: 'group', target_id: ctx.group, action: 'on', trigger_type: 'time', time_of_day: '25:99' }],
    ['dim 100', { name: 'x', target_type: 'group', target_id: ctx.group, action: 'brightness', brightness: 100, trigger_type: 'time', time_of_day: '10:00' }],
    ['no days', { name: 'x', target_type: 'group', target_id: ctx.group, action: 'on', trigger_type: 'time', time_of_day: '10:00', days: '0000000' }],
    ['ghost target', { name: 'x', target_type: 'group', target_id: 99999, action: 'on', trigger_type: 'time', time_of_day: '10:00' }],
    ['bad action', { name: 'x', target_type: 'group', target_id: ctx.group, action: 'explode', trigger_type: 'time', time_of_day: '10:00' }],
    ['offset 500', { name: 'x', target_type: 'group', target_id: ctx.group, action: 'on', trigger_type: 'sunset', offset_minutes: 500 }],
  ];
  for (const [label, body] of cases) check(`schedule validation: ${label} -> 400`, (await mk(body)).status === 400);

  check('cannot delete a group that a schedule uses (409)', (await api('DELETE', `/groups/${ctx.group}`)).status === 409);
  const list = await api('GET', '/schedules');
  check('schedules list has next-run info', list.status === 200 && list.data.schedules?.length >= 3, list);

  // run now: group ON then dim road
  for (const a of [11, 12, 13, 21, 22, 23, 31]) await sim('POST', `/receiver/${a < 20 ? 'A' : a < 30 ? 'B' : 'C'}/${a}`, { relay1: false, relay2: false });
  const run = await api('POST', `/schedules/${ctx.schedOn}/run`);
  check('run schedule now (group ON)', run.status === 200 && run.data.ok >= 5 || run.data.status === 'success' || run.data.total, run.data);
  let on = true;
  for (const [tx, a] of [['A', 11], ['A', 12], ['B', 21], ['B', 22], ['C', 31]]) on &&= (await simRx(tx, a)).relay1 === true && (await simRx(tx, a)).relay2 === true;
  check('all lights in group really ON after schedule run (both relays)', on);
  const run2 = await api('POST', `/schedules/${ctx.schedDim}/run`);
  check('run dim schedule on road', run2.status === 200, run2);
  check('road lights dimmed to 30 in simulator', (await simRx('A', 11)).brightness === 30 && (await simRx('B', 22)).brightness === 30);

  // schedule with a dead light -> failed/partial + alarm
  await sim('POST', '/receiver/A/12', { offline: true });
  const run3 = await api('POST', `/schedules/${ctx.schedOn}/run`);
  check('schedule run reports the dead light as failed', run3.data.failed >= 1 || /partial|fail/i.test(JSON.stringify(run3.data)), run3.data);
  await sim('POST', '/receiver/A/12', { offline: false });
  const runs = await api('GET', '/schedules/runs');
  check('schedule runs history', runs.status === 200 && runs.data.runs.length >= 3, runs);

  // automatic firing: set a time schedule 1 minute ahead (site tz)
  const now = new Date();
  const t = new Date(now.getTime() + 60_000 + (60 - now.getSeconds()) * 1000 - 60_000 + 0);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(now.getTime() + 70_000));
  await api('POST', `/groups/${ctx.group}/commands`, { type: 'relay1', state: false });
  await api('POST', `/groups/${ctx.group}/commands`, { type: 'relay2', state: false });
  const auto = await mk({ name: 'Auto-fire test OFF', target_type: 'group', target_id: ctx.group, action: 'on', relay: '1', trigger_type: 'time', time_of_day: parts, days: '1111111' });
  check(`create schedule for ${parts} (about a minute ahead)`, auto.status === 201, auto);
  ctx.autoSched = auto.data.id;
  const fired = await waitFor(async () => (await simRx('A', 11)).relay1 === true, 110000, 2000);
  check('scheduler fired by itself at the set time (relay1 ON)', fired);
  const recorded = await waitFor(async () => (await api('GET', '/schedules/runs')).data.runs.find((r) => r.schedule_id === ctx.autoSched && r.trigger_kind === 'auto'), 15000, 500);
  check('auto run recorded (trigger_kind=auto, all lights ok)', recorded && recorded.failed === 0, recorded);
  // disable + delete
  check('disable schedule', (await api('PUT', `/schedules/${ctx.autoSched}`, { enabled: false })).status === 200);
  check('delete schedule', (await api('DELETE', `/schedules/${ctx.autoSched}`)).status === 200);
  check('delete missing schedule -> 404', (await api('DELETE', '/schedules/99999')).status === 404);
  await api('POST', `/groups/${ctx.group}/commands`, { type: 'relay1', state: false });
  await api('POST', `/groups/${ctx.group}/commands`, { type: 'relay2', state: false });
});

section('13. Tunnels (zones + day/evening/night modes)', async () => {
  const t = await api('POST', '/tunnels', { name: 'City Tunnel', length_m: 800, description: 'test' });
  check('create tunnel', t.status === 201, t);
  ctx.tunnel = t.data.id;
  check('duplicate tunnel name -> 409', (await api('POST', '/tunnels', { name: 'City Tunnel' })).status === 409);
  check('tunnel negative length -> 400', (await api('POST', '/tunnels', { name: 'Neg', length_m: -5 })).status === 400);
  const z = await api('PUT', `/tunnels/${ctx.tunnel}/zones`, { zones: [
    { name: 'Entrance', kind: 'entrance', day_brightness: 99, evening_brightness: 80, night_brightness: 60, receiverIds: [ctx.rx[11], ctx.rx[12]] },
    { name: 'Interior', kind: 'interior', day_brightness: 70, evening_brightness: 60, night_brightness: 40, receiverIds: [ctx.rx[21], ctx.rx[22]] },
  ] });
  check('set 2 zones', z.status === 200, z);
  check('light in two zones -> 400', (await api('PUT', `/tunnels/${ctx.tunnel}/zones`, { zones: [{ name: 'A', receiverIds: [ctx.rx[11]] }, { name: 'B', receiverIds: [ctx.rx[11]] }] })).status === 400);
  check('zone brightness 0 -> 400', (await api('PUT', `/tunnels/${ctx.tunnel}/zones`, { zones: [{ name: 'A', day_brightness: 0, receiverIds: [] }] })).status === 400);
  await api('PUT', `/tunnels/${ctx.tunnel}/zones`, { zones: [
    { name: 'Entrance', kind: 'entrance', day_brightness: 99, evening_brightness: 80, night_brightness: 60, receiverIds: [ctx.rx[11], ctx.rx[12]] },
    { name: 'Interior', kind: 'interior', day_brightness: 70, evening_brightness: 60, night_brightness: 40, receiverIds: [ctx.rx[21], ctx.rx[22]] },
  ] });
  check('mode with bad name -> 400', (await api('POST', `/tunnels/${ctx.tunnel}/mode`, { mode: 'noon' })).status === 400);
  const m = await api('POST', `/tunnels/${ctx.tunnel}/mode`, { mode: 'night' });
  check('start night mode (202)', m.status === 202, m);
  const done = await waitFor(async () => { const l = await api('GET', '/tunnels'); const tt = l.data.tunnels.find((x) => x.id === ctx.tunnel); return tt && !tt.job && tt ? tt : null; }, 30000, 1000);
  check('mode change finished', done, (await api('GET', '/tunnels')).data);
  check('entrance lights at night level (60)', (await simRx('A', 11)).brightness === 60 && (await simRx('A', 12)).brightness === 60);
  check('interior lights at night level (40)', (await simRx('B', 21)).brightness === 40 && (await simRx('B', 22)).brightness === 40);
  await api('POST', `/tunnels/${ctx.tunnel}/mode`, { mode: 'off' });
  await waitFor(async () => { const l = await api('GET', '/tunnels'); return !l.data.tunnels.find((x) => x.id === ctx.tunnel)?.job; }, 30000, 1000);
  check('mode OFF switches relays off', (await simRx('A', 11)).relay1 === false && (await simRx('B', 21)).relay1 === false);
  const empty = await api('POST', '/tunnels', { name: 'Empty Tunnel' });
  check('mode on tunnel without lights -> 400', (await api('POST', `/tunnels/${empty.data.id}/mode`, { mode: 'day' })).status === 400);
  check('delete tunnel', (await api('DELETE', `/tunnels/${empty.data.id}`)).status === 200);
});

section('14. Sensors, rules, energy reports', async () => {
  // light 12 reports sensors in its STATUS reply
  await sim('POST', '/receiver/A/12', { sensors: true, relay1: true, relay2: true });
  await api('POST', `/devices/${ctx.rx[12]}/refresh-status`);
  await api('POST', `/devices/${ctx.rx[12]}/refresh-status`);
  const latest = await api('GET', '/sensors/latest');
  check('sensors/latest returns readings', latest.status === 200, latest);
  const row = (latest.data.lights ?? []).find((x) => x.id === ctx.rx[12]);
  check('sensor values stored for light 12 (voltage ~230 V)', row?.sensors && Number(row.sensors.voltage_v) > 200 && row.sensors.power_w === 200, row);
  const hist = await api('GET', `/sensors/history?metric=voltage_v&receiverId=${ctx.rx[12]}&hours=1`);
  check('sensor history has points', hist.status === 200 && hist.data.points?.length >= 1, hist);
  check('sensor history unknown metric -> 400', (await api('GET', `/sensors/history?metric=bogus&receiverId=${ctx.rx[12]}`)).status === 400);

  const rule = await api('POST', '/sensors/rules', { name: 'Over-voltage', kind: 'threshold', metric: 'voltage_v', op: 'gt', value: 200, severity: 'critical', receiver_id: ctx.rx[12] });
  check('create threshold rule', rule.status === 201, rule);
  check('rule with bad op -> 400', (await api('POST', '/sensors/rules', { name: 'x', kind: 'threshold', metric: 'voltage', op: 'zz', value: 1 })).status === 400);
  check('rule value NaN -> 400', (await api('POST', '/sensors/rules', { name: 'x', kind: 'threshold', metric: 'voltage', op: 'gt', value: 'abc' })).status === 400);
  await api('POST', `/devices/${ctx.rx[12]}/refresh-status`);
  await sleep(500);
  const al = await api('GET', '/alarms');
  check('threshold alarm raised by sensor rule', (al.data.alarms ?? []).some((a) => /voltage/i.test(a.title + (a.detail ?? '')) || a.type?.includes('sensor')), (al.data.alarms ?? []).map((a) => a.type + ':' + a.title));
  const rl = await api('GET', '/sensors/rules');
  check('rules list', rl.status === 200 && rl.data.rules.length >= 1);
  if (rule.data?.id) check('delete rule', (await api('DELETE', `/sensors/rules/${rule.data.id}`)).status === 200);

  // reports
  const st = await api('PUT', '/reports/settings', { tariff: 8.5, currency: 'inr' });
  check('save tariff', st.status === 200, st);
  check('negative tariff -> 400', (await api('PUT', '/reports/settings', { tariff: -1 })).status === 400);
  const ov = await api('GET', '/reports/overview');
  check('report overview', ov.status === 200, ov);
  const ovRoad = await api('GET', `/reports/overview?roadId=${ctx.road}`);
  check('report overview for one road', ovRoad.status === 200, ovRoad);
  check('report: from after to -> 400', (await api('GET', '/reports/overview?from=2026-12-01&to=2026-11-01')).status === 400);
  check('report: >92 days -> 400', (await api('GET', '/reports/overview?from=2025-01-01&to=2026-11-01')).status === 400);
  for (const kind of ['lights', 'commands', 'alarms']) {
    const res = await fetch(`${API}/api/reports/export?kind=${kind}`, { headers: { authorization: `Bearer ${ctx.admin}` } });
    const body = await res.text();
    check(`CSV export: ${kind}`, res.status === 200 && /csv/.test(res.headers.get('content-type')) && body.split('\n').length >= 2, body.slice(0, 200));
  }
  const bad = await fetch(`${API}/api/reports/export?kind=hack`, { headers: { authorization: `Bearer ${ctx.admin}` } });
  check('CSV export unknown kind -> 400', bad.status === 400);
  await sim('POST', '/receiver/A/12', { sensors: false });
});

section('15. Plans (CAD drawing upload)', async () => {
  const dxf = ['0', 'SECTION', '2', 'HEADER', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
  for (let i = 0; i < 30; i++) dxf.push('0', 'LINE', '8', 'ROAD', '10', String(i * 10), '20', '0', '30', '0', '11', String(i * 10 + 8), '21', '40', '31', '0');
  dxf.push('0', 'CIRCLE', '8', 'POLES', '10', '50', '20', '20', '30', '0', '40', '5', '0', 'TEXT', '8', 'NOTES', '10', '10', '20', '60', '30', '0', '40', '4', '1', 'Test plan', '0', 'ENDSEC', '0', 'EOF');
  const body = Buffer.from(dxf.join('\n'));
  const up = await fetch(`${API}/api/plans/upload`, { method: 'POST', headers: { authorization: `Bearer ${ctx.admin}`, 'x-filename': encodeURIComponent('test.dxf'), 'x-plan-name': encodeURIComponent('Test Plan'), 'content-type': 'application/octet-stream' }, body });
  const upj = await up.json();
  check('upload DXF plan', up.status === 201, upj);
  ctx.plan = upj.id;
  const junk = await fetch(`${API}/api/plans/upload`, { method: 'POST', headers: { authorization: `Bearer ${ctx.admin}`, 'x-filename': 'bad.dxf' }, body: Buffer.from('this is not a drawing') });
  check('garbage file -> 4xx not 500', junk.status >= 400 && junk.status < 500, await junk.text());
  const wrong = await fetch(`${API}/api/plans/upload`, { method: 'POST', headers: { authorization: `Bearer ${ctx.admin}`, 'x-filename': 'x.exe' }, body: Buffer.from('MZ') });
  check('.exe upload -> 4xx', wrong.status >= 400 && wrong.status < 500, wrong.status);
  const empty = await fetch(`${API}/api/plans/upload`, { method: 'POST', headers: { authorization: `Bearer ${ctx.admin}`, 'x-filename': 'x.dxf' }, body: Buffer.alloc(0) });
  check('empty upload -> 400', empty.status === 400, empty.status);
  const list = await api('GET', '/plans');
  check('list plans', list.status === 200 && (list.data.plans ?? []).length === 1, list);
  const one = await api('GET', `/plans/${ctx.plan}`);
  check('get plan', one.status === 200, one);
  const geo = await api('GET', `/plans/${ctx.plan}/geometry`);
  check('get plan geometry', geo.status === 200, typeof geo.data);
  const src = await fetch(`${API}/api/plans/${ctx.plan}/source`, { headers: { authorization: `Bearer ${ctx.admin}` } });
  check('download original source', src.status === 200);
  check('rename plan', (await api('PUT', `/plans/${ctx.plan}`, { name: 'Renamed plan' })).status === 200);
  check('rename empty -> 400', (await api('PUT', `/plans/${ctx.plan}`, { name: '' })).status === 400);
  check('save layers', (await api('PUT', `/plans/${ctx.plan}/layers`, { hidden: ['NOTES'] })).status === 200);
  check('layers bad body -> 400', (await api('PUT', `/plans/${ctx.plan}/layers`, { hidden: 'x' })).status === 400);
  const place = await api('PUT', `/plans/${ctx.plan}/lights/${ctx.rx[11]}`, { x: 100, y: 20 });
  check('place light on plan', place.status === 200, place);
  check('place with string coords -> 400', (await api('PUT', `/plans/${ctx.plan}/lights/${ctx.rx[11]}`, { x: 'a', y: 1 })).status === 400);
  const lights = await api('GET', `/plans/${ctx.plan}/lights`);
  check('plan lights show placed position', lights.status === 200 && lights.data.lights.find((l) => l.receiverId === ctx.rx[11])?.plan?.x === 100, lights.data?.lights?.[0]);
  check('unplace light', (await api('PUT', `/plans/${ctx.plan}/lights/${ctx.rx[11]}`, { x: null, y: null })).status === 200);
  check('delete plan', (await api('DELETE', `/plans/${ctx.plan}`)).status === 200);
  check('get deleted plan -> 404', (await api('GET', `/plans/${ctx.plan}`)).status === 404);
});
