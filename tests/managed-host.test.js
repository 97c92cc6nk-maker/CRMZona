'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createRequestHandler, createStore, SupabaseStore } = require('../lib/app');

test('managed image build context only includes application sources', () => {
  const rules = fs.readFileSync(path.join(__dirname, '../.dockerignore'), 'utf8')
    .trim().split(/\r?\n/);
  assert.deepEqual(rules, [
    '**', '!package.json', '!package-lock.json', '!Dockerfile',
    '!lib/', '!lib/**', '!public/', '!public/**', '!client/', '!client/**',
    '!scripts/', '!scripts/**', '**/.env', '**/*.env', '**/*.log', '**/node_modules',
  ]);
});

test('managed builds approve only the pinned video dependency and check its executable', () => {
  const manifest = require('../package.json');
  assert.deepEqual(manifest.allowScripts, { [`ffmpeg-static@${manifest.dependencies['ffmpeg-static']}`]: true });
  const docker = fs.readFileSync(path.join(__dirname, '../Dockerfile'), 'utf8');
  assert.match(docker, /npm ci --omit=dev && node scripts\/check-ffmpeg\.js/);
  require('node:child_process').execFileSync(process.execPath, [path.join(__dirname, '../scripts/check-ffmpeg.js')], { stdio: 'pipe', windowsHide: true });
});

async function serve(t, store) {
  const server = http.createServer(createRequestHandler(store, { standardClient: true, healthchecks: true }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('managed host serves complete compressed assets without fragment bootstrapping', async (t) => {
  const base = await serve(t, {});
  for (const name of ['index.html', 'app.js', 'startup.js', 'styles.css', 'print-forms-model.js',
    'print-forms.js', 'surveillance.js', 'surveillance.css']) {
    const response = await fetch(`${base}/${name}`, { headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-encoding'), 'gzip');
    assert.ok(response.headers.get('content-security-policy').includes("default-src 'self'"));
    const raw = fs.readFileSync(path.join(__dirname, '../public', name));
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), raw);
    assert.ok(Number(response.headers.get('content-length')) < raw.length);
    const cached = await fetch(`${base}/${name}`, { headers: { 'If-None-Match': response.headers.get('etag') } });
    assert.equal(cached.status, 304);
    assert.equal(await cached.text(), '');
  }
  const root = await fetch(base);
  const html = await root.text();
  assert.match(html, /src="\/app.js/);
  assert.doesNotMatch(html, /crmResilientLoading|client-part\?/);
  const identity = await fetch(`${base}/styles.css`, { headers: { 'Accept-Encoding': 'gzip;q=0' } });
  assert.equal(identity.headers.get('content-encoding'), null);
  const head = await fetch(base, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
});

test('liveness is independent of the database and readiness only performs a read', async (t) => {
  let calls = 0;
  const base = await serve(t, {
    async supabaseFetch(url) {
      calls++;
      assert.equal(url, '/rest/v1/app_kv?select=key&limit=0');
      if (calls > 1) throw new Error('private remote details');
      return new Response('[]');
    },
  });
  assert.equal((await fetch(`${base}/health/live`)).status, 200);
  assert.equal(calls, 0);
  assert.equal((await fetch(`${base}/health/ready`)).status, 200);
  const failed = await fetch(`${base}/health/ready`);
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { ok: false, database: 'unavailable' });
});

test('strict Supabase fails closed on reads and writes without constructing temporary storage', async (t) => {
  const originalFetch = global.fetch;
  const names = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'SUPABASE_REQUIRED'];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  t.after(() => {
    global.fetch = originalFetch;
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });
  process.env.SUPABASE_URL = 'https://database.example.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  process.env.SUPABASE_REQUIRED = 'true';
  const store = createStore();
  assert.ok(store instanceof SupabaseStore);
  assert.equal(store.fallbackStore, null);
  global.fetch = async (_, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    throw new Error('private remote failure');
  };
  for (const operation of [() => store.loadJson('users.json', []), () => store.saveJson('users.json', [])]) {
    await assert.rejects(operation, (error) => error.status === 503 && !error.message.includes('private'));
  }
  assert.equal(store.storageStatus().persistent, false);
  global.fetch = async () => new Response('[{"value":[{"id":"existing"}]}]');
  assert.deepEqual(await store.loadJson('users.json', []), [{ id: 'existing' }]);
  assert.equal(store.storageStatus().persistent, true);
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_KEY;
  assert.throws(createStore, /SUPABASE_REQUIRED/);
});
