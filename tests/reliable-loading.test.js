'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { build, run } = require('../scripts/build-client');
const root = path.resolve(__dirname, '..');
const loader = fs.readFileSync(path.join(root, 'client/reliable-loader.js'), 'utf8');
const generated = build();

test('production entry routes use small-part delivery, preserving API and diagnostic routes', () => {
  const { routes } = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const resolve = (url) => {
    const route = routes.find(({ src }) => new RegExp('^(?:' + src + ')$').test(url));
    return url.replace(new RegExp('^(?:' + route.src + ')$'), route.dest);
  };
  for (const entry of ['/', '/index.html', '/stable.html']) {
    assert.equal(resolve(entry), '/public/stable.html');
  }
  assert.equal(resolve('/api/health'), '/api/health.js');
  assert.equal(resolve('/api/me'), '/api/index.js');
  assert.equal(resolve('/connection.html'), '/public/connection.html');
  for (const [name] of generated.manifest.parts) {
    assert.equal(resolve('/client-parts/' + name), '/public/client-parts/' + name);
  }
  const shell = generated.files.get('public/stable.html').toString();
  assert.match(shell, /id="clientManifest"/);
  assert.doesNotMatch(shell, /(?:href|src)="\/(?:styles\.css|app\.js|startup\.js)"/);
});

function setup({ missing = false, corrupt = false, retry = false, hang = false, initError = false,
  storage = new Map(), blockedStorage = false, failFrom = Infinity, elapsedPerPart = 0 } = {}) {
  let elapsed = 0, inFlight = 0, maxInFlight = 0;
  const nodes = {
    clientManifest: { textContent: JSON.stringify(generated.manifest) },
    startupScreen: { hidden: false }, startupMessage: {}, startupDetail: {},
    appRoot: { hidden: true, inert: true, querySelector: () => null, replaceWith() {} },
  };
  const scripts = [], styles = [], calls = [];
  const document = {
    documentElement: { dataset: {} },
    getElementById: (id) => nodes[id],
    adoptNode: (node) => node,
    createElement: (tag) => ({ tag }),
    head: { append: (element) => styles.push(element.textContent) },
    body: { append: (element) => scripts.push(element.textContent) },
    dispatchEvent: () => { if (!initError) document.documentElement.dataset.appReady = 'true'; },
  };
  const window = { crypto: crypto.webcrypto, DecompressionStream: missing ? null : DecompressionStream, addEventListener() {}, removeEventListener() {} };
  const context = {
    document, window, crypto: crypto.webcrypto, AbortController, TextEncoder, Blob, Response, DecompressionStream, Event, atob, btoa,
    Date: class extends Date { static now() { return elapsed; } },
    sessionStorage: {
      getItem(key) { if (blockedStorage) throw new Error('Storage blocked'); return storage.get(key) || null; },
      setItem(key, value) { if (blockedStorage) throw new Error('Storage blocked'); storage.set(key, value); },
      removeItem(key) { storage.delete(key); },
    },
    DOMParser: class { parseFromString() { return { getElementById: () => nodes.appRoot }; } },
    console: { warn() {} },
    setTimeout: (fn, delay) => setTimeout(fn, delay === 12000 ? 20 : 0), clearTimeout,
    fetch: async (url, options) => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      options.signal.addEventListener('abort', () => { inFlight--; }, { once: true });
      calls.push({ url, options });
      const name = url.split('?')[0];
      const bytes = generated.files.get('public' + name);
      assert.ok(bytes, 'Only manifest files may be requested');
      elapsed += elapsedPerPart;
      if (corrupt) return new Response(Buffer.alloc(bytes.length, 1));
      if (hang || Number(name.match(/part-(\d+)-/)[1]) >= failFrom || (retry && calls.length === 1)) {
        return new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(bytes.subarray(0, 100));
            options.signal.addEventListener('abort', () => controller.error(new Error('Aborted')));
          },
        }));
      }
      // All bytes arrive but EOF never does, reproducing the reported failure.
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes); } }));
    },
  };
  return { nodes, scripts, styles, calls, storage, maxInFlight: () => maxInFlight, done: vm.runInNewContext(loader, context) };
}

test('generated static delivery files are current, bounded and reproduce the original assets', () => {
  run(true);
  assert.ok(generated.manifest.parts.every((entry) => entry[1] <= 6144));
  assert.ok(generated.files.get('public/stable.html').length < 12288);
  assert.ok(zlib.gzipSync(generated.files.get('public/stable.html')).length < 6144);
  const decoded = JSON.parse(zlib.gunzipSync(generated.packed));
  assert.deepEqual(decoded, generated.bundle);
  assert.match(decoded.html, /id="appRoot" hidden inert/);
});

test('all reconstructed code and styles have CSP hashes, without unsafe-inline or eval', () => {
  const csp = JSON.parse(generated.files.get('lib/client-csp.json'));
  const shell = generated.files.get('public/stable.html').toString();
  const texts = [loader.replace(/\r\n/g, '\n'), ...generated.bundle.scripts];
  for (const text of texts) assert.ok(csp.scripts.includes("'sha256-" + crypto.createHash('sha256').update(text).digest('base64') + "'"));
  for (const text of generated.bundle.styles) assert.ok(csp.styles.includes("'sha256-" + crypto.createHash('sha256').update(text).digest('base64') + "'"));
  assert.ok(!shell.includes('eval('));
  assert.ok(!shell.includes('DOMContentLoaded'));
});

