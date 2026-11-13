'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const vm = require('node:vm');
const { BASE_MONTHS, buildFinancialForecast } = require('../lib/financial-forecast');
const { SEED } = require('../lib/financial-rates');
const { calculateMonth } = require('../lib/financial-model');
const near = (a, b, tolerance = 0.02) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const emptyFinancing = { amount: 0, annualRate: 0, segments: [] };

function row(patch = {}) {
  return { pointId: 'test-point', pointName: 'Test', companyId: 'company-a', companyShortName: 'A',
    salary: 3000000, totalExpenses: 4000000, accountingPayrollTaxesOther: 100000,
    reward: 12600000, revenue: 999999999, additionalIncome: 50000, taxes: 1008000,
    profit: 7642000, profitDistributionRate: 100, ...patch };
}
function sources() {
  return BASE_MONTHS.map((month, index) => ({ month,
    historical: month <= '2026-08', history: month <= '2026-08' ? { warnings: [] } : undefined,
    saved: month > '2026-08' ? { rows: { 'test-point': {} } } : undefined,
    report: { rows: [row({ reward: 12600000 + index * 1000 })] } }));
}
const forecast = (values = sources(), rates = SEED) => buildFinancialForecast({ sources: values, rates, asOf: '2026-11-13' });

test('forecast maps twelve seasonal source months, retains reward, and compounds operating costs without mutating history', () => {
  const input = sources(), before = JSON.stringify(input), f = forecast(input);
  assert.deepEqual(BASE_MONTHS, ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2025-11', '2025-12']);
  assert.equal(f.months.length, 24);
  assert.equal(f.months[10].baseMonth, '2025-11');
  assert.equal(f.months[23].baseMonth, '2025-12');
  for (const year of [2027, 2028]) {
    const factor = year === 2027 ? 1.05 : 1.1025;
    for (const month of f.months.filter((m) => m.month.startsWith(String(year)))) {
      const original = input.find((s) => s.month === month.baseMonth).report.rows[0];
      assert.equal(month.expenseFactor, factor);
      for (const id of ['current', 'usn', 'usn15', 'ausn']) {
        assert.equal(month[id].reward, original.reward);
        assert.equal(month[id].additionalIncome, 50000);
        near(month[id].payroll, original.salary * factor);
      }
      near(month.current.expenses, original.totalExpenses * factor);
      assert.equal(month.current.taxes, original.taxes);
      near(month.current.profit, original.reward + 50000 - original.totalExpenses * factor - original.taxes);
    }
  }
  assert.equal(JSON.stringify(input), before);
});

test('forecast recalculates all taxes from inflated inputs, indexes six-IP AUSN salaries and does not inflate taxes twice', () => {
  const f = forecast();
  for (const [index, factor] of [[0, 1.05], [12, 1.1025]]) {
    const m = f.months[index], netSalary = 3000000 * factor;
    const gross = netSalary * 0.6 / 0.87, ndfl = gross * 0.13, contributions = gross * 0.302;
    const cashCosts = 3900000 * factor + ndfl + contributions;
    const taxableCosts = cashCosts - netSalary * 0.4;
    near(m.usn.expenses, cashCosts);
    near(m.usn.ndfl, ndfl); near(m.usn.contributions, contributions);
    near(m.usn.vat, 600000); near(m.usn.usn, 720000 - Math.min(360000, contributions));
    near(m.usn15.deductibleExpenses, taxableCosts);
    near(m.usn15.businessTax, Math.max(Math.max(12000000 - taxableCosts, 0) * 0.15, 120000));
    near(m.usn15.taxes, m.usn15.businessTax + 600000);
    near(m.ausn.officialNet, 1800000 * factor);
    near(m.ausn.officialGross, 1800000 * factor / 0.87);
    near(m.ausn.expenses, 3900000 * factor + 1800000 * factor / 0.87 * 0.13);
    near(m.ausn.deductibleExpenses, 900000 * factor + 1800000 * factor / 0.87);
    near(m.ausn.businessTax, Math.max(Math.max(12600000 - m.ausn.deductibleExpenses, 0) * 0.2, 378000));
    assert.equal(m.ausn.companyCount, 6);
    assert.equal(m.ausn.contributions, 0); assert.equal(m.ausn.vat, 0);
  }
  const unchanged = calculateMonth({ rows: [row()] }, emptyFinancing);
  assert.equal(unchanged.ausn.officialNet, 300000, 'Existing live scenarios keep their original salary');
  for (const factor of [-1, 0, NaN, Infinity]) assert.throws(() => calculateMonth({ rows: [row()] }, emptyFinancing, { ausnSalaryFactor: factor }));
});

test('network forecast preserves profit shares and handles unassigned companies without inventing extra IPs', () => {
  const input = sources();
  input[0].report.rows = [row({ pointId: 'a', companyId: '', profitDistributionRate: 50 }), row({ pointId: 'b', companyId: 'other' })];
  const m = forecast(input).months[0];
  assert.equal(m.ausn.companyCount, 6);
  assert.equal(m.ausn.officialNet, 1890000);
  near(m.current.profit, (12600000 + 50000 - 4000000 * 1.05 - 1008000) * 1.5);
  for (const id of ['usn', 'usn15', 'ausn']) {
    near(m[id].profit, (m[id].reward + m[id].additionalIncome - m[id].expenses - m[id].taxes) * 0.75);
  }
  near(m.usn.deduction, Math.min(m.usn.contributions, m.usn.usnBefore / 2));
});

test('forecast tops up AUSN wages when lower than the indexed official fund and preserves minimum taxes', () => {
  const input = sources();
  input[0].report.rows = [row({ salary: 600000, totalExpenses: 1000000, reward: 2100000 })];
  const m = forecast(input).months[0];
  assert.equal(m.ausn.officialNet, 1890000);
  assert.equal(m.ausn.payrollTopUp, 1260000);
  assert.equal(m.ausn.excludedPayroll, 0);
  near(m.ausn.expenses, 900000 * 1.05 + 1260000 + 1890000 / 0.87 * 0.13);
  near(m.ausn.businessTax, 2100000 * 0.03);
  input[0].report.rows = [row({ salary: 3000000, totalExpenses: 30000000 })];
  const loss = forecast(input).months[0];
  assert.equal(loss.usn15.businessTax, 120000);
  assert.equal(loss.ausn.businessTax, 378000);
  assert.equal(loss.ausn.payback, null);
});

test('annual figures sum twelve months while rates/ROI are not summed and 2028 uses leap-year day counts', () => {
  const f = forecast();
  for (const year of f.years) {
    for (const id of ['current', 'usn', 'usn15', 'ausn']) {
      assert.equal(year.calculatedMonths[id], 12);
      const months = f.months.filter((m) => m.month.startsWith(String(year.year))).map((m) => m[id]);
      for (const key of ['reward', 'expenses', 'taxes', 'profit', 'capitalCost', 'netProfit']) near(year.scenarios[id][key], months.reduce((s, m) => s + m[key], 0));
      near(year.scenarios[id].roi, year.scenarios[id].netProfit / 70000000 * 100);
      near(year.scenarios[id].capitalCost, 70000000 * 0.16, 0.05);
    }
  }
  near(f.months[13].current.capitalCost, 70000000 * 0.16 * 29 / 366);
  assert.equal(f.years[0].scenarios.current.ndfl, null);
});

test('missing sources or stale rates are explicit, never fabricated zero months or complete annual totals', () => {
  const f = forecast(sources().filter((s) => s.month !== '2026-09'));
  assert.equal(f.months[8].status, 'missing'); assert.equal(f.months[8].current, undefined);
  assert.equal(f.years[0].scenarios.current, null); assert.equal(f.years[0].calculatedMonths.current, 11);
  assert.ok(f.warnings.some((text) => text.includes('2026-09')));
  const stale = forecast(sources(), { ...SEED, verifiedThrough: '2026-11-12' });
  assert.equal(stale.years[0].scenarios.usn.netProfit, null);
  assert.equal(stale.years[0].scenarios.usn.roi, null);
  assert.ok(stale.years[0].scenarios.usn.profit > 0);
  assert.ok(stale.warnings.some((text) => /ставки ЦБ/.test(text)));
  const invalid = sources(); invalid[0].report.rows[0].salary = 'not-a-number';
  assert.equal(forecast(invalid).months[0].status, 'missing');
});

test('forecast UI shows only annual totals for both years and preserves formulas', () => {
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.classList = { add() {} }; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute() {}
    addEventListener() {}
  }
  const root = new Element('div'), f = forecast();
  const context = { document: { createElement: (tag) => new Element(tag) }, Intl, formatMonth: (v) => v };
  const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  vm.createContext(context);
  vm.runInContext(app.slice(app.indexOf('function financeElement('), app.indexOf('async function loadConstants()')), context);
  context.renderFinancialForecast(root, f, ['current', 'usn', 'usn15', 'ausn'].map((id) => ({ id, title: id })));
  const all = (el) => [el, ...el.children.flatMap(all)];
  const text = all(root).map((el) => el.textContent || '').join(' ');
  assert.match(text, /Прогноз на 2027–2028/); assert.doesNotMatch(text, /Помесячный прогноз/);
  assert.match(text, /ноябрь–декабрь 2025/); assert.match(text, /66 150/);
  const tables = all(root).filter((el) => el.tagName === 'table');
  assert.equal(tables.length, 1);
  assert.equal(tables[0].children[0].children[0].children[0].textContent, 'Год');
  assert.equal(tables[0].children[1].children.length, 8);
  assert.deepEqual(tables[0].children[1].children.map((row) => row.children[0].textContent),
    ['2027', '2027', '2027', '2027', '2028', '2028', '2028', '2028']);
  assert.ok(app.indexOf('renderFinancialForecast(root, model.forecast') > app.indexOf('assumptions.append(sources); root.append(assumptions)'));
});

