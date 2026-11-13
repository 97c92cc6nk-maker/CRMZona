'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { KEY, FIELDS, validateHistory, historicalSource } = require('../lib/financial-history');
const { buildFinancialModel, monthsThrough } = require('../lib/financial-model');
const { SEED, capitalCost, getRates, moscowDate } = require('../lib/financial-rates');
const { Store, createRequestHandler } = require('../lib/app');
const { importHistory } = require('../scripts/import-financial-history');
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.02, `${a} != ${b}`);

function fixture() {
  const cohorts = [50, 100].map((share) => ({ profitDistributionRate: share, rowCount: 2,
    salary: 300000, reward: 1050000, totalExpenses: 500000, taxes: 84000,
    profit: (1050000 - 500000 - 84000) * share / 100,
    revenue: 9000000, issued: 1000, accountingPayrollTaxesOther: 50000 }));
  const totals = Object.fromEntries(FIELDS.map((key) => [key, cohorts.reduce((n, row) => n + row[key], 0)]));
  const sourceCells = Object.fromEntries(FIELDS.map((key, i) => [key, { cell: `${String.fromCharCode(65 + i)}9`,
    formula: '=SUM(A2:A8)', value: totals[key], method: 'excel_total' }]));
  return { version: 1, source: { name: 'synthetic.xlsx', sha256: 'a'.repeat(64) },
    assumptions: { ausnCompanyCount: 6, taxGrouping: 'network', profitShares: 'excel' },
    months: Object.fromEntries(monthsThrough('2026-08', '2026-11-13', '2024-01').map((month) => [month,
      structuredClone({ month, sheet: month, totalRow: 9, totals, cohorts, sourceCells, warnings: [] })])) };
}

test('history validates 32 months, provenance and ownership groups, rejecting altered totals', () => {
  assert.equal(Object.keys(validateHistory(fixture()).months).length, 32);
  for (const mutate of [
    (h) => { delete h.months['2024-01']; },
    (h) => { h.months['2026-09'] = h.months['2026-08']; },
    (h) => { h.months['2024-01'].totals.profit++; },
    (h) => { h.months['2024-01'].cohorts[0].profitDistributionRate = 25; },
    (h) => { h.months['2024-01'].sourceCells.profit.value++; },
    (h) => { h.assumptions.ausnCompanyCount = 5; },
  ]) { const h = fixture(); mutate(h); assert.throws(() => validateHistory(h)); }
  assert.throws(() => monthsThrough('2024-01', '2026-11-13', '2023-12'));
  assert.throws(() => monthsThrough('2026-07', '2026-11-13', '2026-08'));
  assert.equal(monthsThrough('2026-09', '2026-11-13', '2024-01').length, 33);
});

test('historical scenarios retain Excel fact and shares, use network taxes and always six IP salaries', () => {
  const history = validateHistory(fixture());
  const before = JSON.stringify(history);
  const source = historicalSource(history, '2024-01');
  const m = buildFinancialModel({ sources: [source], rates: SEED, asOf: '2026-11-13' }).months[0];
  assert.equal(m.historical, true);
  assert.equal(m.current.reward, 2100000);
  assert.equal(m.current.profit, 699000);
  assert.equal(m.current.expenses, 1000000);
  assert.equal(m.ausn.companyCount, 6);
  assert.equal(m.ausn.officialNet, 1800000);
  near(m.ausn.officialGross, 1800000 / 0.87);
  near(m.ausn.ndfl, 1800000 / 0.87 * 0.13);
  assert.equal(m.ausn.payrollTopUp, 1200000);
  assert.equal(m.ausn.excludedPayroll, 0);
  near(m.ausn.expenses, 900000 + 1200000 + 1800000 / 0.87 * 0.13);
  near(m.ausn.deductibleExpenses, 300000 + 1800000 / 0.87);
  assert.equal(m.ausn.minimumTax, 63000);
  assert.equal(m.ausn.businessTax, 63000);
  assert.equal(m.ausnCompanies.length, 1, 'Minimum is evaluated over the network, not invented IP splits');
  assert.equal(m.companies.length, 1);
  assert.equal(m.usn.deduction, Math.min(m.usn.contributions, m.usn.usnBefore / 2));
  for (const [key, points] of [['usn', m.points], ['usn15', m.usn15Points], ['ausn', m.ausnPoints]]) {
    near(m[key].profit, points.reduce((sum, p) => sum + (p.reward - p.expenses - p.taxes) * p.coefficient, 0));
    assert.deepEqual(points.map((p) => p.coefficient), [0.5, 1]);
    assert.ok(points.every((p) => p.pointId.startsWith('history-share-')));
  }
  assert.equal(m.source.cells.profit.value, 699000);
  assert.equal(JSON.stringify(history), before);
});

