'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const model = require('../public/print-forms-model');
const { Store, SupabaseStore, createRequestHandler, permissionsFor } = require('../lib/app');

function fixture() {
  return {
    employee: { id: 'worker', fullName: 'Тестов Иван Иванович', position: 'Оператор ПВЗ', hireDate: '2026-10-01', officialSalary: '50000', email: 'worker@example.com', phone: '+79990000002', employmentDetails: {
      birthDate: '1990-01-01', passportNumber: '0000 000000', passportIssuedDate: '2010-01-01', passportIssuedBy: 'Тестовый орган', address: 'Тестовый адрес', bankName: 'Тестовый банк', bankBik: '044000000', bankAccount: '40817000000000000000',
    } },
    company: { id: 'company', name: 'ИП Тестов Тест Тестович', shortName: 'ТЕСТ', inn: '000000000000', ogrnip: '000000000000000', legalAddress: 'Тестовый адрес работодателя', pointIds: [] },
    point: { id: 'point', name: 'ТЕСТ_1', address: 'Тестовый адрес ПВЗ' },
    settings: model.normalizeSettings({ documentDate: '2026-09-27', city: 'Москва', contractNumber: 'ТЕСТ-1', representative: 'Тестов Тест Тестович', authority: 'ИП действует от своего имени', employerPassport: '0000 000001, выдан 01.01.2010 тестовым органом', schedule: 'По графику, 09:00–18:00', breaks: '13:00–14:00', accountingPeriod: 'Месяц', advanceDay: '25', salaryDay: '10', supplements: 'Согласно положению от 01.01.2026 № 1', workingConditions: 'Класс 2, СОУТ № 1 от 01.01.2026', guarantees: 'Дополнительные гарантии по СОУТ не предусмотрены', supervisor: 'Администратор', localActs: 'ПВТР от 01.01.2026 № 1\nПоложение об оплате труда от 01.01.2026 № 2', consentPurpose: 'Добровольное поздравление с днем рождения', consentData: 'ФИО, день и месяц рождения', consentActions: 'Сбор, хранение, использование без автоматизации', consentProcessors: 'Не привлекаются', consentUntil: '2027-01-01', terminationDate: '2026-10-20', inventory: 'Ключ № 1, 1 шт., исправен', liabilityWork: 'Прием, хранение и выдача имущества, приложение № 1, раздел II, пункт 2', liabilityConfirmed: true }),
  };
}

test('print forms use defaults, but allow an owner to revoke administrator access', () => {
  assert.equal(permissionsFor({ role: 'owner' }).canViewPrintForms, true);
  assert.equal(permissionsFor({ role: 'admin', allowedSections: [] }).canViewPrintForms, true);
  assert.equal(permissionsFor({ role: 'admin', allowedSections: [], printFormsAccessConfigured: true }).canViewPrintForms, false);
  assert.equal(permissionsFor({ role: 'employee', allowedSections: [] }).canViewPrintForms, false);
  assert.equal(permissionsFor({ role: 'employee', allowedSections: ['printForms'] }).canViewPrintForms, true);
});

test('all ten templates render escaped authoritative data and require a card position', () => {
  const context = fixture();
  const ids = model.forms.map((form) => form.id);
  assert.deepEqual(model.validate(context, ids), []);
  context.employee.fullName = '<img src=x onerror=alert(1)>';
  const html = model.render(context, ids);
  assert.equal((html.match(/<article /g) || []).length, 10);
  assert.equal(html.includes('<img'), false);
  assert.ok(html.includes('&lt;img'));
  context.employee.position = '';
  for (const id of ids) assert.ok(model.validate(context, [id]).some((error) => error.includes('должность')));
});

test('contracts reject missing legal terms; liability rejects minors and missing eligibility', () => {
  const context = fixture();
  context.settings.salaryDay = '20';
  context.settings.workingConditions = '';
  context.employee.officialSalary = '';
  context.settings.employerPassport = '';
  assert.ok(model.validate(context, ['contract']).length >= 4);
  context.employee.employmentDetails.birthDate = '2010-01-01';
  context.settings.liabilityConfirmed = false;
  assert.ok(model.validate(context, ['liability']).some((e) => e.includes('18 лет')));
  assert.ok(model.validate(context, ['liability']).some((e) => e.includes('Подтвердите')));
  assert.throws(() => model.normalizeDetails({ passportIssuedDate: '2026-02-31' }), /дата/);
  assert.throws(() => model.normalizeDetails({ bankAccount: '123' }), /20 цифр/);
});

