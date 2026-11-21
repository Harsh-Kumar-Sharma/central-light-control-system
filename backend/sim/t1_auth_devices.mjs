import { section, check, api, login, setToken, ctx, sim, sleep, waitFor } from './lib.mjs';

section('1. Auth', async () => {
  const bad = await api('POST', '/auth/login', { username: 'admin', password: 'nope' }, null);
  check('wrong password -> 401', bad.status === 401, bad);
  const inj = await api('POST', '/auth/login', { username: "admin' OR '1'='1", password: "' OR '1'='1" }, null);
  check('SQL-injection login -> 401', inj.status === 401, inj);
  const empty = await api('POST', '/auth/login', {}, null);
  check('empty login body -> 400/401', [400, 401].includes(empty.status), empty);
  const tok = await login();
  check('admin login works', Boolean(tok));
  setToken(tok); ctx.admin = tok;
  const me = await api('GET', '/auth/me');
  check('/auth/me returns admin', me.status === 200 && me.data.user?.role === 'Admin' || me.data.role === 'Admin', me);
  const noTok = await api('GET', '/devices', undefined, null);
  check('no token -> 401', noTok.status === 401);
  const badTok = await api('GET', '/devices', undefined, 'garbage');
  check('garbage token -> 401', badTok.status === 401);
});

section('2. Transmitters & receivers (CRUD + validation)', async () => {
  const T = {
    A: { name: 'Sim LAN A', junctionLocation: 'Junction 1', loraAddress: 1, connectionMode: 'lan', ipAddress: '127.0.0.1', port: 9101, lanLineEnding: 'lf' },
    B: { name: 'Sim LAN B', junctionLocation: 'Junction 2', loraAddress: 2, connectionMode: 'lan', ipAddress: '127.0.0.1', port: 9102, lanLineEnding: 'lf' },
    C: { name: 'Sim MQTT C', junctionLocation: 'Junction 3', loraAddress: 3, connectionMode: 'mqtt', mqttHost: '127.0.0.1', mqttPort: 1885, mqttPublishTopic: 'sim/c/cmd', mqttSubscribeTopic: 'sim/c/reply' },
  };
  ctx.tx = {};
  for (const [k, body] of Object.entries(T)) {
    const r = await api('POST', '/transmitters', body);
    check(`create transmitter ${k}`, r.status === 201, r);
    ctx.tx[k] = r.data.id;
  }
  // validation
  check('transmitter without name -> 400', (await api('POST', '/transmitters', { loraAddress: 9 })).status === 400);
  check('duplicate lora address -> 409', (await api('POST', '/transmitters', { ...T.A, name: 'dup' })).status === 409);
  check('bad IP -> 400', (await api('POST', '/transmitters', { name: 'x', loraAddress: 50, ipAddress: '999.1.1.1', port: 80 })).status === 400);
  check('bad port -> 400', (await api('POST', '/transmitters', { name: 'x', loraAddress: 51, ipAddress: '10.0.0.1', port: 70000 })).status === 400);
  check('MQTT without topics -> 400', (await api('POST', '/transmitters', { name: 'x', loraAddress: 52, connectionMode: 'mqtt', mqttHost: '1.2.3.4' })).status === 400);
  check('MQTT host with scheme -> 400', (await api('POST', '/transmitters', { name: 'x', loraAddress: 53, connectionMode: 'mqtt', mqttHost: 'mqtt://a.b', mqttPublishTopic: 'a', mqttSubscribeTopic: 'b' })).status === 400);
  check('MQTT wildcard publish topic -> 400', (await api('POST', '/transmitters', { name: 'x', loraAddress: 54, connectionMode: 'mqtt', mqttHost: 'a.b', mqttPublishTopic: 'a/#', mqttSubscribeTopic: 'b' })).status === 400);

  const list = await api('GET', '/transmitters');
  check('list transmitters has 3', list.status === 200 && list.data.transmitters.length === 3, list);
  const upd = await api('PUT', `/transmitters/${ctx.tx.A}`, { junctionLocation: 'Junction 1 (renamed)' });
  check('update transmitter', upd.status === 200, upd);
  check('update nonexistent transmitter -> 404', (await api('PUT', '/transmitters/99999', { name: 'x' })).status === 404);

  // receivers
  const mk = async (tx, addr, name, extra = {}) => {
    const r = await api('POST', '/devices', { deviceName: name, loraAddress: addr, parentTransmitterId: ctx.tx[tx], location: `Pole ${addr}`, relay1Name: 'Left lamp', relay2Name: 'Right lamp', statusCommand: `Tx_${addr}_STATUS`, relay1Watts: 100, relay2Watts: 100, ...extra });
    check(`create receiver ${name} (tx ${tx}, addr ${addr})`, r.status === 201, r);
    return r.data.id;
  };
  ctx.rx = {};
  for (const [tx, addrs] of [['A', [11, 12, 13, 14]], ['B', [21, 22, 23]], ['C', [31, 32]]]) {
    for (const a of addrs) ctx.rx[a] = await mk(tx, a, `Light ${a}`, { latitude: 26.9 + a / 1000, longitude: 75.8 + a / 1000 });
  }
  check('duplicate receiver address under same transmitter -> 409', (await api('POST', '/devices', { deviceName: 'dup', loraAddress: 11, parentTransmitterId: ctx.tx.A })).status === 409);
  check('receiver with missing parent -> 400', (await api('POST', '/devices', { deviceName: 'orph', loraAddress: 77, parentTransmitterId: 99999 })).status === 400);
  check('receiver negative address -> 400', (await api('POST', '/devices', { deviceName: 'neg', loraAddress: -1, parentTransmitterId: ctx.tx.A })).status === 400);
  check('receiver bad latitude -> 400', (await api('POST', '/devices', { deviceName: 'lat', loraAddress: 78, parentTransmitterId: ctx.tx.A, latitude: 123, longitude: 5 })).status === 400);
  const devs = await api('GET', '/devices');
  check('list devices returns 9', devs.status === 200 && (devs.data.devices?.length ?? devs.data.length) === 9, devs.data?.devices?.length);
  const ed = await api('PUT', `/devices/${ctx.rx[11]}`, { location: 'Edited location', relay1Name: 'Main' });
  check('edit receiver', ed.status === 200, ed);
});