test('historical rates cover leap year and rate transitions, ignore short legacy caches', async () => {
  near(capitalCost('2024-02', SEED, '2026-11-13').amount, 70000000 * 0.18 * 29 / 366);
  near(capitalCost('2024-07', SEED, '2026-11-13').amount, 70000000 * (0.18 * 28 + 0.20 * 3) / 366);
  let fetches = 0;
  const rates = await getRates({ loadJson: async () => ({ ...SEED, entries: [{ date: '2026-07-27', rate: 14 }] }) },
    { now: new Date('2026-11-13T10:00:00Z'), fetchImpl: async () => { fetches++; throw new Error('offline'); } });
  assert.equal(rates.entries[0].date, '2023-12-20');
  assert.equal(fetches, 0);
  assert.equal(rates.status, 'verified');
});

test('import is insert-only, reconciles PostgreSQL JSON key reordering, and refuses a different archive', async () => {
  let saved = null;
  const calls = [], events = [];
  const reorder = (value) => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().reverse().map((key) => [key, reorder(value[key])])) : value;
  const store = { loadJson: async (key, fallback) => key === KEY ? saved : fallback,
    supabaseFetch: async (url, options) => { calls.push({ url, options }); saved = reorder(JSON.parse(options.body).value); },
    audit: async (event) => events.push(event) };
  const payload = fixture();
  assert.equal((await importHistory(store, payload)).status, 'validated');
  assert.equal(calls.length, 0); assert.equal(events.length, 0);
  assert.deepEqual(await importHistory(store, payload, { apply: true }), { status: 'imported-and-verified', months: 32,
    key: KEY, sourceHash: payload.source.sha256, otherRecordsUnchanged: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/rest/v1/app_kv');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Prefer, 'return=minimal');
  assert.equal(JSON.parse(calls[0].options.body).key, KEY);
  assert.equal((await importHistory(store, payload, { apply: true })).status, 'already-imported');
  assert.equal(calls.length, 1);
  assert.deepEqual(events, ['finance.history_imported', 'finance.history_import_verified']);
  await assert.rejects(() => importHistory(store, { ...payload, source: { ...payload.source, sha256: 'b'.repeat(64) } }, { apply: true }), /Refusing/);
  assert.equal(calls.length, 1);
});

test('history UI shows evidence and estimated scenario formulas without invented point/company detail', () => {
  const model = buildFinancialModel({ sources: [historicalSource(fixture(), '2024-01')], rates: SEED, asOf: '2026-11-13' });
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.classList = { add() {} }; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute() {}
    addEventListener() {}
  }
  const root = new Element('div');
  const context = { state: { financialModel: model, financialDetailMonth: '2024-01', financialDetailScenario: 'ausn' },
    els: { financialContent: root }, document: { createElement: (tag) => new Element(tag) }, Intl,
    formatMonth: (v) => v, formatMoney: (v) => String(v) };
  const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  vm.createContext(context);
  vm.runInContext(app.slice(app.indexOf('function financeElement('), app.indexOf('async function loadConstants()')), context);
  vm.runInContext('renderFinancialModel()', context);
  const text = (el) => `${el.textContent || ''} ${el.children.map(text).join(' ')}`;
  for (const pattern of [/Факт · Excel/, /Оценка · Excel/, /6 ИП × 5/, /Прибыль по долям Excel/, /Налог по сети/, /synthetic.xlsx/, /A9/]) assert.match(text(root), pattern);
  assert.match(context.financeSubstitution('officialNet', model.months[0], 'ausn'), /6 × 5 × 60 000/);
});

