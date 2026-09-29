'use strict';

const crypto = require('crypto');

const locks = new WeakMap();
const registryKey = (companyId) => `print_register_${crypto.createHash('sha256').update(companyId).digest('hex')}.json`;
const draftKey = (employeeId, companyId) => `print_form_${crypto.createHash('sha256').update(JSON.stringify([employeeId, companyId])).digest('hex')}.json`;
const emptyRegistry = () => ({ counter: 0, entries: [] });

function failure(message, status = 503) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function validateRegistry(value) {
  if (!value || !Number.isSafeInteger(value.counter) || value.counter < 0 || !Array.isArray(value.entries)) {
    throw failure('Реестр документов поврежден. Нумерация остановлена; обратитесь к владельцу.');
  }
  return structuredClone(value);
}

// Numbers and document snapshots are committed in one conditional database write.
// A process-local mutex alone would not protect concurrent Vercel instances.
async function updateRegistry(store, companyId, initial, update) {
  const key = registryKey(companyId);
  if (typeof store.supabaseFetch === 'function') {
    try {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const response = await store.supabaseFetch(`/rest/v1/app_kv?key=eq.${key}&select=value,updated_at`);
        const [row] = await response.json();
        const value = validateRegistry(row ? row.value : initial);
        const result = update(value);
        const updatedAt = new Date(Math.max(Date.now(), row ? Date.parse(row.updated_at) + 1 : 0)).toISOString();
        const write = row
          ? await store.supabaseFetch(`/rest/v1/app_kv?key=eq.${key}&updated_at=eq.${encodeURIComponent(row.updated_at)}&select=key`, {
            method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ value, updated_at: updatedAt }),
          })
          : await store.supabaseFetch('/rest/v1/app_kv?on_conflict=key&select=key', {
            method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
            body: JSON.stringify({ key, value, updated_at: updatedAt }),
          });
        if ((await write.json()).length === 1) return result;
      }
      throw failure('Реестр одновременно изменяется. Обновите список и повторите формирование.', 409);
    } catch (error) {
      if (error.status === 409) throw error;
      throw failure('База не подтвердила сохранение документов. Обновите реестр перед повторной попыткой; номер мог быть уже сохранен.');
    }
  }

  let storeLocks = locks.get(store);
  if (!storeLocks) { storeLocks = new Map(); locks.set(store, storeLocks); }
  const previous = storeLocks.get(key) || Promise.resolve();
  const pending = previous.catch(() => {}).then(async () => {
    const value = validateRegistry(await store.loadJson(key, initial));
    const result = update(value);
    await store.saveJson(key, value);
    if (store.storageStatus()?.persistent === false) throw failure('Документы не сохранены в постоянном хранилище.');
    return result;
  });
  storeLocks.set(key, pending);
  try { return await pending; }
  finally { if (storeLocks.get(key) === pending) storeLocks.delete(key); }
}

function summary(entry, company) {
  return {
    id: entry.id, employeeId: entry.employeeId, employeeName: entry.employeeName,
    companyId: company.id, companyName: company.shortName || company.name,
    contractNumber: entry.contractNumber || '', contractDate: entry.contractDate || '',
    formIds: Object.keys(entry.documents || {}), revision: entry.revision,
    updatedAt: entry.updatedAt, updatedBy: entry.updatedBy, imported: Boolean(entry.imported),
  };
}

module.exports = { registryKey, draftKey, emptyRegistry, validateRegistry, updateRegistry, summary };