section('3. Connection tests (ping / port / send / MQTT connect)', async () => {
  const a = ctx.tx.A;
  const port = await api('POST', `/transmitters/${a}/test`, { action: 'port' });
  check('LAN port test ok', port.status === 200 && port.data.ok === true, port);
  const ping = await api('POST', `/transmitters/${a}/test`, { action: 'ping' });
  check('LAN ping loopback ok', ping.status === 200 && ping.data.ok === true, ping);
  const send = await api('POST', `/transmitters/${a}/test`, { action: 'send', message: 'Tx_11_STATUS\n' });
  check('LAN custom send gets a reply', send.status === 200 && /STATUS:R1=/.test(send.data.received ?? ''), send);
  const conn = await api('POST', `/transmitters/${ctx.tx.C}/test`, { action: 'connect' });
  check('MQTT connect test ok', conn.status === 200 && conn.data.ok === true, conn);
  const mport = await api('POST', `/transmitters/${ctx.tx.C}/test`, { action: 'port' });
  check('MQTT broker port test ok', mport.status === 200 && mport.data.ok === true, mport);
  const msend = await api('POST', `/transmitters/${ctx.tx.C}/test`, { action: 'send', message: 'Tx_31_STATUS' });
  check('MQTT custom send gets a reply', msend.status === 200 && /STATUS:R1=/.test(msend.data.received ?? ''), msend);
  check('ping on MQTT tx -> 400', (await api('POST', `/transmitters/${ctx.tx.C}/test`, { action: 'ping' })).status === 400);
  check('unknown test action -> 400', (await api('POST', `/transmitters/${a}/test`, { action: 'nuke' })).status === 400);

  // saved commands
  const sc = await api('POST', `/transmitters/${a}/commands`, { name: 'Status 11', command: 'Tx_11_STATUS' });
  check('create saved command', sc.status === 201, sc);
  const dup = await api('POST', `/transmitters/${a}/commands`, { name: 'Status 11', command: 'x' });
  check('duplicate saved command name -> 409', dup.status === 409, dup);
  const run = await api('POST', `/transmitters/${a}/test`, { action: 'send', commandId: sc.data.id });
  check('run saved command', run.status === 200 && run.data.ok, run);
  // public IP must be refused
  const pub = await api('POST', '/transmitters', { name: 'Public', loraAddress: 60, ipAddress: '8.8.8.8', port: 80 });
  if (pub.status === 201) {
    const t = await api('POST', `/transmitters/${pub.data.id}/test`, { action: 'port' });
    check('test against public IP is refused', t.status === 400, t);
    await api('DELETE', `/transmitters/${pub.data.id}`);
  } else check('create tx with public IP (allowed to save?)', true, pub);
});
