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
    company: { id: 'company', name: 'ИП Тестов Тест Тестович', shortName: 'ТЕСТ', inn: '000000000000', ogrnip: '000000000000000', legalAddress: 'Тестовый адрес работодателя', contractCity: 'Москва', pointIds: [] },
    contractNumber: '1',
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
  context.settings.workingConditions = '';
  context.employee.officialSalary = '';
  context.company.contractCity = '';
  assert.ok(model.validate(context, ['contract']).length >= 3);
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
  assert.equal(draft.draft.settings.workingConditions, f.settings.workingConditions);
  const render = await request('/api/print-forms/render', ownerCookie, 'POST', payload);
  assert.equal(render.status, 200, await render.clone().text());
  const generated = await render.json();
  assert.match(generated.html, /Тестов Иван Иванович/);
  assert.equal(generated.record.contractNumber, '1');
  assert.equal(generated.record.contractDate, worker.hireDate);
  assert.equal((await request('/api/print-forms/render', ownerCookie, 'POST', payload)).status, 409);
  const corrected = await (await request('/api/print-forms/render', ownerCookie, 'POST', {
    ...payload, recordRevision: generated.record.revision, settings: { ...payload.settings, workingConditions: 'Класс 2, исправление' },
  })).json();
  assert.equal(corrected.record.contractNumber, '1');
  assert.notEqual(corrected.record.revision, generated.record.revision);
  const refreshed = await (await request('/api/print-forms', ownerCookie)).json();
  assert.equal(refreshed.records.length, 1);
  assert.deepEqual(refreshed.records[0].formIds, ['contract', 'job']);
  assert.equal(refreshed.records[0].html, undefined);
  const savedRecord = await (await request(`/api/print-forms/record?companyId=${f.company.id}&recordId=${corrected.record.id}`, adminCookie)).json();
  assert.match(savedRecord.html, /Класс 2, исправление/);
  const updatedCompany = await request(`/api/companies/${f.company.id}`, ownerCookie, 'PATCH', { ...f.company, contractCity: 'Истра' });
  assert.equal(updatedCompany.status, 200, await updatedCompany.clone().text());
  const updatedDirectory = await (await request('/api/print-forms', ownerCookie)).json();
  assert.equal(updatedDirectory.companies.find((company) => company.id === f.company.id).contractCity, 'Истра');
  assert.match((await (await request(`/api/print-forms/record?companyId=${f.company.id}&recordId=${corrected.record.id}`, ownerCookie)).json()).html, /Москва/);
  const secondCompany = { ...f.company, id: 'other-company', name: 'ИП Другой Предприниматель', shortName: 'ДРУГОЙ', inn: '111111111111' };
  store.saveJson('companies.json', [...store.loadJson('companies.json', []), secondCompany]);
  const otherCompanyRender = await (await request('/api/print-forms/render', ownerCookie, 'POST', { ...payload, companyId: secondCompany.id })).json();
  assert.equal(otherCompanyRender.record.contractNumber, '1');
  const secondWorker = store.createUser({ ...f.employee, fullName: 'Другой Работник', email: 'another@example.com', phone: '+79990000004', password: 'LocalTest123!', role: 'employee' });
  store.updateUser(owner, secondWorker.id, { employmentDetails: f.employee.employmentDetails });
  const secondWorkerRender = await (await request('/api/print-forms/render', ownerCookie, 'POST', { ...payload, employeeId: secondWorker.id })).json();
  assert.equal(secondWorkerRender.record.contractNumber, '2');
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

test('contract dates and employer details are authoritative; removed inputs cannot override templates', () => {
  const f = fixture();
  f.settings = { ...f.settings, city: 'Forged city', representative: 'Forged signer', employerPassport: 'EMPLOYER_SECRET',
    schedule: 'Forged schedule', contractNumber: '999', advanceDay: '99', salaryDay: '88' };
  const html = model.render(f, ['contract']);
  assert.match(html, /01\.10\.2026/);
  assert.doesNotMatch(html, /27\.09\.2026|Forged|EMPLOYER_SECRET|№ 999/);
  assert.match(html, /Трудовой договор № 1/);
  assert.match(html, /календарный квартал/);
  assert.match(html, /шесть перерывов по 15 минут/);
  assert.match(html, /два раза в месяц/);
  assert.match(html, /правилами внутреннего трудового распорядка/);
  assert.match(html, /на основании свидетельства/);
  assert.deepEqual(model.relevantFields(['contract']).map((field) => field.key), ['workingConditions']);
  assert.deepEqual(model.normalizeSettings(f.settings), fixture().settings);
  f.settings.documentDate = '';
  assert.deepEqual(model.validate(f, ['contract']), []);
  assert.ok(model.validate(f, ['resign']).some((message) => message.includes('дату остальных')));
  f.employee.hireDate = '';
  assert.ok(model.validate(f, ['contract']).some((message) => message.includes('начала работы')));
  assert.doesNotMatch(model.render(fixture(), model.forms.map((form) => form.id)), /удостоверяющий личность работодателя/);
});

