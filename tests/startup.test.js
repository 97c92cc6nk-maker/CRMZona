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

test('saved schedule employee stays selected even when absent from the active directory', () => {
  const context = apiFixture(async () => {});
  context.document.createElement = (tagName) => ({ tagName, dataset: {}, children: [], append(child) { this.children.push(child); } });
  vm.runInContext(`state.canEditSchedule = true; state.canManageAllSchedule = true;
    state.employeeOptions = [{ id: 'active', fullName: 'Active Test' }]; state.runnerOptions = [];`, context);
  for (const rowType of ['employee', 'runner']) {
    context.savedRow = { employeeId: 'archived', employeeName: 'Archived Test', rowType };
    const cell = vm.runInContext('scheduleEmployeeCell(savedRow)', context);
    const select = cell.children[0];
    assert.equal(select.value, 'archived');
    assert.equal(select.children.find((option) => option.value === 'archived').textContent, 'Archived Test (сохраненная строка)');
    assert.equal(select.children.find((option) => option.value === 'archived').selected, true);
    assert.equal(context.savedRow.employeeId, 'archived');
    assert.equal(vm.runInContext('state.employeeOptions.length', context), 1);
    assert.equal(vm.runInContext('state.runnerOptions.length', context), 0);
  }
  vm.runInContext("state.canManageAllSchedule = false; state.user = { id: 'active' };", context);
  const readOnly = vm.runInContext('scheduleEmployeeCell(savedRow)', context);
  assert.equal(readOnly.textContent, 'Archived Test');
  assert.equal(readOnly.children.length, 0);
});

test('management report keeps aligned column metadata, accessible inputs, full addresses and totals', () => {
  const context = apiFixture(async () => {});
  function node(tagName) {
    const el = { tagName, dataset: {}, attributes: {}, children: [], className: '',
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      setAttribute(key, value) { this.attributes[key] = value; },
      removeAttribute(key) { delete this.attributes[key]; },
      querySelector() { return null; },
    };
    el.classList = { add(name) { el.className += ` ${name}`; }, remove() {}, toggle() {} };
    return el;
  }
  context.document.createElement = node;
  context.reportContent = node('div');
  context.heading = node('h3');
  context.saveButton = node('button');
  context.rowData = { pointId: 'point', pointName: 'Тестовая точка', address: 'Полный длинный адрес с номером дома и помещения',
    number: 1, salary: '100', rent: '20', manager: '14', utilities: '5', reward: '200', taxRate: '8', profitDistributionRate: '100',
    notes: { pointName: { text: 'Примечание', createdByName: 'Автор' } } };
  vm.runInContext(`els.reportContent = reportContent; els.reportDetailsTitle = heading; els.saveAdminPayrollReport = saveButton;
    state.permissions.canManageReports = true;
    state.managementReport = { title: 'Управленческий отчет', month: '2026-11', rows: [rowData] };
    renderManagementReport();`, context);
  const wrap = context.reportContent.children[0];
  assert.match(wrap.className, /management-report-wrap/);
  assert.equal(wrap.tabIndex, 0);
  assert.equal(wrap.attributes.role, 'region');
  const [columns, head, body, foot] = wrap.children[0].children;
  const keys = columns.children.map((col) => col.dataset.managementColumn);
  assert.equal(keys.length, 22);
  for (const section of [head, body, foot]) assert.deepEqual(section.children[0].children.map((cell) => cell.dataset.managementColumn), keys);
  assert.ok(head.children[0].children.every((cell) => cell.scope === 'col'));
  const cells = body.children[0].children;
  assert.equal(cells[2].children[0].textContent, context.rowData.address);
  assert.equal(cells[2].children[0].title, context.rowData.address);
  assert.equal(cells[5].children[0].attributes['aria-label'], 'Коммуналка: Тестовая точка');
  assert.equal(cells[5].children[0].disabled, false);
  assert.equal(cells[1].children[0].children[0].textContent, 'Примечание');
  const footer = foot.children[0].children;
  assert.equal(footer[0].textContent, '');
  assert.equal(footer[1].textContent, 'Итого');
  assert.equal(footer[14].textContent, '139');
  assert.equal(footer[21].textContent, '45');
  vm.runInContext('state.permissions.canManageReports = false; renderManagementReport();', context);
  assert.equal(context.reportContent.children[0].children[0].children[2].children[0].children[5].children[0].disabled, true);
  vm.runInContext('state.managementReport.rows = []; renderManagementReport();', context);
  assert.equal(context.reportContent.children[0].children[0].children[2].children[0].children[0].colSpan, 22);
});