test('print forms HTTP authorization, drafts, card updates, audit and unavailable source', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-print-test-'));
  const store = new Store(dir);
  const f = fixture();
  const owner = store.createUser({ fullName: 'Тестовый Владелец', phone: '+79990000001', email: 'owner@example.com', password: 'LocalTest123!', role: 'owner' });
  const worker = store.createUser({ ...f.employee, password: 'LocalTest123!', role: 'employee', allowedSections: ['employees'] });
  const admin = store.createUser({ fullName: 'Тестовый Администратор', phone: '+79990000003', email: 'admin@example.com', password: 'LocalTest123!', role: 'admin', unofficialSalary: '1' });
  store.updateUser(owner, worker.id, { employmentDetails: f.employee.employmentDetails });
  store.saveJson('companies.json', [f.company]);
  store.saveJson('retail_points.json', [f.point]);
  const server = http.createServer(createRequestHandler(store));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const ownerCookie = `session=${store.createSession(owner.id)}`;
  const workerCookie = `session=${store.createSession(worker.id)}`;
  const adminCookie = `session=${store.createSession(admin.id)}`;
  const request = (route, cookie, method = 'GET', body) => fetch(`${base}${route}`, { method, headers: { Cookie: cookie || '', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await request('/api/print-forms')).status, 401);
  assert.equal((await request('/api/print-forms', workerCookie)).status, 403);
  assert.equal((await request('/api/print-forms', adminCookie)).status, 200);
  const directory = await (await request('/api/print-forms', ownerCookie)).json();
  assert.equal(directory.forms.length, 10);
  assert.ok(!JSON.stringify(directory).includes('password'));
  const cardList = await (await request('/api/users', adminCookie)).json();
  assert.equal(cardList.users.find((u) => u.id === worker.id).employmentDetails.passportNumber, '0000 000000');
  const limitedList = await (await request('/api/users', workerCookie)).json();
  assert.equal(limitedList.users.find((u) => u.id === worker.id).employmentDetails, undefined);
  const payload = { employeeId: worker.id, companyId: f.company.id, settings: { ...f.settings, pointId: f.point.id }, formIds: ['contract', 'job'] };
  assert.equal((await request('/api/print-forms/draft', adminCookie, 'PUT', payload)).status, 200);
  const draft = await (await request(`/api/print-forms/draft?employeeId=${worker.id}&companyId=${f.company.id}`, ownerCookie)).json();
  assert.equal(draft.draft.settings.schedule, f.settings.schedule);
  const render = await request('/api/print-forms/render', ownerCookie, 'POST', payload);
  assert.equal(render.status, 200, await render.clone().text());
  assert.match((await render.json()).html, /Тестов Иван Иванович/);
  await request(`/api/users/${worker.id}`, adminCookie, 'PATCH', { position: '' });
  const invalid = await request('/api/print-forms/render', ownerCookie, 'POST', { ...payload, position: 'Invented client position' });
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).error, /должность/);
  assert.ok(store.readAudit().some((a) => a.action === 'print_forms.generated'));
  assert.ok(!JSON.stringify(store.readAudit()).includes('0000 000000'));
  store.updateUser(owner, admin.id, { allowedSections: [] });
  assert.equal((await request('/api/print-forms', adminCookie)).status, 403);
  store.storageWarning = { persistent: false };
  assert.equal((await request('/api/print-forms', ownerCookie)).status, 503);
});

test('Supabase employee updates retain structured employment details', async () => {
  const f = fixture();
  const records = [{ ...f.employee, id: 'worker', role: 'employee' }];
  const store = Object.create(SupabaseStore.prototype);
  store.listUsers = async () => records;
  store.saveUsers = async (users) => { assert.equal(users[0].employmentDetails.passportNumber, '1111 111111'); };
  store.audit = async () => {};
  await store.updateUser({ id: 'owner', role: 'owner' }, 'worker', { employmentDetails: { ...f.employee.employmentDetails, passportNumber: '1111 111111' } });
});

module.exports = { fixture };
