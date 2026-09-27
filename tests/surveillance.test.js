'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');
const video = require('../lib/surveillance');
const { Store, SupabaseStore, createRequestHandler, permissionsFor } = require('../lib/app');

test('surveillance defaults, explicit access and revocation', () => {
  for (const role of ['owner', 'admin']) assert.equal(permissionsFor({ role }).canViewSurveillance, true);
  for (const role of ['employee', 'runner', 'partner', 'installer']) assert.equal(permissionsFor({ role }).canViewSurveillance, false);
  assert.equal(permissionsFor({ role: 'admin', surveillanceAccessConfigured: true, allowedSections: [] }).canViewSurveillance, false);
  assert.equal(permissionsFor({ role: 'employee', allowedSections: ['surveillance'] }).canViewSurveillance, true);
});

test('camera configuration validates count, protocols, secrets and stable IDs', () => {
  const input = { cameras: [{ id: 'cam1', name: 'Касса', rtspUrl: 'rtsp://user:Secret123@8.8.8.8:554/live' }] };
  const config = video.normalizeConfig(input);
  assert.equal(video.publicConfig(config).cameras[0].configured, true);
  assert.ok(!JSON.stringify(video.publicConfig(config)).includes('Secret123'));
  assert.equal(video.normalizeConfig({ cameras: [{ id: 'cam1', name: 'Новое имя' }] }, config).cameras[0].rtspUrl, input.cameras[0].rtspUrl);
  assert.throws(() => video.normalizeConfig({ cameras: Array(5).fill(input.cameras[0]) }), /четырех/);
  assert.throws(() => video.normalizeConfig({ cameras: [input.cameras[0], input.cameras[0]] }), /уникальны/);
  assert.throws(() => video.normalizeConfig({ cameras: [{ id: 'cam1', name: 'X' }] }), /RTSP/);
  assert.deepEqual(video.normalizeConfig({ cameras: [] }, config).cameras, []);
});

test('public source validation rejects local, reserved and disguised addresses', async () => {
  for (const source of ['http://8.8.8.8/', 'file:///etc/passwd', 'rtsp://127.0.0.1/', 'rtsp://169.254.169.254/', 'rtsp://10.0.0.1/', 'rtsp://192.168.1.1/', 'rtsp://172.16.0.1/', 'rtsp://[::1]/', 'rtsp://[::ffff:127.0.0.1]/', 'rtsp://localhost/', 'rtsp://server.local/', 'rtsp://0.0.0.0/', 'rtsp://224.0.0.1/', 'rtsp://8.8.8.8:70000/', 'rtsp://8.8.8.8/live\r\nOPTIONS']) assert.throws(() => video.parseSource(source), undefined, source);
  assert.equal(video.publicAddress('100.64.0.1'), false);
  assert.equal(video.publicAddress('198.18.0.1'), false);
  await assert.rejects(video.resolveSource('rtsp://camera.example.org/a', async () => ['8.8.8.8', '127.0.0.1']), /публичным/);
  await assert.rejects(video.resolveSource('rtsp://camera.example.org/a', async () => { throw new Error('secret error'); }), /определить/);
  const source = await video.resolveSource('rtsp://camera.example.org/a', async () => ['8.8.8.8']);
  assert.equal(source.address, '8.8.8.8');
});

