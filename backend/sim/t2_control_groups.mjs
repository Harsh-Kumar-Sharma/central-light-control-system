import { section, check, api, ctx, sim, sleep, waitFor } from './lib.mjs';

const cmd = (id, type, extra = {}) => api('POST', `/devices/${id}/commands`, { type, ...extra });
const simRx = async (tx, addr) => (await sim('GET', '/state'))[tx].receivers[addr];
const dbStatus = async (id) => (await api('GET', `/devices/${id}/status`)).data;

section('4. Single-light control (on / off / dim) over LAN and MQTT', async () => {
  const id = ctx.rx[11];
  let r = await cmd(id, 'relay1', { state: true });
  check('LAN relay1 ON -> SUCCESS', r.status === 202 && r.data.status === 'SUCCESS', r);
  check('simulator relay1 is really ON', (await simRx('A', 11)).relay1 === true);
  r = await cmd(id, 'relay2', { state: true });
  check('LAN relay2 ON -> SUCCESS', r.data.status === 'SUCCESS', r);
  r = await cmd(id, 'relay1', { state: false });
  check('LAN relay1 OFF -> SUCCESS', r.data.status === 'SUCCESS', r);
  const s = await simRx('A', 11);
  check('simulator state r1=off r2=on', s.relay1 === false && s.relay2 === true, s);
  r = await cmd(id, 'brightness', { value: 35 });
  check('LAN dim to 35 -> SUCCESS', r.data.status === 'SUCCESS', r);
  check('simulator brightness = 35', (await simRx('A', 11)).brightness === 35);
  const st = await dbStatus(id);
  check('device status reflects last command (relay2 on, brightness 35)', st.status?.relay2 == 1 && st.status?.brightness === 35, st);

  for (const [v, label] of [[0, '0'], [100, '100'], [-5, '-5'], ['abc', 'abc'], [50.5, '50.5'], [null, 'null']]) {
    const bad = await cmd(id, 'brightness', { value: v });
    check(`dim value ${label} rejected (400)`, bad.status === 400, bad);
  }
  check('dim boundary 1 ok', (await cmd(id, 'brightness', { value: 1 })).data.status === 'SUCCESS');
  check('dim boundary 99 ok', (await cmd(id, 'brightness', { value: 99 })).data.status === 'SUCCESS');
  check('relay without state -> 400', (await cmd(id, 'relay1')).status === 400);
  check('relay state as string -> 400', (await cmd(id, 'relay1', { state: 'on' })).status === 400);
  check('unknown command type -> 400', (await cmd(id, 'explode')).status === 400);
  check('command without type -> 400', (await api('POST', `/devices/${id}/commands`, {})).status === 400);
  check('command to missing device -> 400/404', [400, 404].includes((await cmd(99999, 'relay1', { state: true })).status));

  // MQTT transmitter
  const m = ctx.rx[31];
  r = await cmd(m, 'relay1', { state: true });
  check('MQTT relay1 ON -> SUCCESS', r.status === 202 && r.data.status === 'SUCCESS', r);
  check('MQTT simulator relay1 is ON', (await simRx('C', 31)).relay1 === true);
  r = await cmd(m, 'brightness', { value: 60 });
  check('MQTT dim 60 -> SUCCESS', r.data.status === 'SUCCESS', r);
  check('MQTT simulator brightness 60', (await simRx('C', 31)).brightness === 60);
  r = await cmd(m, 'relay1', { state: false });
  check('MQTT relay1 OFF -> SUCCESS', r.data.status === 'SUCCESS', r);
});