test('registry conditional writes isolate companies and serialize concurrent cloud requests', async () => {
  const { updateRegistry, emptyRegistry } = require('../lib/print-register');
  const rows = new Map();
  const store = { async supabaseFetch(pathname, options = {}) {
    const url = new URL(pathname, 'https://example.test');
    const key = url.searchParams.get('key')?.slice(3);
    if (!options.method) {
      const snapshot = rows.has(key) ? [structuredClone(rows.get(key))] : [];
      await new Promise((resolve) => setImmediate(resolve));
      return Response.json(snapshot);
    }
    const body = JSON.parse(options.body);
    if (options.method === 'POST') {
      if (rows.has(body.key)) return Response.json([]);
      rows.set(body.key, body); return Response.json([{ key: body.key }]);
    }
    assert.equal(options.method, 'PATCH');
    if (rows.get(key)?.updated_at !== url.searchParams.get('updated_at')?.slice(3)) return Response.json([]);
    rows.set(key, { key, ...body }); return Response.json([{ key }]);
  } };
  const results = await Promise.all(Array.from({ length: 6 }, () => updateRegistry(store, 'company', emptyRegistry(), (registry) => ++registry.counter)));
  assert.deepEqual(results.sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
  assert.equal(await updateRegistry(store, 'different-company', emptyRegistry(), (registry) => ++registry.counter), 1);
  const broken = { supabaseFetch: async () => { throw new Error('network lost'); } };
  await assert.rejects(updateRegistry(broken, 'company', emptyRegistry(), () => {}), (error) => error.status === 503 && /мог быть уже сохранен/.test(error.message));
});

test('legacy draft numbers survive saving, generation and store restart', async (t) => {
  const register = require('../lib/print-register');
  const { handleRequest } = require('../lib/print-forms');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-print-legacy-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new Store(dir), f = fixture();
  const owner = store.createUser({ fullName: 'Тестовый Владелец', phone: '+79990000001', email: 'owner@example.com', password: 'LocalTest123!', role: 'owner' });
  const worker = store.createUser({ ...f.employee, password: 'LocalTest123!', role: 'employee' });
  store.updateUser(owner, worker.id, { employmentDetails: f.employee.employmentDetails });
  store.saveJson('companies.json', [f.company]); store.saveJson('retail_points.json', [f.point]);
  const key = register.draftKey(worker.id, f.company.id);
  store.saveJson(key, { settings: { ...f.settings, pointId: f.point.id, contractNumber: '12' }, updatedAt: '2026-09-27T12:00:00Z', updatedBy: 'Владелец' });
  const payload = { employeeId: worker.id, companyId: f.company.id, settings: { ...f.settings, pointId: f.point.id }, formIds: ['contract'] };
  const request = (method, suffix, input) => handleRequest({ req: { method }, pathname: `/api/print-forms${suffix}`,
    requestUrl: new URL(`https://example.test/api/print-forms${suffix}`), store, actor: owner,
    readJsonBody: async () => input, normalizeCompanies: (value) => value });
  const directory = await request('GET', '');
  assert.equal(directory.body.records[0].contractNumber, '12');
  assert.equal(directory.body.records[0].imported, true);
  await request('PUT', '/draft', payload);
  assert.equal(store.loadJson(key, null).settings.contractNumber, '12');
  const generated = await request('POST', '/render', payload);
  assert.equal(generated.body.record.contractNumber, '12');
  const nextWorker = store.createUser({ ...f.employee, email: 'next@example.com', phone: '+79990000004', password: 'LocalTest123!', role: 'employee' });
  store.updateUser(owner, nextWorker.id, { employmentDetails: f.employee.employmentDetails });
  const next = await request('POST', '/render', { ...payload, employeeId: nextWorker.id });
  assert.equal(next.body.record.contractNumber, '13');
  const reloaded = new Store(dir).loadJson(register.registryKey(f.company.id), null);
  assert.equal(reloaded.counter, 13);
  assert.equal(reloaded.entries.length, 2);
  assert.match(reloaded.entries.find((entry) => entry.employeeId === worker.id).documents.contract.html, /Трудовой договор № 12/);
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