test('RTSP relay pins control URLs, blocks redirects and preserves packet framing', () => {
  const transform = video.rtspTransform('response', '127.0.0.1:1234', 'camera.example.org:554');
  const body = 'v=0\r\na=control:rtsp://169.254.169.254/private\r\na=control://10.0.0.1/track\r\n';
  const response = Buffer.from(`RTSP/1.0 200 OK\r\nContent-Base: rtsp://10.0.0.1/live/\r\nContent-Type: application/sdp\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  assert.deepEqual(transform(response.subarray(0, 15)), []);
  const result = Buffer.concat(transform(response.subarray(15))).toString();
  assert.ok(!result.includes('169.254.169.254'));
  assert.ok(!result.includes('10.0.0.1'));
  assert.match(result, /rtsp:\/\/127.0.0.1:1234\/private/);
  const packet = Buffer.from([36, 0, 0, 4, 1, 2, 3, 4]);
  assert.deepEqual(Buffer.concat(transform(packet)), packet);
  const redirect = video.rtspTransform('response', '127.0.0.1:1234', '8.8.8.8');
  assert.throws(() => redirect(Buffer.from('RTSP/1.0 302 Found\r\nLocation: rtsp://10.0.0.1\r\n\r\n')), /redirect/);
  const request = Buffer.from('DESCRIBE rtsp://127.0.0.1:1234/live RTSP/1.0\r\nCSeq: 1\r\n\r\n');
  assert.deepEqual(Buffer.concat(video.rtspTransform('request', '127.0.0.1:1234', '8.8.8.8')(request)), request);
});

test('stale checks and changed configuration never appear online', () => {
  const config = { cameras: [{ id: 'cam1', name: 'Test', rtspUrl: 'rtsp://8.8.8.8/live' }] };
  const saved = { fingerprint: video.fingerprint(config), cameras: [{ id: 'cam1', status: 'online', checkedAt: new Date().toISOString() }] };
  assert.equal(video.cameraStates(config, saved)[0].status, 'online');
  assert.equal(video.cameraStates(config, saved, Date.now() + 181000)[0].status, 'unknown');
  saved.fingerprint = 'old';
  assert.equal(video.cameraStates(config, saved)[0].status, 'unknown');
});

test('FFmpeg binary executes and produces an actual JPEG', () => {
  const binary = video.binaryPath(); assert.ok(binary, 'FFmpeg must be installed');
  const result = spawnSync(binary, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=1', '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1'], { windowsHide: true, timeout: 10000 });
  assert.equal(result.status, 0, result.stderr?.toString());
  assert.equal(result.stdout[0], 255); assert.equal(result.stdout[1], 216); assert.ok(result.stdout.length > 1000);
});

test('deployment health confirms the bundled decoder without exposing camera sources', () => {
  let data;
  require('../api/health')({}, { setHeader() {}, end(value) { data = JSON.parse(value); } });
  assert.deepEqual(data.surveillance, { mode: 'rtsp-snapshots', engineBundled: true });
});

test('checks persist metadata, not images/secrets, and classify service failures separately', async () => {
  const records = new Map(), audit = [];
  const pointId = cryptoRandom();
  const config = { cameras: [{ id: 'cam1', name: 'One', rtspUrl: 'rtsp://user:SECRET@8.8.8.8/a' }, { id: 'cam2', name: 'Two', rtspUrl: 'rtsp://8.8.4.4/a' }] };
  records.set(video.recordKey('config', pointId), config);
  const store = { loadJson: async (key) => records.get(key), saveJson: async (key, value) => records.set(key, value), storageStatus: () => ({ persistent: true }), audit: async (...args) => audit.push(args) };
  let calls = 0;
  const capture = async () => { calls++; if (calls === 1) return Buffer.from([255, 216, 255, 217]); throw new Error('SECRET subprocess details'); };
  const result = await video.checkPoint(store, pointId, config, { id: 'owner' }, capture);
  assert.equal(result.cameras[0].status, 'online'); assert.equal(result.cameras[1].status, 'offline');
  assert.ok(!JSON.stringify(result).includes('SECRET'));
  const saved = records.get(video.recordKey('status', pointId));
  assert.ok(!JSON.stringify(saved).includes('base64'));
  assert.ok(!JSON.stringify(audit).includes('SECRET'));
  await video.checkPoint(store, pointId, config, { id: 'owner' }, capture); assert.equal(calls, 2);
  const secondId = cryptoRandom(); records.set(video.recordKey('config', secondId), config);
  const unavailable = await video.checkPoint(store, secondId, config, { id: 'owner' }, async () => { const e = new Error('Engine unavailable'); e.status = 503; throw e; });
  assert.equal(unavailable.cameras[0].status, 'unknown');
});
function cryptoRandom() { return require('crypto').randomUUID(); }

test('surveillance HTTP authorization, all points, config persistence and access revocation', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-video-test-'));
  const store = new Store(dir);
  const owner = store.createUser({ fullName: 'Владелец Тест', phone: '+79990000001', email: 'video-owner@example.com', password: 'LocalTest123!', role: 'owner' });
  const admin = store.createUser({ fullName: 'Администратор Тест', phone: '+79990000002', email: 'video-admin@example.com', password: 'LocalTest123!', role: 'admin', unofficialSalary: '1', allowedSections: ['points'], allowedPoints: ['moscow_6231'] });
  const employee = store.createUser({ fullName: 'Сотрудник Тест', phone: '+79990000003', email: 'video-employee@example.com', password: 'LocalTest123!', role: 'employee', allowedSections: ['points'] });
  const server = http.createServer(createRequestHandler(store));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const cookies = { owner: `session=${store.createSession(owner.id)}`, admin: `session=${store.createSession(admin.id)}`, employee: `session=${store.createSession(employee.id)}` };
  const request = (route, role, method = 'GET', body) => fetch(`${base}${route}`, { method, headers: { Cookie: cookies[role] || '', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await request('/api/surveillance')).status, 401);
  assert.equal((await request('/api/surveillance', 'employee')).status, 403);
  assert.equal((await request('/api/surveillance/check/moscow_6231', 'employee', 'POST')).status, 403);
  const directory = await (await request('/api/surveillance', 'admin')).json();
  assert.ok(directory.points.length >= 2);
  assert.equal(directory.points.find((p) => p.id === 'moscow_6231').adminId, admin.id);
  const route = '/api/surveillance/config/krasnogorsk_466';
  assert.equal((await request(route, 'employee')).status, 403);
  assert.equal((await request(route, 'employee', 'PUT', { cameras: [] })).status, 403);
  const payload = { cameras: [{ id: 'cam1', name: 'Касса', rtspUrl: 'rtsp://user:SECRET_VIDEO@8.8.8.8:554/live' }] };
  const response = await request(route, 'admin', 'PUT', payload); assert.equal(response.status, 200, await response.clone().text());
  let config = (await response.json()).config;
  assert.ok(config.revision); assert.ok(!JSON.stringify(config).includes('SECRET_VIDEO'));
  assert.equal((await request(route, 'owner', 'PUT', payload)).status, 409);
  assert.equal((await request(route, 'owner', 'PUT', { revision: config.revision, cameras: [{ id: 'cam1', name: 'Вход' }] })).status, 200);
  const onDisk = new Store(dir).loadJson(video.recordKey('config', 'krasnogorsk_466'), null);
  assert.equal(onDisk.cameras[0].rtspUrl, payload.cameras[0].rtspUrl);
  for (const endpoint of ['/api/surveillance', '/api/retail-points', '/api/me']) {
    const text = await (await request(endpoint, 'owner')).text(); assert.ok(!text.includes('SECRET_VIDEO'), endpoint);
  }
  assert.ok(store.readAudit().some((a) => a.action === 'surveillance.config_saved'));
  assert.ok(!JSON.stringify(store.readAudit()).includes('SECRET_VIDEO'));
  store.updateUser(owner, employee.id, { allowedSections: ['surveillance'] });
  assert.equal((await request('/api/surveillance', 'employee')).status, 200);
  assert.equal((await request(route, 'employee')).status, 403);
  store.updateUser(owner, admin.id, { allowedSections: ['points'] });
  assert.equal((await request('/api/surveillance', 'admin')).status, 403);
  assert.deepEqual(store.listUsers().find((u) => u.id === admin.id).allowedPoints, ['moscow_6231']);
  store.storageWarning = { persistent: false };
  assert.equal((await request('/api/surveillance', 'owner')).status, 503);
  assert.equal((await request(route, 'owner', 'PUT', { cameras: [] })).status, 503);
});

test('Supabase permission updates persist an explicit surveillance access decision', async () => {
  const records = [{ id: 'admin', role: 'admin', fullName: 'Тестовый Администратор', email: 'a@example.com', phone: '+79990000004', unofficialSalary: '1' }];
  const store = Object.create(SupabaseStore.prototype);
  store.listUsers = async () => records; store.saveUsers = async () => {}; store.audit = async () => {};
  await store.updateUser({ id: 'owner', role: 'owner' }, 'admin', { allowedSections: ['surveillance'] });
  assert.equal(records[0].surveillanceAccessConfigured, true);
  assert.equal(permissionsFor(records[0]).canViewSurveillance, true);
});
