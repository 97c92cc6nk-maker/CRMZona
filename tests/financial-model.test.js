'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { calculateMonth, buildFinancialModel, monthsThrough } = require('../lib/financial-model');
const { capitalCost, getRates, parseRates, fetchRates, moscowDate, SEED } = require('../lib/financial-rates');
const { Store, createRequestHandler, permissionsFor } = require('../lib/app');

const financing = { amount: 100000, annualRate: 16, segments: [], projected: false };
function row(patch = {}) {
  return { pointId: 'moscow_6231', pointName: 'Test point', companyId: 'ip-a', companyShortName: 'A',
    salary: '3000000', reward: '12600000', additionalIncome: '0', totalExpenses: '4000000',
    accountingPayrollTaxesOther: '100000', taxes: '1008000', profit: '7592000', profitDistributionRate: '100', ...patch };
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 0.01, `${actual} != ${expected}`);

test('finance uses reward inclusive of VAT, nets up only 60 percent payroll, and replaces old payroll taxes', () => {
  const result = calculateMonth({ rows: [row({ revenue: '999999999' })] }, financing);
  assert.equal(result.current.profit, 7592000);
  assert.equal(result.usn.reward, 12600000);
  assert.equal(result.usn.netReward, 12000000);
  assert.equal(result.usn.vat, 600000);
  assert.equal(result.usn.officialNet, 1800000);
  near(result.usn.officialGross, 1800000 / 0.87);
  near(result.usn.ndfl, 1800000 / 0.87 * 0.13);
  near(result.usn.contributions, 1800000 / 0.87 * 0.302);
  assert.equal(result.usn.usnBefore, 720000);
  assert.equal(result.usn.deduction, 360000);
  assert.equal(result.usn.usn, 360000);
  assert.equal(result.usn.taxes, 960000);
  near(result.usn.expenses, 3900000 + 1800000 / 0.87 * (0.13 + 0.302));
  near(result.usn.profit, 12600000 - result.usn.expenses - result.usn.taxes);
  near(result.usn.netProfit, result.usn.profit - 100000);
  near(result.usn.roi, result.usn.netProfit / 70000000 * 100);
  assert.equal(result.current.ndfl, undefined);
});

test('finance limits USN deduction per company and preserves point profit coefficients', () => {
  const rows = [row({ pointId: 'a', salary: '6000000', profitDistributionRate: '50' }), row({ pointId: 'b', companyId: 'ip-b', salary: '0' })];
  const separate = calculateMonth({ rows }, financing);
  assert.equal(separate.usn.deduction, 360000);
  assert.equal(separate.points[1].deduction, 0);
  near(separate.points[0].profit, (12600000 - separate.points[0].expenses - separate.points[0].taxes) * 0.5);
  const same = calculateMonth({ rows: rows.map((r) => ({ ...r, companyId: 'same' })) }, financing);
  assert.equal(same.usn.deduction, 720000);
  assert.equal(same.points[1].deduction, 360000);
  const low = calculateMonth({ rows: [row({ salary: '1000' })] }, financing);
  assert.equal(low.usn.deduction, low.usn.contributions);
  assert.equal(calculateMonth({ rows: [row({ salary: '0', reward: '0' })] }, financing).usn.deduction, 0);
  assert.ok(calculateMonth({ rows: [row({ companyId: '' })] }, financing).warnings.length);
});

test('USN 15 includes only official wages in tax expenses and adds VAT without a second contribution deduction', () => {
  const { usn15: v, usn15Companies: companies } = calculateMonth({ rows: [row()] }, financing);
  const gross = 1800000 / 0.87, contributions = gross * 0.302;
  assert.equal(v.officialNet, 1800000);
  assert.equal(v.excludedPayroll, 1200000);
  near(v.expenses, 3900000 + gross * 0.13 + contributions);
  near(v.deductibleExpenses, 900000 + gross + contributions);
  near(v.taxBase, 12000000 - (900000 + gross + contributions));
  near(v.calculatedTax, (12000000 - (900000 + gross + contributions)) * 0.15);
  assert.equal(v.minimumTax, 120000);
  assert.equal(v.businessTax, v.calculatedTax);
  near(v.taxes, 600000 + v.businessTax);
  near(v.profit, 12600000 - v.expenses - v.taxes);
  assert.equal(v.deduction, undefined);
  assert.equal(companies.length, 1);
});