section('5. Fault handling (device silent / ACK lost / tx down / disabled)', async () => {
  const id = ctx.rx[12];
  await sim('POST', '/receiver/A/12', { offline: true });
  let r = await cmd(id, 'relay1', { state: true });
  check('offline receiver -> NO_ACK, not SUCCESS', r.data.status === 'NO_ACK', r);
  check('offline receiver relay unchanged in sim', (await simRx('A', 12)).relay1 === false);
  await sim('POST', '/receiver/A/12', { offline: false, dropAck: true });
  r = await cmd(id, 'relay1', { state: true });
  check('lost ACK (device acted) -> NO_ACK/not SUCCESS', r.data.status !== 'SUCCESS', r);
  await sim('POST', '/receiver/A/12', { dropAck: false, relay1: false });

  await sim('POST', '/receiver/A/12', { delayMs: 1500 });
  r = await cmd(id, 'relay1', { state: true });
  check('slow device (1.5 s) still -> SUCCESS', r.data.status === 'SUCCESS', r);
  await sim('POST', '/receiver/A/12', { delayMs: 0 });

  await sim('POST', '/transmitter/B', { down: true });
  r = await cmd(ctx.rx[21], 'relay1', { state: true });
  check('transmitter down -> TRANSMITTER_OFFLINE', r.data.status === 'TRANSMITTER_OFFLINE', r);
  await sim('POST', '/transmitter/B', { down: false });
  r = await cmd(ctx.rx[21], 'relay1', { state: true });
  check('transmitter back up -> SUCCESS', r.data.status === 'SUCCESS', r);

  // disabled
  await api('PUT', `/devices/${ctx.rx[13]}`, { status: 'inactive' });
  r = await cmd(ctx.rx[13], 'relay1', { state: true });
  check('disabled receiver rejected', r.status === 400 && r.data.status === 'DEVICE_OFFLINE', r);
  await api('PUT', `/devices/${ctx.rx[13]}`, { status: 'active' });
  await api('PUT', `/transmitters/${ctx.tx.A}`, { status: 'inactive' });
  r = await cmd(ctx.rx[11], 'relay1', { state: true });
  check('disabled transmitter rejected', r.status === 400 && r.data.status === 'TRANSMITTER_OFFLINE', r);
  await api('PUT', `/transmitters/${ctx.tx.A}`, { status: 'active' });
  r = await cmd(ctx.rx[11], 'relay1', { state: true });
  check('re-enabled transmitter works', r.data.status === 'SUCCESS', r);

  // MQTT tx down
  await sim('POST', '/transmitter/C', { down: true });
  r = await cmd(ctx.rx[31], 'relay1', { state: true });
  check('MQTT transmitter silent -> NO_ACK/OFFLINE (not SUCCESS)', r.data.status !== 'SUCCESS', r);
  await sim('POST', '/transmitter/C', { down: false });
  r = await cmd(ctx.rx[31], 'relay1', { state: true });
  check('MQTT transmitter back -> SUCCESS', r.data.status === 'SUCCESS', r);
});

