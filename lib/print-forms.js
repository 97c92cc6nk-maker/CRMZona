'use strict';

const crypto = require('crypto');
const model = require('../public/print-forms-model');

function fail(status, message, details) {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  throw error;
}

function normalizeEmploymentDetails(input) {
  try { return model.normalizeDetails(input); }
  catch (error) { fail(400, error.message); }
}

function employeeData(user) {
  return {
    id: user.id, fullName: user.fullName, position: user.position || '',
    phone: user.phone, email: user.email, hireDate: user.hireDate || '',
    officialSalary: user.officialSalary || '', archived: Boolean(user.archivedAt),
    employmentDetails: normalizeEmploymentDetails(user.employmentDetails),
  };
}

function companyData(company) {
  return Object.fromEntries(['id', 'name', 'shortName', 'legalAddress', 'inn', 'ogrnip', 'director', 'phone', 'email', 'pointIds', 'bankName', 'bankBik', 'bankAccount', 'bankCorrespondentAccount'].map((key) => [key, company[key]]));
}

function assertStorage(store) {
  const status = store.storageStatus();
  if (status?.persistent === false || store.fallbackReason) fail(503, 'Источник данных недоступен. Печатные формы не сформированы; повторите после восстановления базы.');
}

async function handleRequest({ req, pathname, requestUrl, store, actor, readJsonBody, normalizeCompanies }) {
  const users = await store.listUsers();
  const companies = normalizeCompanies(await store.loadJson('companies.json', []));
  const points = await store.loadJson('retail_points.json', []);
  assertStorage(store);

  if (req.method === 'GET' && pathname === '/api/print-forms') {
    return { body: {
      employees: users.map(employeeData).sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru')),
      companies: companies.map(companyData).sort((a, b) => (a.shortName || a.name).localeCompare(b.shortName || b.name, 'ru')),
      points: points.map((p) => ({ id: p.id, name: p.name, address: p.address || '', legalEntity: p.legalEntity || '' })),
      forms: model.forms, version: model.version,
    } };
  }
  const input = req.method === 'GET' ? Object.fromEntries(requestUrl.searchParams) : await readJsonBody(req);
  const employee = users.find((u) => u.id === input.employeeId);
  const company = companies.find((c) => c.id === input.companyId);
  if (!employee || !company) fail(400, 'Выберите существующих сотрудника и компанию.');
  const key = `print_form_${crypto.createHash('sha256').update(JSON.stringify([employee.id, company.id])).digest('hex')}.json`;

  if (req.method === 'GET' && pathname === '/api/print-forms/draft') {
    const draft = await store.loadJson(key, null);
    assertStorage(store);
    return { body: { draft } };
  }
  let settings;
  try { settings = model.normalizeSettings(input.settings || {}); }
  catch (error) { fail(400, error.message); }
  if (settings.pointId && !points.some((p) => p.id === settings.pointId)) fail(400, 'Торговая точка больше не существует.');

  if (req.method === 'PUT' && pathname === '/api/print-forms/draft') {
    const draft = { settings, updatedAt: new Date().toISOString(), updatedBy: actor.fullName };
    await store.saveJson(key, draft);
    assertStorage(store);
    await store.audit('print_forms.draft_saved', { employeeId: employee.id, companyId: company.id }, actor.id);
    return { body: { draft } };
  }
  if (req.method === 'POST' && pathname === '/api/print-forms/render') {
    const ids = Array.isArray(input.formIds) ? [...new Set(input.formIds)] : [];
    const context = { employee: employeeData(employee), company: companyData(company), point: points.find((p) => p.id === settings.pointId), settings };
    const errors = model.validate(context, ids);
    if (errors.length) fail(400, errors.join('\n'));
    // Audit identifiers only: passport numbers, bank details and document text stay out of logs.
    await store.audit('print_forms.generated', { employeeId: employee.id, companyId: company.id, formIds: ids, templateVersion: model.version, purpose: input.purpose === 'print' ? 'print_requested' : 'preview' }, actor.id);
    return { body: { html: model.render(context, ids), generatedAt: new Date().toISOString(), templateVersion: model.version } };
  }
  fail(404, 'Маршрут печатных форм не найден.');
}

module.exports = { handleRequest, normalizeEmploymentDetails };