test('expense-based minimum tax is per company, including losses, never a maximum over network totals', () => {
  const rows = [row({ pointId: 'profit', salary: '0', reward: '1050000', totalExpenses: '0', accountingPayrollTaxesOther: '0' }),
    row({ pointId: 'loss', companyId: 'ip-b', salary: '0', reward: '1050000', totalExpenses: '2000000', accountingPayrollTaxesOther: '0' })];
  const separate = calculateMonth({ rows }, financing);
  assert.equal(separate.usn15.calculatedTax, 150000);
  assert.equal(separate.usn15.minimumTax, 20000);
  assert.equal(separate.usn15.businessTax, 160000);
  assert.equal(separate.usn15Companies[1].businessTax, 10000);
  const combined = calculateMonth({ rows: rows.map((point) => ({ ...point, companyId: 'one-ip' })) }, financing);
  assert.equal(combined.usn15.businessTax, 20000);
  const gross = 300000 / 0.87;
  near(separate.ausn.businessTax, (1050000 - gross) * 0.2 + 1050000 * 0.03);
  assert.equal(combined.ausn.businessTax, 2100000 * 0.03);
  assert.equal(separate.ausnCompanies[1].calculatedTax, 0);
});

test('AUSN assigns five net salaries once per IP, keeps other wages as cash costs, and has no VAT or contributions', () => {
  const { ausn: v, ausnCompanies: companies, ausnPoints: points } = calculateMonth({ rows: [
    row({ pointId: 'a', salary: '1000000', reward: '4200000', totalExpenses: '1500000', profitDistributionRate: '50' }),
    row({ pointId: 'b', salary: '2000000', reward: '8400000', totalExpenses: '2500000', profitDistributionRate: '100' }),
  ] }, financing);
  assert.equal(v.companyCount, 1);
  assert.equal(companies.length, 1);
  assert.equal(v.officialNet, 300000);
  near(v.officialGross, 300000 / 0.87);
  near(v.ndfl, 300000 / 0.87 * 0.13);
  assert.equal(v.contributions, 0);
  assert.equal(v.vat, 0);
  assert.equal(v.taxIncome, 12600000);
  assert.equal(v.excludedPayroll, 2700000);
  assert.equal(v.payrollTopUp, 0);
  near(v.expenses, 3800000 + 300000 / 0.87 * 0.13);
  near(v.deductibleExpenses, 800000 + 300000 / 0.87);
  near(v.businessTax, (12600000 - 800000 - 300000 / 0.87) * 0.2);
  assert.equal(v.minimumTax, 378000);
  assert.equal(points[0].officialNet, 100000);
  assert.equal(points[1].officialNet, 200000);
  near(points[0].businessTax, v.businessTax / 3);
  near(points[0].profit, (4200000 - points[0].expenses - points[0].taxes) * 0.5);
  near(v.profit, points.reduce((total, point) => total + point.profit, 0));
  near(v.netProfit, v.profit - financing.amount);
});

test('AUSN shows payroll top-ups, zero-income fallback, missing companies and unavailable rates explicitly', () => {
  const rows = [row({ pointId: 'a', salary: '0', reward: '0', totalExpenses: '100000', accountingPayrollTaxesOther: '0' }),
    row({ pointId: 'b', salary: '0', reward: '0', totalExpenses: '100000', accountingPayrollTaxesOther: '0' })];
  const result = calculateMonth({ rows }, { ...financing, amount: null, annualRate: null });
  assert.equal(result.ausn.officialNet, 300000);
  assert.equal(result.ausn.payrollTopUp, 300000);
  assert.equal(result.ausnPoints[0].officialNet, 150000);
  near(result.ausn.expenses, 200000 + 300000 / 0.87);
  assert.equal(result.ausn.minimumTax, 0);
  assert.equal(result.ausn.businessTax, 0);
  assert.equal(result.ausn.netProfit, null);
  assert.equal(result.usn15.netProfit, null);
  assert.ok(result.warnings.some((warning) => /ниже 300 000/.test(warning)));
  const unknown = calculateMonth({ rows: [row({ companyId: '' })] }, financing);
  assert.equal(unknown.ausn, null);
  assert.ok(unknown.usn15);
  assert.ok(unknown.warnings.some((warning) => /Нельзя определить/.test(warning)));
  const invalid = calculateMonth({ rows: [row({ totalExpenses: '1' })] }, financing);
  assert.equal(invalid.ausn, null);
  assert.equal(invalid.usn15, null);
  assert.ok(invalid.current);
  const two = calculateMonth({ rows: [row(), row({ pointId: 'b', companyId: 'ip-b' })] }, financing);
  assert.equal(two.ausn.companyCount, 2);
  assert.equal(two.ausn.officialNet, 600000);
});