test('forecast HTTP initializes the complete point directory before deriving payroll, including non-seed points', async (t) => {
  const { Store, createRequestHandler } = require('../lib/app');
  const { moscowDate } = require('../lib/financial-rates');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-forecast-api-'));
  const store = new Store(dir);
  const pointId = 'forecast-new-point';
  store.saveJson('retail_points.json', [...store.loadJson('retail_points.json', []), { id: pointId, name: 'TEST_FORECAST' }]);
  store.saveJson('users.json', [{ id: 'owner', role: 'owner', fullName: 'Owner' },
    { id: 'employee', role: 'employee', fullName: 'Employee', allowedPoints: [pointId] }]);
  store.saveJson('schedules.json', { [`${pointId}:2026-09`]: { pointId, month: '2026-09',
    rows: [{ employeeId: 'employee', days: { 1: { rateRub: '60000' } } }] } });
  store.saveJson('reports.json', { managementReport: { '2026-09': { rows: { [pointId]: { reward: '1000000' } } } } });
  store.saveJson('finance_key_rates.json', { ...SEED, verifiedThrough: moscowDate() });
  const server = http.createServer(createRequestHandler(store));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/financial-model?from=2026-09&to=2026-09&forecast=1`,
    { headers: { Cookie: `session=${store.createSession('owner')}` } });
  assert.equal(response.status, 200);
  const { model } = await response.json();
  assert.equal(model.months[0].current.payroll, 60000);
  assert.equal(model.forecast.base[8].payroll, 60000);
  assert.equal(model.forecast.months[8].current.payroll, 63000);
  assert.equal(model.forecast.months[20].current.payroll, 66150);
});
