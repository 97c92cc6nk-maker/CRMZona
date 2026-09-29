'use strict';

const crypto = require('crypto');
const fs = require('fs');
const model = require('../public/print-forms-model');
const register = require('./print-register');

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
  return Object.fromEntries(['id', 'name', 'shortName', 'legalAddress', 'contractCity', 'inn', 'ogrnip', 'director', 'phone', 'email', 'pointIds', 'bankName', 'bankBik', 'bankAccount', 'bankCorrespondentAccount'].map((key) => [key, company[key]]));
}

function assertStorage(store) {
  const status = store.storageStatus();
  if (status?.persistent === false || store.fallbackReason) fail(503, 'Источник данных недоступен. Печатные формы не сформированы; повторите после восстановления базы.');
}

async function loadLegacyDrafts(store) {
  const drafts = new Map();
  if (typeof store.supabaseFetch === 'function') {
    for (let offset = 0; ; offset += 1000) {
      const response = await store.supabaseFetch(`/rest/v1/app_kv?key=like.print_form_*.json&select=key,value&order=key&limit=1000&offset=${offset}`);
      const rows = await response.json();
      for (const row of rows) drafts.set(row.key, row.value);
      if (rows.length < 1000) break;
    }
  } else if (store.dataDir) {
    for (const name of fs.readdirSync(store.dataDir).filter((name) => /^print_form_[a-f0-9]{64}\.json$/.test(name))) {
      drafts.set(name, await store.loadJson(name, null));
    }
  }
  assertStorage(store);
  return drafts;
}

async function loadRegister(store, company, users, getLegacyDrafts) {
  const saved = await store.loadJson(register.registryKey(company.id), null);
  assertStorage(store);
  if (saved) return register.validateRegistry(saved);
  const result = register.emptyRegistry();
  // Preserve manually numbered drafts from the previous version; never silently reuse their numbers.
  const drafts = await getLegacyDrafts();
  for (const user of users) {
    const draft = drafts.get(register.draftKey(user.id, company.id));
    const number = String(draft?.settings?.contractNumber || '').trim();
    if (!number) continue;
    if (result.entries.some((entry) => entry.contractNumber === number)) fail(409, `У компании ${company.shortName || company.name} повторяется старый номер договора ${number}. Исправьте старые условия до запуска нумерации.`);
    if (/^[1-9]\d*$/.test(number) && Number.isSafeInteger(Number(number))) result.counter = Math.max(result.counter, Number(number));
    result.entries.push({ id: `legacy-${crypto.createHash('sha256').update(JSON.stringify([user.id, company.id])).digest('hex')}`, employeeId: user.id, employeeName: user.fullName,
      contractNumber: number, contractDate: user.hireDate || '', revision: null, imported: true,
      settings: model.normalizeSettings(draft.settings), documents: {}, updatedAt: draft.updatedAt, updatedBy: draft.updatedBy });
  }
  return result;
}