test('finance UI compares all four variants and switches formulas without mislabelling missing AUSN as zero', () => {
  const model = buildFinancialModel({ asOf: '2026-11-13', rates: SEED, sources: [
    { month: '2026-09', saved: { rows: { moscow_6231: {} } }, report: { rows: [row()] } },
    { month: '2026-10', saved: { rows: { moscow_6231: {} } }, report: { rows: [row({ companyId: '' })] } },
  ] });
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.classList = { add() {} }; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute() {}
    addEventListener(name, handler) { this.listeners[name] = handler; }
  }
  const root = new Element('div');
  const state = { financialModel: model, financialDetailMonth: '2026-09', financialDetailScenario: 'ausn' };
  const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  const context = { state, els: { financialContent: root }, document: { createElement: (tag) => new Element(tag) }, Intl,
    formatMonth: (value) => value, formatMoney: (value) => String(value) };
  vm.createContext(context);
  vm.runInContext(app.slice(app.indexOf('function financeElement('), app.indexOf('async function loadConstants()')), context);
  vm.runInContext('renderFinancialModel()', context);
  const descendants = (node) => [node, ...node.children.flatMap(descendants)];
  const tables = () => descendants(root).filter((node) => node.tagName === 'table');
  assert.equal(tables()[0].children[1].children.length, 8);
  assert.equal(tables()[0].children[2].children.length, 4);
  assert.equal(tables()[1].children[0].children[0].children.length, 6);
  assert.match(context.financeSubstitution('officialNet', model.months[0], 'ausn'), /1 × 5 × 60 000/);
  assert.equal(context.financeSubstitution('officialNet', model.months[1], 'ausn'), '');
  assert.ok(descendants(root).some((node) => /Налог по компаниям: АУСН/.test(node.textContent || '')));
  state.financialDetailScenario = 'usn15'; vm.runInContext('renderFinancialModel()', context);
  assert.ok(descendants(root).some((node) => /Вычет 50% не применяется/.test(node.textContent || '')));
  state.financialDetailMonth = '2026-10'; state.financialDetailScenario = 'ausn';
  vm.runInContext('renderFinancialModel()', context);
  assert.ok(descendants(root).some((node) => /Этот вариант не рассчитан/.test(node.textContent || '')));
});

test('finance does not invent missing reports, missing rates, zero denominators or profitable payback', () => {
  assert.deepEqual(monthsThrough('2026-11', '2026-11-13'), ['2026-09', '2026-10', '2026-11']);
  for (const value of ['2026-08', '2026-13', '2026-12', 'bad']) assert.throws(() => monthsThrough(value, '2026-11-13'));
  const model = buildFinancialModel({ asOf: '2026-11-13', rates: SEED, sources: [
    { month: '2026-09', report: { rows: [row()] } },
    { month: '2026-10', saved: { rows: { moscow_6231: {} } }, report: { rows: [row()] } },
  ] });
  assert.equal(model.capital, 70000000);
  assert.equal(model.months[0].status, 'missing');
  assert.equal(model.months[0].current, undefined);
  assert.equal(model.months[1].status, 'ready');
  const unknown = calculateMonth({ rows: [row()] }, { ...financing, amount: null, annualRate: null });
  assert.equal(unknown.current.netProfit, null);
  assert.equal(unknown.usn.roi, null);
  const loss = calculateMonth({ rows: [row({ reward: '0', profit: '-100' })] }, financing);
  assert.equal(loss.usn.margin, null);
  assert.equal(loss.usn.payback, null);
  assert.throws(() => calculateMonth({ rows: [row({ salary: '-1' })] }, financing), /Отрицательная/);
});

test('capital cost uses daily effective rates, calendar days, leap years and explicit current-month estimates', () => {
  const rates = { entries: [{ date: '2026-09-01', rate: 14 }, { date: '2026-09-16', rate: 12 }], verifiedThrough: '2026-09-30' };
  const cost = capitalCost('2026-09', rates, '2026-10-01');
  near(cost.amount, 70000000 * (0.16 * 15 + 0.14 * 15) / 365);
  assert.equal(cost.annualRate, 15);
  assert.deepEqual(cost.segments.map((part) => part.days), [15, 15]);
  const leap = capitalCost('2028-02', { entries: [{ date: '2028-01-01', rate: 10 }], verifiedThrough: '2028-02-29' }, '2028-03-01');
  near(leap.amount, 70000000 * 0.12 * 29 / 366);
  assert.equal(capitalCost('2026-10', rates, '2026-11-13').amount, null);
  assert.equal(capitalCost('2026-11', SEED, '2026-11-13').projected, true);
  assert.equal(moscowDate(new Date('2026-11-12T22:00:00Z')), '2026-11-13');
});