test('point cost forms submit only new dated entries and preserve zero', () => {
  const context = apiFixture(async () => {});
  const payload = (input) => {
    context.costValues = input;
    return JSON.parse(JSON.stringify(vm.runInContext('retailPointCostPayload(costValues)', context)));
  };
  assert.deepEqual(payload({ rentCost: '', rentCostEffectiveDate: '', managerCost: '' }), {});
  assert.deepEqual(payload({ managerCost: '0', managerCostEffectiveDate: '2026-07-01' }), { managerCost: '0', managerCostEffectiveDate: '2026-07-01' });
  assert.throws(() => payload({ rentCost: '500' }), /дату применения/);
  assert.throws(() => payload({ rentCostEffectiveDate: '2026-10-01' }), /укажите сумму/);
  assert.match(index, /data-point-cost-history="rentCost"/);
  assert.match(index, /data-point-cost-history="managerCost"/);
});

test('repair rows show a plain-text point address after the point and a missing-address notice', () => {
  const context = apiFixture(async () => {});
  context.document.createElement = (tagName) => ({ tagName, dataset: {}, children: [], append(child) { this.children.push(child); } });
  context.repair = { id: 'test', pointName: 'Test point', pointAddress: '<img src=x onerror=alert(1)> Test street', title: 'Test repair', createdAt: '2026-11-03T10:00:00.000Z', statusLabel: 'New' };
  const row = vm.runInContext('buildRepairRow(repair)', context);
  assert.equal(row.children.length, 10);
  assert.equal(row.children[1].textContent, 'Test point');
  assert.equal(row.children[2].textContent, context.repair.pointAddress);
  assert.equal(row.children[2].className, 'repair-address-cell');
  assert.equal(row.children[2].innerHTML, undefined);
  context.repair.pointAddress = '';
  assert.equal(vm.runInContext('buildRepairRow(repair).children[2].textContent', context), 'Адрес не указан');
});

test('repair deletion requires its own permission and confirmation; failed deletes preserve the row', async () => {
  const requests = [];
  let fail = false, confirmed = false, prompts = 0;
  const context = apiFixture(async (url, options) => {
    requests.push({ url, method: options.method });
    return { ok: !fail, status: fail ? 503 : 200, text: async () => JSON.stringify(fail ? { error: 'Drive unavailable' } : { repair: { id: 'test' } }) };
  });
  context.window.confirm = () => { prompts++; return confirmed; };
  context.document.createElement = (tagName) => ({ tagName, dataset: {}, children: [], append(child) { this.children.push(child); } });
  vm.runInContext(`state.repairs = [{ id: 'test', title: 'Test repair' }]; state.permissions.canManageRepairs = true;
    els.repairsNotice = {}; renderRepairs = () => {}; loadAudit = async () => {};`, context);
  assert.equal(vm.runInContext('repairActionsCell(state.repairs[0]).children.length', context), 0);
  vm.runInContext('state.permissions.canDeleteRepairs = true;', context);
  const button = vm.runInContext('repairActionsCell(state.repairs[0]).children[0]', context);
  assert.equal(button.textContent, 'Удалить');
  context.event = { target: { closest: () => button } };
  await vm.runInContext('handleRepairTableClick(event)', context);
  assert.equal(prompts, 1);
  assert.equal(requests.length, 0);
  confirmed = true;
  fail = true;
  await vm.runInContext('handleRepairTableClick(event)', context);
  assert.equal(vm.runInContext('state.repairs.length', context), 1);
  assert.equal(vm.runInContext('els.repairsNotice.textContent', context), 'Drive unavailable');
  assert.equal(button.disabled, false);
  fail = false;
  await vm.runInContext('handleRepairTableClick(event)', context);
  assert.equal(vm.runInContext('state.repairs.length', context), 0);
  assert.deepEqual(requests, [{ url: '/api/repairs/test', method: 'DELETE' }, { url: '/api/repairs/test', method: 'DELETE' }]);
  vm.runInContext('state.permissions.canDeleteRepairs = false;', context);
  await vm.runInContext('handleRepairTableClick(event)', context);
  assert.equal(prompts, 3);
});

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
