import mqtt from 'mqtt';
import { section, check, api, ctx, sim, sleep, waitFor } from './lib.mjs';

const status = async (id) => (await api('GET', `/devices/${id}/status`)).data.status;
const alarms = async (q = '') => (await api('GET', `/alarms${q}`)).data;

section('7. Status monitoring: polling picks up real device state', async () => {
  const cfg = await api('GET', '/status-monitoring');
  check('get monitoring config', cfg.status === 200 && cfg.data.config, cfg);
  const set = await api('PUT', '/status-monitoring', { polling_interval_seconds: 3 });
  check('set polling interval to 3 s', set.status === 200 && set.data.config.polling_interval_seconds === 3, set);

  // someone switches a light on at the pole (not through the app)
  await sim('POST', '/receiver/A/13', { relay1: true, relay2: true });
  const seen = await waitFor(async () => { const s = await status(ctx.rx[13]); return s && s.relay1 == 1 && s.state_source === 'reported' ? s : null; }, 25000);
  check('poll noticed the manual switch-on (relay1/2 on, source=reported)', seen, await status(ctx.rx[13]));
  await sim('POST', '/receiver/A/13', { relay1: false, relay2: false });
  const off = await waitFor(async () => { const s = await status(ctx.rx[13]); return s && s.relay1 == 0 && s.relay2 == 0 ? s : null; }, 25000);
  check('poll noticed the manual switch-off', off);

  // MQTT transmitter is polled too
  await sim('POST', '/receiver/C/32', { relay2: true });
  const m = await waitFor(async () => { const s = await status(ctx.rx[32]); return s && s.relay2 == 1 ? s : null; }, 25000);
  check('MQTT light state polled (relay2 on)', m);
  await sim('POST', '/receiver/C/32', { relay2: false });

  // refresh status on demand
  await sim('POST', '/receiver/A/11', { relay1: true });
  const rf = await api('POST', `/devices/${ctx.rx[11]}/refresh-status`);
  check('refresh-status returns live state', rf.status === 200 && rf.data.ok && rf.data.status?.relay1 == 1, rf);
  await sim('POST', '/receiver/A/11', { relay1: false });
  check('refresh on missing device -> 404', (await api('POST', '/devices/99999/refresh-status')).status === 404);
});

section('8. Offline detection and alarms', async () => {
  await sim('POST', '/receiver/A/14', { offline: true });
  const went = await waitFor(async () => { const s = await status(ctx.rx[14]); return s && s.online == 0 ? s : null; }, 30000);
  check('silent light marked OFFLINE after missed polls', went, await status(ctx.rx[14]));
  const a = await alarms();
  const list = a.alarms ?? a;
  const alarm = list.find?.((x) => x.type === 'device_offline' && x.receiver_id === ctx.rx[14] && x.status !== 'resolved');
  check('device_offline alarm raised', alarm, a);
  if (alarm) {
    const ack = await api('POST', `/alarms/${alarm.id}/acknowledge`);
    check('acknowledge alarm', ack.status === 200, ack);
  }
  const sum = await api('GET', '/alarms/summary');
  check('alarm summary works', sum.status === 200, sum);

  await sim('POST', '/receiver/A/14', { offline: false });
  const back = await waitFor(async () => { const s = await status(ctx.rx[14]); return s && s.online == 1 ? s : null; }, 30000);
  check('light back ONLINE after it answers again', back);
  const after = (await alarms()).alarms ?? [];
  check('offline alarm auto-resolved', !after.some((x) => x.type === 'device_offline' && x.receiver_id === ctx.rx[14] && x.status !== 'resolved'), after.filter?.((x) => x.receiver_id === ctx.rx[14]));

  // whole transmitter down
  await sim('POST', '/transmitter/B', { down: true });
  const bDown = await waitFor(async () => { const ss = await Promise.all([21, 22, 23].map((a) => status(ctx.rx[a]))); return ss.every((s) => s && s.online == 0) ? ss : null; }, 30000);
  check('transmitter down -> all 3 lights behind it OFFLINE', bDown);
  const al2 = (await alarms()).alarms ?? [];
  const txAlarm = al2.find((x) => x.type === 'transmitter_offline' && x.transmitter_id === ctx.tx.B && x.status !== 'resolved');
  check('single transmitter_offline alarm raised', txAlarm, al2);
  check('no per-light alarms spam while transmitter is down', al2.filter((x) => x.type === 'device_offline' && [21, 22, 23].map((a) => ctx.rx[a]).includes(x.receiver_id) && x.status !== 'resolved').length === 0, al2);
  const tl = await api('GET', '/transmitters');
  check('transmitters list reports state without crashing', tl.status === 200);
  await sim('POST', '/transmitter/B', { down: false });
  const bBack = await waitFor(async () => { const ss = await Promise.all([21, 22, 23].map((a) => status(ctx.rx[a]))); return ss.every((s) => s && s.online == 1) ? ss : null; }, 30000);
  check('transmitter back -> lights ONLINE again', bBack);
  const al3 = (await alarms()).alarms ?? [];
  check('transmitter alarm auto-resolved', !al3.some((x) => x.type === 'transmitter_offline' && x.transmitter_id === ctx.tx.B && x.status !== 'resolved'), al3);

  const ackAll = await api('POST', '/alarms/acknowledge-all');
  check('acknowledge-all works', ackAll.status === 200, ackAll);
});

section('9. Heartbeat / Online topics (default broker)', async () => {
  const c = mqtt.connect('mqtt://127.0.0.1:1885');
  await new Promise((r) => c.on('connect', r));
  // the sim backend subscribes to Factory/Lighting/Device<addr>/... for known receivers
  c.publish('Factory/Lighting/Device31/Heartbeat', 'beat');
  c.publish('Factory/Lighting/Device31/Online', 'ONLINE');
  c.publish('Factory/Lighting/Device999/Online', 'ONLINE'); // unknown device: must be ignored, not crash
  c.publish('Factory/Lighting/Device31/Online', 'garbage');
  await sleep(1500);
  const h = await api('GET', '/devices');
  check('backend still healthy after odd MQTT messages', h.status === 200);
  const s = await status(ctx.rx[31]);
  check('heartbeat updated last_seen', s && s.last_seen, s);
  c.end();
});

section('10. Dashboard, logs, audit', async () => {
  const d = await api('GET', '/dashboard/summary');
  check('dashboard summary 200', d.status === 200, d);
  check('dashboard counts 9 lights, 3 transmitters', d.data.lights?.total === 9 && d.data.transmitters?.total === 3, d.data);
  const au = await api('GET', '/audit');
  check('audit/command log lists commands', au.status === 200 && (au.data.commands ?? au.data.logs ?? au.data.items ?? au.data).length > 5, Object.keys(au.data ?? {}));
  const auq = await api('GET', '/audit?limit=5');
  check('audit limit param ok', auq.status === 200);
  const bad = await api('PUT', '/status-monitoring', { polling_interval_seconds: -5 });
  check('negative polling interval rejected (400)', bad.status === 400, bad);
  const bad2 = await api('PUT', '/status-monitoring', { polling_interval_seconds: 'abc' });
  check('non-numeric polling interval rejected (400)', bad2.status === 400, bad2);
  const bad3 = await api('PUT', '/status-monitoring', { offline_threshold_seconds: 0, retry_count: -1 });
  check('zero threshold / negative retries rejected (400)', bad3.status === 400, bad3);
  await api('PUT', '/status-monitoring', { polling_interval_seconds: 10 });
});
