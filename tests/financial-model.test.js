'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
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
  for (let date = Date.parse('2026-08-31'); date <= Date.parse('2026-11-16'); date += 86400000) {
    const day = new Date(date).toISOString().slice(0, 10); daily.push([day, day === '2026-11-16' ? 13 : 14]);
  }
  const payload = xml(daily.reverse());
  const result = parseRates(payload, '2026-11-16');
  assert.deepEqual(result.entries, [{ date: '2026-08-31', rate: 14 }, { date: '2026-11-16', rate: 13 }]);
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
  assert.deepEqual(store.loadJson('reports.json', {}), source);
  assert.ok(store.readAudit().some((event) => event.action === 'finance.model_calculated'));
  assert.equal((await fetch(`${base}?to=2026-08`, { headers: headers('owner') })).status, 400);
  store.saveJson('expenses.json', null);
  const unavailable = await fetch(`${base}?to=2026-09`, { headers: headers('owner') });
  assert.equal(unavailable.status, 503);
});
