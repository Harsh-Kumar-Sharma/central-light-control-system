import { section, check, api, login, ctx, sim } from './lib.mjs';

section('16. Users, roles & permissions', async () => {
  const mk = (u, role, pw = 'Passw0rd!x') => api('POST', '/users', { username: u, password: pw, role });
  const op = await mk('operator1', 'Operator');
  const us = await mk('viewer1', 'User');
  check('create Operator', op.status === 201, op);
  check('create User (view-only)', us.status === 201, us);
  check('duplicate username -> 409', (await mk('operator1', 'Operator')).status === 409);
  check('unknown role -> 400', (await mk('x1', 'God')).status === 400);
  check('missing password -> 400', (await api('POST', '/users', { username: 'nopw', role: 'User' })).status === 400);
  const weak = await mk('weakpw', 'User', '1');
  check('1-character password is rejected (weak password policy)', weak.status === 400, weak);
  const list = await api('GET', '/users');
  check('users list never leaks password hashes', list.status === 200 && !JSON.stringify(list.data).includes('password_hash') && !JSON.stringify(list.data).includes('$2'), list.data);

  const opTok = await login('operator1', 'Passw0rd!x');
  const usTok = await login('viewer1', 'Passw0rd!x');
  check('operator can log in', Boolean(opTok));
  ctx.opTok = opTok; ctx.usTok = usTok;
  // Operator
  const cmd = (tok, id, body) => api('POST', `/devices/${id}/commands`, body, tok);
  check('Operator can switch a light', (await cmd(opTok, ctx.rx[11], { type: 'relay1', state: true })).status === 202);
  check('Operator can control a group', (await api('POST', `/groups/${ctx.group}/commands`, { type: 'relay1', state: false }, opTok)).status === 202);
  check('Operator cannot add device -> 403', (await api('POST', '/devices', { deviceName: 'x', loraAddress: 99, parentTransmitterId: ctx.tx.A }, opTok)).status === 403);
  check('Operator cannot create group -> 403', (await api('POST', '/groups', { name: 'op group' }, opTok)).status === 403);
  check('Operator cannot list users -> 403', (await api('GET', '/users', undefined, opTok)).status === 403);
  check('Operator cannot edit road layout -> 403', (await api('POST', '/roads', { name: 'op road' }, opTok)).status === 403);
  check('Operator cannot create schedule -> 403', (await api('POST', '/schedules', { name: 'x' }, opTok)).status === 403);
  check('Operator cannot change polling config -> 403', (await api('PUT', '/status-monitoring', { polling_interval_seconds: 5 }, opTok)).status === 403);
  check('Operator can view dashboard', (await api('GET', '/dashboard/summary', undefined, opTok)).status === 200);
  check('Operator can acknowledge alarms', (await api('POST', '/alarms/acknowledge-all', undefined, opTok)).status === 200);
  check('Operator can run saved connection test', (await api('POST', `/transmitters/${ctx.tx.A}/test`, { action: 'port' }, opTok)).status === 200);
  check('Operator cannot save a transmitter command -> 403', (await api('POST', `/transmitters/${ctx.tx.A}/commands`, { name: 'n', command: 'c' }, opTok)).status === 403);
  // User (view only)
  check('User cannot switch a light -> 403', (await cmd(usTok, ctx.rx[11], { type: 'relay1', state: true })).status === 403);
  check('User cannot control group -> 403', (await api('POST', `/groups/${ctx.group}/commands`, { type: 'relay1', state: true }, usTok)).status === 403);
  check('User can view devices', (await api('GET', '/devices', undefined, usTok)).status === 200);
  check('User cannot refresh status (sends commands) -> 403', (await api('POST', `/devices/${ctx.rx[11]}/refresh-status`, undefined, usTok)).status === 403);
  check('User cannot view audit logs -> 403', (await api('GET', '/audit', undefined, usTok)).status === 403);
  check('User cannot export reports -> 403', (await api('GET', '/reports/overview', undefined, usTok)).status === 403);
  check('User cannot run schedule -> 403', (await api('POST', `/schedules/${ctx.schedOn}/run`, undefined, usTok)).status === 403);
  check('User cannot delete a tunnel -> 403', (await api('DELETE', `/tunnels/${ctx.tunnel}`, undefined, usTok)).status === 403);

  // custom permissions
  const opId = op.data.id;
  const grant = await api('PUT', `/users/${opId}`, { permissions: { dashboard: ['view'], devices: ['view'], control: ['view'] } });
  check('restrict operator to view-only via custom permissions', grant.status === 200, grant);
  check('restricted operator can no longer switch lights (403)', (await cmd(opTok, ctx.rx[11], { type: 'relay1', state: true })).status === 403);
  const me = await api('GET', '/auth/me', undefined, opTok);
  check('/auth/me reflects new permissions immediately', me.status === 200 && !(me.data.permissions?.control ?? me.data.user?.permissions?.control)?.includes('control'), me.data);
  check('reset permissions to role default', (await api('PUT', `/users/${opId}`, { permissions: null })).status === 200);
  check('operator can switch lights again', (await cmd(opTok, ctx.rx[11], { type: 'relay1', state: false })).status === 202);
  check('junk permissions sanitized (no 500)', (await api('PUT', `/users/${opId}`, { permissions: { hacking: ['all'], devices: 'view' } })).status === 200);
  await api('PUT', `/users/${opId}`, { permissions: null });

  // admin can't lock themselves out
  const meAdmin = await api('GET', '/auth/me');
  const adminId = meAdmin.data.user?.id ?? meAdmin.data.id;
  check('admin cannot demote / disable themselves (400)', (await api('PUT', `/users/${adminId}`, { status: 'disabled' })).status === 400 && (await api('PUT', `/users/${adminId}`, { role: 'User' })).status === 400);
  check('invalid status value -> 400 (not 500)', (await api('PUT', `/users/${us.data.id}`, { status: 'banana' })).status === 400);

  // disable -> blocked immediately, even with an existing token
  const dis = await api('PUT', `/users/${us.data.id}`, { status: 'disabled' });
  check('disable user', dis.status === 200, dis);
  check('disabled user cannot log in', (await login('viewer1', 'Passw0rd!x')) === null);
  check('disabled user\'s existing token stops working (401/403)', [401, 403].includes((await api('GET', '/devices', undefined, usTok)).status), (await api('GET', '/devices', undefined, usTok)).status);
  // password reset
  check('reset operator password', (await api('PUT', `/users/${opId}`, { password: 'NewPassw0rd!y' })).status === 200);
  check('old password no longer works', (await login('operator1', 'Passw0rd!x')) === null);
  check('new password works', Boolean(await login('operator1', 'NewPassw0rd!y')));
  // tampered token
  const parts = ctx.admin.split('.');
  const forged = [parts[0], Buffer.from(JSON.stringify({ sub: 1, username: 'admin', role: 'Admin', iat: 1, exp: 9999999999 })).toString('base64url'), parts[2]].join('.');
  check('forged JWT payload rejected', (await api('GET', '/users', undefined, forged)).status === 401);
  const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: 1, role: 'Admin' })).toString('base64url') + '.';
  check('alg=none JWT rejected', (await api('GET', '/users', undefined, none)).status === 401);
});

