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

function setup({ missing = false, corrupt = false, retry = false, hang = false, initError = false } = {}) {
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
    document, window, crypto: crypto.webcrypto, AbortController, TextEncoder, Blob, Response, DecompressionStream, Event,
    DOMParser: class { parseFromString() { return { getElementById: () => nodes.appRoot }; } },
    console: { warn() {} },
    setTimeout: (fn, delay) => setTimeout(fn, delay === 12000 ? 20 : 0), clearTimeout,
    fetch: async (url, options) => {
      calls.push({ url, options });
      const name = url.split('?')[0];
      const bytes = generated.files.get('public' + name);
      assert.ok(bytes, 'Only manifest files may be requested');
      if (corrupt) return new Response(Buffer.alloc(bytes.length, 1));
      if (hang || (retry && calls.length === 1)) {
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
  return { nodes, scripts, styles, calls, done: vm.runInNewContext(loader, context) };
}

test('generated static delivery files are current, bounded and reproduce the original assets', () => {
  run(true);
  assert.ok(generated.manifest.parts.every((entry) => entry[1] <= 6144));
  assert.ok(generated.files.get('public/stable.html').length < 8192);
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
});

test('incomplete static part is retried; verified application executes exactly once', async () => {
  const app = setup({ retry: true }); await app.done;
  assert.equal(app.calls.length, generated.manifest.parts.length + 1);
  assert.match(app.calls[1].url, /retry=1/);
  assert.equal(app.scripts.length, 4);
  assert.equal(app.nodes.appRoot.hidden, false);
});

test('persistent failure stops after three reads and keeps login disabled', async () => {
  const app = setup({ hang: true }); await app.done;
  assert.equal(app.calls.length, 3);
  assert.equal(app.nodes.appRoot.inert, true);
  assert.equal(app.scripts.length, 0);
  assert.match(app.nodes.startupDetail.textContent, /PART_1/);
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