test('historical API is owner-only, separate from live reports, and reports missing/corrupt archives explicitly', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-history-test-'));
  const store = new Store(dir);
  store.saveJson('users.json', ['owner', 'admin', 'partner'].map((role) => ({ id: role, role, fullName: role })));
  const archive = fixture(); store.saveJson(KEY, archive);
  store.saveJson('finance_key_rates.json', { ...SEED, verifiedThrough: moscowDate() });
  store.saveJson('reports.json', { managementReport: { '2026-09': { rows: { moscow_6231: { reward: '777', revenue: '10000' } } } } });
  const protectedKeys = ['reports.json', 'schedules.json', 'users.json', 'expenses.json', 'companies.json', 'retail_points.json'];
  const before = Object.fromEntries(protectedKeys.map((key) => [key, JSON.stringify(store.loadJson(key, null))]));
  const loaded = [], saved = [];
  const originalLoad = store.loadJson.bind(store), originalSave = store.saveJson.bind(store);
  store.loadJson = (key, fallback) => { loaded.push(key); return originalLoad(key, fallback); };
  store.saveJson = (key, value) => { saved.push(key); return originalSave(key, value); };
  const server = http.createServer(createRequestHandler(store));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api/financial-model`;
  const headers = (role) => ({ Cookie: `session=${store.createSession(role)}` });
  const owner = headers('owner');
  for (const role of ['admin', 'partner']) assert.equal((await fetch(`${base}?from=2024-01&to=2026-08`, { headers: headers(role) })).status, 403);
  loaded.length = 0; saved.length = 0;
  const response = await fetch(`${base}?from=2024-01&to=2026-08`, { headers: owner });
  assert.equal(response.status, 200);
  const model = (await response.json()).model;
  assert.equal(model.months.length, 32);
  assert.ok(model.months.every((m) => m.current && m.usn && m.usn15 && m.ausn));
  // Authentication loads users and the common point directory before routing.
  for (const key of protectedKeys.filter((key) => !['users.json', 'retail_points.json'].includes(key))) assert.ok(!loaded.includes(key), key);
  assert.ok(!saved.some((key) => protectedKeys.includes(key) || key === KEY));
  for (const key of protectedKeys) assert.equal(JSON.stringify(store.loadJson(key, null)), before[key]);
  const mixed = (await (await fetch(`${base}?from=2026-08&to=2026-09`, { headers: owner })).json()).model;
  assert.equal(mixed.months[0].current.reward, 2100000);
  assert.equal(mixed.months[1].current.reward, 777);
  assert.equal(mixed.months[1].historical, false);
  const projected = (await (await fetch(`${base}?from=2024-01&to=2024-01&forecast=1`, { headers: owner })).json()).model;
  assert.equal(projected.months.length, 1, 'History selection must not restrict the forecast base');
  assert.equal(projected.forecast.months.length, 24);
  assert.equal(projected.forecast.base[8].reward, 777);
  assert.equal(projected.forecast.months[9].status, 'missing', 'October report is not saved');
  assert.equal(projected.forecast.years[0].scenarios.current, null);
  assert.ok(store.readAudit().some((event) => event.action === 'finance.forecast_calculated'));
  for (const role of ['admin', 'partner']) assert.equal((await fetch(`${base}?forecast=1`, { headers: headers(role) })).status, 403);
  for (const key of protectedKeys) {
    if (key !== 'users.json') assert.equal(JSON.stringify(store.loadJson(key, null)), before[key]);
  }
  store.saveJson(KEY, null);
  const missing = (await (await fetch(`${base}?from=2024-01&to=2024-01`, { headers: owner })).json()).model.months[0];
  assert.equal(missing.status, 'missing'); assert.equal(missing.current, undefined);
  store.saveJson(KEY, { ...archive, months: {} });
  assert.equal((await fetch(`${base}?from=2024-01&to=2024-01`, { headers: owner })).status, 503);
  assert.equal((await fetch(`${base}?from=2026-09&to=2026-09`, { headers: owner })).status, 200);
});