function xml(rows) {
  return `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><KeyRateXMLResponse><KeyRateXMLResult><KeyRate>${rows.map(([date, rate]) => `<KR><DT>${date}T00:00:00+03:00</DT><Rate>${rate}</Rate></KR>`).join('')}</KeyRate></KeyRateXMLResult></KeyRateXMLResponse></soap:Body></soap:Envelope>`;
}

test('CBR rates validate SOAP data, cache successful history and clearly signal unavailable coverage', async () => {
  const daily = [];
  for (let date = Date.parse('2023-12-20'); date <= Date.parse('2026-11-16'); date += 86400000) {
    const day = new Date(date).toISOString().slice(0, 10); daily.push([day, day === '2026-11-16' ? 13 : 14]);
  }
  const payload = xml(daily.reverse());
  const result = parseRates(payload, '2026-11-16');
  assert.deepEqual(result.entries, [{ date: '2023-12-20', rate: 14 }, { date: '2026-11-16', rate: 13 }]);
  for (const bad of ['<html>Failure</html>', '<!DOCTYPE x><x/>', xml([['2026-11-16', 'bad']]), xml([['2026-11-16', 14]]), xml([['2026-08-31', 14]])]) {
    assert.throws(() => parseRates(bad, '2026-11-16'));
  }
  const data = {}, events = [];
  const store = { loadJson: async () => data.cache || null, saveJson: async (_, value) => { data.cache = value; }, audit: async (event) => events.push(event) };
  let calls = 0;
  const fetchImpl = async (url, options) => { calls++; assert.equal(url, 'https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx');
    assert.ok(options.signal); return { ok: true, text: async () => payload }; };
  const options = { now: new Date('2026-11-16T10:00:00Z'), fetchImpl };
  assert.equal((await getRates(store, options)).status, 'live');
  assert.equal((await getRates(store, options)).status, 'cached');
  assert.equal(calls, 1);
  assert.deepEqual(events, ['finance.rates_updated']);
  const stale = await getRates({ ...store, loadJson: async () => null }, { ...options, fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(stale.status, 'stale');
  assert.match(stale.warning, /недоступен/);
  assert.equal(capitalCost('2026-11', stale, '2026-11-16').amount, null);
  await assert.rejects(() => fetchRates('2026-11-16', async () => ({ ok: false, status: 503 })), /503/);
});

test('financial API is owner-only, calculates from stored reports and never overwrites accounting data', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-finance-'));
  const store = new Store(dir);
  store.saveJson('users.json', ['owner', 'admin', 'partner', 'employee'].map((role) => ({ id: role, role, fullName: role,
    allowedSections: ['reports'], allowedReports: ['management-report'], allowedPoints: ['moscow_6231'] })));
  const source = { managementReport: { '2026-09': { rows: { moscow_6231: { reward: '6300000', revenue: '999999999', accountingPayrollTaxesOther: '100000' } } } } };
  store.saveJson('reports.json', source);
  store.saveJson('companies.json', [{ id: 'ip-a', name: 'Test IP', pointIds: ['moscow_6231'] }]);
  store.saveJson('finance_key_rates.json', { ...SEED, verifiedThrough: moscowDate() });
  const server = http.createServer(createRequestHandler(store));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api/financial-model`;
  const headers = (role) => ({ Cookie: `session=${store.createSession(role)}` });
  for (const role of ['admin', 'partner', 'employee']) {
    assert.equal(permissionsFor({ id: role, role }).canViewFinancialModel, false);
    assert.equal((await fetch(`${base}?to=2026-09`, { headers: headers(role) })).status, 403);
  }
  assert.equal((await fetch(base)).status, 401);
  const response = await fetch(`${base}?to=2026-09`, { headers: headers('owner') });
  assert.equal(response.status, 200, await response.clone().text());
  const model = (await response.json()).model;
  assert.equal(model.months[0].usn.reward, 6300000);
  assert.equal(model.months[0].usn.netReward, 6000000);
  assert.deepEqual(model.scenarios.map((scenario) => scenario.id), ['current', 'usn', 'usn15', 'ausn']);
  assert.ok(model.months[0].usn15);
  assert.equal(model.months[0].ausn, null, 'Seed points without a company must not create fake IP salaries');
  assert.deepEqual(store.loadJson('reports.json', {}), source);
  assert.ok(store.readAudit().some((event) => event.action === 'finance.model_calculated'));
  assert.equal((await fetch(`${base}?to=2026-08`, { headers: headers('owner') })).status, 400);
  store.saveJson('expenses.json', null);
  const unavailable = await fetch(`${base}?to=2026-09`, { headers: headers('owner') });
  assert.equal(unavailable.status, 503);
});