async function handleRequest({ req, pathname, requestUrl, store, actor, readJsonBody, normalizeCompanies }) {
  const users = await store.listUsers();
  const companies = normalizeCompanies(await store.loadJson('companies.json', []));
  const points = await store.loadJson('retail_points.json', []);
  assertStorage(store);
  let legacyDrafts;
  const getLegacyDrafts = () => (legacyDrafts ||= loadLegacyDrafts(store));

  if (req.method === 'GET' && pathname === '/api/print-forms') {
    const registries = await Promise.all(companies.map(async (company) => {
      const value = await loadRegister(store, company, users, getLegacyDrafts);
      return value.entries.map((entry) => register.summary(entry, company));
    }));
    return { body: {
      employees: users.map(employeeData).sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru')),
      companies: companies.map(companyData).sort((a, b) => (a.shortName || a.name).localeCompare(b.shortName || b.name, 'ru')),
      points: points.map((p) => ({ id: p.id, name: p.name, address: p.address || '', legalEntity: p.legalEntity || '' })),
      forms: model.forms, version: model.version,
      records: registries.flat().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')),
    } };
  }
  const input = req.method === 'GET' ? Object.fromEntries(requestUrl.searchParams) : await readJsonBody(req);
  const employee = users.find((u) => u.id === input.employeeId);
  const company = companies.find((c) => c.id === input.companyId);
  if (!company) fail(400, 'Выберите существующую компанию.');
  const registry = await loadRegister(store, company, users, getLegacyDrafts);
  if (req.method === 'GET' && pathname === '/api/print-forms/record') {
    const entry = registry.entries.find((item) => item.id === input.recordId);
    if (!entry) fail(404, 'Документы не найдены. Обновите реестр.');
    return { body: { record: register.summary(entry, company), html: model.forms.map((form) => entry.documents[form.id]?.html || '').join('') } };
  }
  if (!employee) fail(400, 'Выберите существующего сотрудника. Сохраненные документы удаленного сотрудника доступны только для просмотра.');
  const key = register.draftKey(employee.id, company.id);
  const existing = registry.entries.find((entry) => entry.employeeId === employee.id);

  if (req.method === 'GET' && pathname === '/api/print-forms/draft') {
    let draft = await store.loadJson(key, null);
    if (existing && (!draft || (existing.updatedAt || '') >= (draft.updatedAt || ''))) {
      draft = { settings: existing.settings, updatedAt: existing.updatedAt, updatedBy: existing.updatedBy };
    }
    assertStorage(store);
    return { body: { draft, record: existing ? register.summary(existing, company) : null } };
  }
  let settings;
  try { settings = model.normalizeSettings(input.settings || {}); }
  catch (error) { fail(400, error.message); }
  const ids = Array.isArray(input.formIds) ? [...new Set(input.formIds)] : [];
  if (req.method === 'POST' && pathname === '/api/print-forms/render' && !model.needsPoint(ids)) settings.pointId = '';
  if (settings.pointId && !points.some((p) => p.id === settings.pointId)) fail(400, 'Торговая точка больше не существует.');

  if (req.method === 'PUT' && pathname === '/api/print-forms/draft') {
    const draft = { settings: { ...settings, ...(existing?.imported ? { contractNumber: existing.contractNumber } : {}) }, updatedAt: new Date().toISOString(), updatedBy: actor.fullName };
    await store.saveJson(key, draft);
    assertStorage(store);
    await store.audit('print_forms.draft_saved', { employeeId: employee.id, companyId: company.id }, actor.id);
    return { body: { draft } };
  }
  if (req.method === 'POST' && pathname === '/api/print-forms/render') {
    const context = { employee: employeeData(employee), company: companyData(company), point: points.find((p) => p.id === settings.pointId), settings };
    const errors = model.validate(context, ids);
    if (errors.length) fail(400, errors.join('\n'));
    const saved = await register.updateRegistry(store, company.id, registry, (value) => {
      let entry = value.entries.find((item) => item.employeeId === employee.id);
      if ((entry?.revision || null) !== (input.recordRevision || null)) fail(409, 'Документы уже изменены. Обновите данные перед внесением исправлений.');
      const generatedAt = new Date().toISOString();
      if (!entry) {
        entry = { id: crypto.randomUUID(), employeeId: employee.id, documents: {}, createdAt: generatedAt };
        value.entries.push(entry);
      }
      if (ids.some((id) => ['contract', 'liability'].includes(id)) && !entry.contractNumber) {
        do { value.counter += 1; }
        while (value.entries.some((item) => item.contractNumber === String(value.counter)));
        if (!Number.isSafeInteger(value.counter)) fail(409, 'Достигнут предел нумерации. Обратитесь к владельцу.');
        entry.contractNumber = String(value.counter);
      }
      context.contractNumber = entry.contractNumber || '';
      for (const id of ids) entry.documents[id] = { html: model.render(context, [id]), generatedAt, templateVersion: model.version };
      Object.assign(entry, { employeeName: employee.fullName, settings, updatedAt: generatedAt, updatedBy: actor.fullName,
        revision: crypto.randomUUID(), imported: false });
      if (ids.includes('contract')) entry.contractDate = employee.hireDate;
      return { html: ids.map((id) => entry.documents[id].html).join(''), generatedAt, record: register.summary(entry, company) };
    });
    assertStorage(store);
    // Audit identifiers only: passport numbers, bank details and document text stay out of logs.
    await store.audit('print_forms.generated', { employeeId: employee.id, companyId: company.id, recordId: saved.record.id, contractNumber: saved.record.contractNumber, formIds: ids, templateVersion: model.version, purpose: input.purpose === 'print' ? 'print_requested' : 'preview' }, actor.id);
    return { body: { ...saved, templateVersion: model.version } };
  }
  fail(404, 'Маршрут печатных форм не найден.');
}

module.exports = { handleRequest, normalizeEmploymentDetails };
