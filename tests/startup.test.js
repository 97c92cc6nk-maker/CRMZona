'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const index = read('public/index.html');
const startup = read('public/startup.js');
const app = read('public/app.js');

function events(object = {}) {
  const listeners = new Map();
  return Object.assign(object, {
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
    emit(type, event = {}) { for (const callback of listeners.get(type) || []) callback(event); },
  });
}

function fixture({ cached = false, ready = false, initFailed = false } = {}) {
  const nodes = {
    startupScreen: { hidden: false },
    startupMessage: {}, startupDetail: {},
    appRoot: { hidden: true, inert: true },
  };
  const assets = ['styles.css', 'surveillance.css', 'app.js'].map((file) => ({
    tagName: file.endsWith('.css') ? 'LINK' : 'SCRIPT',
    href: '/' + file, src: '/' + file, media: 'print', sheet: cached ? {} : null,
    hasAttribute: (name) => name === 'data-startup-asset',
  }));
  const document = events({
    documentElement: { dataset: { appReady: String(ready), appFailed: String(initFailed) } },
    getElementById: (id) => nodes[id],
    querySelectorAll: () => assets,
  });
  const window = events();
  const timers = new Map();
  vm.runInNewContext(startup, {
    document, window, URL, location: new URL('https://crm.example/'), console: { warn() {} },
    setTimeout: (callback) => { const id = timers.size + 1; timers.set(id, callback); return id; },
    clearTimeout: (id) => timers.delete(id),
  });
  return { nodes, assets, document, window, timers };
}

test('entry HTML renders fallback before assets; forms are inert until initialization', () => {
  assert.match(index, /id="appRoot" hidden inert/);
  assert.ok(index.indexOf('id="startupScreen"') < index.indexOf('src="/startup.js"'));
  assert.ok(index.indexOf('id="startupScreen"') < 2048);
  for (const link of index.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)) {
    assert.match(link[0], /media="print"/);
    assert.match(link[0], /data-startup-asset/);
  }
  for (const name of ['app', 'print-forms-model', 'print-forms', 'surveillance']) {
    assert.ok(index.includes(`src="/${name}.js" defer data-startup-asset`));
  }
  assert.match(index, /<\/div>\s*<div id="printOutput">/);
});

test('all inline bootstrap and diagnostic code is explicitly allowed by CSP', () => {
  const server = read('lib/app.js');
  const generatedCsp = JSON.parse(read('lib/client-csp.json'));
  for (const file of ['public/index.html', 'public/connection.html']) {
    for (const match of read(file).matchAll(/<(style|script)(?: [^>]*)?>([\s\S]*?)<\/\1>/g)) {
      if (!match[2]) continue;
      const hash = crypto.createHash('sha256').update(match[2].replace(/\r\n/g, '\n')).digest('base64');
      assert.ok(server.includes(`'sha256-${hash}'`) || [...generatedCsp.scripts, ...generatedCsp.styles].includes(`'sha256-${hash}'`), `Missing CSP hash for ${file} ${match[1]}`);
    }
  }
  assert.ok(Buffer.byteLength(read('public/connection.html')) < 8192);
});

test('cached styles and already initialized app unlock safely even if startup script arrives late', () => {
  const { nodes, assets, timers } = fixture({ cached: true, ready: true });
  assert.equal(nodes.appRoot.hidden, false);
  assert.equal(nodes.appRoot.inert, false);
  assert.equal(nodes.startupScreen.hidden, true);
  assert.equal(assets[0].media, 'all');
  assert.equal(timers.size, 0);
});

test('CSS stall keeps fallback visible; late download can still finish loading', () => {
  const { nodes, assets, document, timers } = fixture({ ready: true });
  [...timers.values()][0]();
  assert.equal(nodes.appRoot.hidden, true);
  assert.equal(nodes.appRoot.inert, true);
  assert.match(nodes.startupDetail.textContent, /styles.css/);
  for (const asset of assets.slice(0, 2)) {
    asset.sheet = {};
    document.emit('load', { target: asset });
  }
  assert.equal(nodes.appRoot.hidden, false);
});

test('missing script or initialization failure never enables native form submission', () => {
  const { nodes, assets, window, document } = fixture({ cached: true });
  window.emit('error', { target: assets[2] });
  document.documentElement.dataset.appReady = 'true';
  document.emit('crm:ready');
  assert.equal(nodes.appRoot.inert, true);
  assert.match(nodes.startupDetail.textContent, /ASSET_FAILED/);
  assert.match(nodes.startupDetail.textContent, /app.js/);
  const failed = fixture({ cached: true, ready: true, initFailed: true });
  assert.equal(failed.nodes.appRoot.hidden, true);
  assert.match(failed.nodes.startupDetail.textContent, /APP_INIT/);
});

test('ready event alone does not unlock the UI while styles are still missing', () => {
  const { nodes, document } = fixture();
  document.documentElement.dataset.appReady = 'true';
  document.emit('crm:ready');
  assert.equal(nodes.appRoot.hidden, true);
});

function apiFixture(fetch, resilient = false) {
  const context = vm.createContext({
    document: { addEventListener() {} }, window: { crmResilientLoading: resilient }, fetch, AbortController, TextDecoder, setTimeout, clearTimeout,
  });
  vm.runInContext(app, context);
  return context;
}

test('API timeout covers response body stalls, not only HTTP headers', async () => {
  const context = apiFixture(async (_, options) => ({
    text: () => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Aborted')))),
  }));
  await assert.rejects(vm.runInContext("api('/api/me', { timeoutMs: 5 })", context), /не передал полный ответ вовремя/);
});

test('write timeouts describe uncertain result and do not retry', async () => {
  let calls = 0;
  const context = apiFixture((_, options) => {
    calls++;
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Aborted'))));
  });
  await assert.rejects(vm.runInContext("api('/api/schedule', { method: 'PUT', body: {}, timeoutMs: 5 })", context), /Результат операции неизвестен/);
  assert.equal(calls, 1);
});

test('API preserves unauthorized status and valid payloads', async () => {
  const denied = apiFixture(async () => ({ ok: false, status: 401, text: async () => '{"error":"Войдите"}' }));
  await assert.rejects(vm.runInContext("api('/api/me')", denied), (error) => error.status === 401);
  const success = apiFixture(async () => ({ ok: true, text: async () => '{"ok":true}' }));
  assert.equal((await vm.runInContext("api('/api/me')", success)).ok, true);
});

test('resilient API reads a complete JSON object without waiting for EOF or retrying writes', async () => {
  let calls = 0;
  const context = apiFixture(async () => {
    calls++;
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('{"user":{"id":1}'));
      controller.enqueue(new TextEncoder().encode(',"ok":true}'));
    } }), { headers: { 'Content-Type': 'application/json' } });
  }, true);
  const result = await vm.runInContext("api('/api/example', { method: 'POST', body: {}, timeoutMs: 100 })", context);
  assert.equal(result.ok, true);
  assert.equal(result.user.id, 1);
  assert.equal(calls, 1);
});