test('complete verified bodies load without waiting for HTTP EOF or DOMContentLoaded', async () => {
  const app = setup(); await app.done;
  assert.equal(app.nodes.appRoot.hidden, false);
  assert.equal(app.nodes.appRoot.inert, false);
  assert.equal(app.nodes.startupScreen.hidden, true);
  assert.deepEqual(app.scripts, generated.bundle.scripts);
  assert.deepEqual(app.styles, generated.bundle.styles);
  assert.ok(app.calls.every(({ options }) => options.signal.aborted && options.credentials === 'omit'));
  assert.equal(app.maxInFlight(), 2);
});

test('incomplete static part is retried; verified application executes exactly once', async () => {
  const app = setup({ retry: true }); await app.done;
  assert.equal(app.calls.length, generated.manifest.parts.length + 1);
  assert.equal(app.calls.filter(({ url }) => url.includes('?retry=1')).length, 1);
  assert.equal(app.scripts.length, 4);
  assert.equal(app.nodes.appRoot.hidden, false);
});

test('persistent failure stops each worker after at most three reads and keeps login disabled', async () => {
  const app = setup({ hang: true }); await app.done;
  assert.ok(app.calls.length <= 6);
  assert.ok(app.calls.every(({ options }) => options.signal.aborted));
  assert.equal(app.nodes.appRoot.inert, true);
  assert.equal(app.scripts.length, 0);
  assert.match(app.nodes.startupDetail.textContent, /PART_[12]/);
  assert.match(app.nodes.startupDetail.textContent, /100\/6144/);
  assert.match(app.storage.get('crm.loadFailure'), /TIMEOUT/);
});

test('slow successful transfers are not cut off by the former two-minute global deadline', async () => {
  const app = setup({ elapsedPerPart: 10000 }); await app.done;
  assert.equal(app.calls.length, generated.manifest.parts.length);
  assert.equal(app.nodes.appRoot.hidden, false);
  assert.equal(app.scripts.length, 4);
});

test('reload resumes verified public parts; private storage restrictions do not prevent loading', async () => {
  const storage = new Map();
  const interrupted = setup({ storage, failFrom: 2 }); await interrupted.done;
  assert.equal(interrupted.scripts.length, 0);
  assert.equal(Object.keys(JSON.parse(storage.get('crm.client')).parts).length, 2);
  const resumed = setup({ storage }); await resumed.done;
  assert.equal(resumed.calls.length, generated.manifest.parts.length - 2);
  assert.equal(resumed.nodes.appRoot.hidden, false);
  assert.equal(storage.has('crm.loadFailure'), false);
  const blocked = setup({ blockedStorage: true }); await blocked.done;
  assert.equal(blocked.nodes.appRoot.hidden, false);
  const blockedFailure = setup({ blockedStorage: true, hang: true }); await blockedFailure.done;
  assert.match(blockedFailure.nodes.startupDetail.textContent, /Кэш браузера недоступен/);
});

test('cached parts are checksum-verified again; old or malformed cache is ignored', async () => {
  const storage = new Map();
  const initial = setup({ storage }); await initial.done;
  const cached = JSON.parse(storage.get('crm.client'));
  cached.parts[generated.manifest.parts[0][0]] = Buffer.alloc(6144).toString('base64');
  storage.set('crm.client', JSON.stringify(cached));
  const repaired = setup({ storage }); await repaired.done;
  assert.equal(repaired.calls.length, 1);
  assert.deepEqual(repaired.scripts, generated.bundle.scripts);
  for (const value of ['null', '{broken', JSON.stringify({ hash: 'old', parts: cached.parts })]) {
    storage.set('crm.client', value);
    const app = setup({ storage }); await app.done;
    assert.equal(app.calls.length, generated.manifest.parts.length);
    assert.equal(app.nodes.appRoot.hidden, false);
  }
});

test('connection diagnostics check actual bounded parts, with matching generated CSP', () => {
  const html = generated.files.get('public/connection.html').toString();
  const csp = JSON.parse(generated.files.get('lib/client-csp.json'));
  for (const [name] of generated.manifest.parts) assert.ok(html.includes(name));
  assert.ok(!html.includes('/styles.css'));
  assert.ok(html.includes('crm.loadFailure'));
  assert.ok(html.includes(String(generated.files.get('public/stable.html').length)));
  for (const [, type, code] of html.matchAll(/<(style|script)>([\s\S]*?)<\/\1>/g)) {
    const digest = "'sha256-" + crypto.createHash('sha256').update(code).digest('base64') + "'";
    assert.ok(csp[type === 'style' ? 'styles' : 'scripts'].includes(digest));
  }
});

test('corrupt payload never executes; unsupported browser and init errors are explicit', async () => {
  const corrupt = setup({ corrupt: true }); await corrupt.done;
  assert.equal(corrupt.scripts.length, 0);
  assert.equal(corrupt.nodes.appRoot.hidden, true);
  const missing = setup({ missing: true }); await missing.done;
  assert.match(missing.nodes.startupDetail.textContent, /UPDATE_BROWSER/);
  assert.equal(missing.calls.length, 0);
  const broken = setup({ initError: true }); await broken.done;
  assert.match(broken.nodes.startupDetail.textContent, /APP_INIT/);
  assert.equal(broken.nodes.appRoot.inert, true);
});