section('6. Groups (create, all-off / all-on / dim together)', async () => {
  // reset all states
  for (const [tx, addrs] of [['A', [11, 12, 13, 14]], ['B', [21, 22, 23]], ['C', [31, 32]]]) for (const a of addrs) await sim('POST', `/receiver/${tx}/${a}`, { offline: false, silent: false, dropAck: false, delayMs: 0, relay1: false, relay2: false });
  const ids = (addrs) => addrs.map((a) => ctx.rx[a]);
  const g = await api('POST', '/groups', { name: 'Main road', deviceIds: ids([11, 12, 21, 22, 31]) });
  check('create group with members', g.status === 201, g);
  ctx.group = g.data.id;
  const g2 = await api('POST', '/groups', { name: 'Empty group' });
  check('create empty group', g2.status === 201, g2);
  ctx.emptyGroup = g2.data.id;
  check('group without name -> 400', (await api('POST', '/groups', { deviceIds: [] })).status === 400);
  check('group with ghost device -> 400 and no leftover group', (await api('POST', '/groups', { name: 'ghost', deviceIds: [99999] })).status === 400);
  const list = await api('GET', '/groups');
  check('groups list: ghost group not created, member_count right', list.status === 200 && !list.data.groups.some((x) => x.name === 'ghost') && list.data.groups.find((x) => x.id === ctx.group)?.member_count === 5, list.data);
  check('duplicate group name handled (409 or 201, never 500)', [201, 409].includes((await api('POST', '/groups', { name: 'Main road' })).status));

  let r = await api('POST', `/groups/${ctx.group}/commands`, { type: 'relay1', state: true });
  check('group ALL ON -> aggregate SUCCESS', r.status === 202 && r.data.aggregate === 'SUCCESS' && r.data.results.length === 5, r);
  let allOn = true;
  for (const [tx, a] of [['A', 11], ['A', 12], ['B', 21], ['B', 22], ['C', 31]]) allOn &&= (await simRx(tx, a)).relay1 === true;
  check('all 5 simulated lights really ON (3 transmitters, LAN+MQTT)', allOn);
  check('a light NOT in the group stayed off', (await simRx('A', 13)).relay1 === false);

  r = await api('POST', `/groups/${ctx.group}/commands`, { type: 'brightness', value: 40 });
  check('group DIM 40 -> SUCCESS', r.data.aggregate === 'SUCCESS', r);
  let dim = true;
  for (const [tx, a] of [['A', 11], ['A', 12], ['B', 21], ['B', 22], ['C', 31]]) dim &&= (await simRx(tx, a)).brightness === 40;
  check('all 5 lights brightness 40', dim);

  r = await api('POST', `/groups/${ctx.group}/commands`, { type: 'relay1', state: false });
  check('group ALL OFF -> SUCCESS', r.data.aggregate === 'SUCCESS', r);
  let allOff = true;
  for (const [tx, a] of [['A', 11], ['A', 12], ['B', 21], ['B', 22], ['C', 31]]) allOff &&= (await simRx(tx, a)).relay1 === false;
  check('all 5 lights really OFF', allOff);

  // partial failure
  await sim('POST', '/receiver/B/22', { offline: true });
  r = await api('POST', `/groups/${ctx.group}/commands`, { type: 'relay1', state: true });
  check('group with one dead light -> PARTIAL_SUCCESS', r.data.aggregate === 'PARTIAL_SUCCESS', r);
  await sim('POST', '/receiver/B/22', { offline: false });
  await api('POST', `/groups/${ctx.group}/commands`, { type: 'relay1', state: false });

  check('empty group command -> 400', (await api('POST', `/groups/${ctx.emptyGroup}/commands`, { type: 'relay1', state: true })).status === 400);
  check('invalid group dim -> 400, no run recorded', (await api('POST', `/groups/${ctx.group}/commands`, { type: 'brightness', value: 500 })).status === 400);
  check('missing group -> 400/404', [400, 404].includes((await api('POST', '/groups/99999/commands', { type: 'relay1', state: true })).status));

  // relay2 group, and big group performance
  r = await api('POST', `/groups/${ctx.group}/commands`, { type: 'relay2', state: true });
  check('group relay2 ON', r.data.aggregate === 'SUCCESS', r);
  await api('POST', `/groups/${ctx.group}/commands`, { type: 'relay2', state: false });

  // edit / delete
  check('duplicate group name (any case) -> 409', (await api('POST', '/groups', { name: 'MAIN ROAD' })).status === 409);
  const one = await api('GET', `/groups/${ctx.group}`);
  check('get group returns member ids', one.status === 200 && one.data.deviceIds.length === 5, one);
  const tmp = await api('POST', '/groups', { name: 'Temp group', deviceIds: ids([13, 23]) });
  check('create temp group', tmp.status === 201, tmp);
  check('rename group to an existing name -> 409', (await api('PUT', `/groups/${tmp.data.id}`, { name: 'main road' })).status === 409);
  check('rename + change members', (await api('PUT', `/groups/${tmp.data.id}`, { name: 'Temp group 2', deviceIds: ids([13, 23, 32]) })).status === 200);
  const chk = await api('GET', `/groups/${tmp.data.id}`);
  check('edited group has new name and 3 members', chk.data.name === 'Temp group 2' && chk.data.deviceIds.length === 3, chk.data);
  check('edit with ghost device -> 400 and members unchanged', (await api('PUT', `/groups/${tmp.data.id}`, { deviceIds: [99999] })).status === 400 && (await api('GET', `/groups/${tmp.data.id}`)).data.deviceIds.length === 3);
  check('edit with nothing -> 400', (await api('PUT', `/groups/${tmp.data.id}`, {})).status === 400);
  check('edit missing group -> 404', (await api('PUT', '/groups/99999', { name: 'x' })).status === 404);
  await api('POST', `/groups/${tmp.data.id}/commands`, { type: 'relay1', state: false }); // gives it command history
  check('delete group that has command history', (await api('DELETE', `/groups/${tmp.data.id}`)).status === 200);
  check('deleted group is gone', (await api('GET', `/groups/${tmp.data.id}`)).status === 404);
  check('delete missing group -> 404', (await api('DELETE', '/groups/99999')).status === 404);
});