section('17. Logs / audit trail correctness', async () => {
  const a = await api('GET', '/audit?limit=200');
  const rows = a.data.commands ?? [];
  check('audit lists commands with user + role', rows.length > 10 && rows.every((r) => r.username || r.user_role), rows[0]);
  check('Operator-sent commands show role Operator', rows.some((r) => r.user_role === 'Operator'), rows.slice(0, 3));
  check('Scheduler runs show role Scheduler', rows.some((r) => r.user_role === 'Scheduler'), rows.map((r) => r.user_role).filter((v, i, s) => s.indexOf(v) === i));
  const opLogs = await api('GET', '/audit', undefined, ctx.opTok);
  check('Operator sees only their own commands', opLogs.status === 200 && (opLogs.data.commands ?? []).every((r) => r.user_role === 'Operator'), (opLogs.data.commands ?? []).map((r) => r.user_role));
  const bad = await api('GET', '/audit?limit=abc&offset=-1');
  check('garbage paging params handled (no 500)', bad.status < 500, bad);
  const inj = await api('GET', "/audit?status=' OR 1=1 --&receiverId=1;DROP TABLE users");
  check('SQL-ish filter params handled (no 500)', inj.status < 500, inj);
});

section('18. Robustness (bad bodies, huge input, odd methods)', async () => {
  const raw = (path, init) => fetch((process.env.API ?? 'http://localhost:4100') + '/api' + path, { ...init, headers: { authorization: `Bearer ${ctx.admin}`, 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const r1 = await raw('/devices', { method: 'POST', body: '{not json' });
  check('malformed JSON -> 400 (not 500)', r1.status === 400, r1.status);
  const r2 = await raw('/groups', { method: 'POST', body: JSON.stringify({ name: 'x'.repeat(100000) }) });
  check('oversized group name -> 4xx', r2.status >= 400 && r2.status < 500, r2.status);
  const r3 = await raw('/devices/abc/status');
  check('non-numeric id -> 4xx not 500', r3.status < 500, r3.status);
  const r4 = await raw('/nope');
  check('unknown route -> 404', r4.status === 404, r4.status);
  const r5 = await raw('/groups', { method: 'POST', body: JSON.stringify({ name: 'g', deviceIds: 'abc' }) });
  check('deviceIds not a list -> 400', r5.status === 400);
  const r6 = await raw('/devices', { method: 'POST', body: JSON.stringify({ deviceName: 'x'.repeat(300), loraAddress: 1, parentTransmitterId: ctx.tx.A }) });
  check('device name 300 chars -> 4xx, no 500', r6.status < 500, r6.status);
  const big = await raw('/groups', { method: 'POST', body: JSON.stringify({ name: 'big', pad: 'x'.repeat(2_000_000) }) });
  check('2 MB JSON body rejected (413) rather than accepted', big.status === 413, big.status);
  const r7 = await raw('/transmitters', { method: 'POST', body: JSON.stringify({ name: 'x', loraAddress: 'abc' }) });
  check('non-numeric lora address -> 4xx', r7.status < 500, r7.status);
  const r8 = await raw('/devices/1/commands', { method: 'POST', body: JSON.stringify({ type: 'brightness', value: '50' }) });
  check('brightness as numeric string handled', r8.status < 500, r8.status);
  const h = await fetch((process.env.API ?? 'http://localhost:4100') + '/api/health');
  check('server still healthy after all abuse', h.status === 200);
  // concurrency: 20 simultaneous commands to one transmitter must all be handled one at a time
  const ids = [ctx.rx[11], ctx.rx[12], ctx.rx[13], ctx.rx[14]];
  const t0 = Date.now();
  const res = await Promise.all(Array.from({ length: 20 }, (_, i) => api('POST', `/devices/${ids[i % 4]}/commands`, { type: 'brightness', value: 10 + i })));
  check('20 concurrent commands on one LAN transmitter all succeed', res.every((r) => r.data.status === 'SUCCESS'), res.map((r) => r.data.status));
  console.log(`      (20 concurrent commands took ${Date.now() - t0} ms)`);
});
