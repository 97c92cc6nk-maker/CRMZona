'use strict';

const fs = require('node:fs');
const { parseEnv, isDeepStrictEqual } = require('node:util');
const { createHash } = require('node:crypto');
const { KEY, validateHistory } = require('../lib/financial-history');

async function importHistory(store, input, { apply = false } = {}) {
  const payload = validateHistory(input);
  const current = await store.loadJson(KEY, null);
  if (current) {
    validateHistory(current);
    if (!isDeepStrictEqual(current.months, payload.months) || current.source.sha256 !== payload.source.sha256) {
      throw new Error('A different history already exists. Refusing to overwrite it.');
    }
    if (apply) await store.audit('finance.history_import_verified', { source: payload.source.name, sha256: payload.source.sha256, months: 32 });
    return { status: 'already-imported', months: 32, key: KEY };
  }
  if (!apply) return { status: 'validated', months: 32, key: KEY };
  const protectedKeys = ['reports.json', 'schedules.json', 'users.json', 'expenses.json', 'retail_points.json', 'companies.json'];
  const fingerprints = async () => {
    const result = {};
    for (const key of protectedKeys) result[key] = createHash('sha256').update(JSON.stringify(await store.loadJson(key, null))).digest('hex');
    return result;
  };
  const before = await fingerprints();
  const stored = { ...payload, importedAt: new Date().toISOString() };
  // Insert only: a concurrent import must never overwrite an existing archive.
  await store.supabaseFetch('/rest/v1/app_kv', { method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ key: KEY, value: stored, updated_at: stored.importedAt }) });
  const confirmed = validateHistory(await store.loadJson(KEY, null));
  if (!isDeepStrictEqual(confirmed.months, payload.months)) throw new Error('Read-back verification failed.');
  await store.audit('finance.history_imported', { source: payload.source.name, sha256: payload.source.sha256,
    months: 32, from: '2024-01', to: '2026-08', ausnCompanyCount: 6 });
  const after = await fingerprints();
  return { status: 'imported-and-verified', months: 32, key: KEY, sourceHash: payload.source.sha256,
    otherRecordsUnchanged: protectedKeys.every((key) => before[key] === after[key]) };
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node scripts/import-financial-history.js payload.json [--env-stdin] [--apply]');
  const payload = validateHistory(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (process.argv.includes('--env-stdin')) {
    let source = ''; for await (const chunk of process.stdin) source += chunk;
    const env = parseEnv(source.replace(/^\uFEFF/, ''));
    for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY']) if (env[name]) process.env[name] = env[name];
  }
  const { SupabaseStore } = require('../lib/app');
  console.log(JSON.stringify(await importHistory(new SupabaseStore({ strict: true }), payload, { apply: process.argv.includes('--apply') })));
}

if (require.main === module) main().catch(() => { console.error('Financial history import failed. Check the source validation, database access and existing archive; no other application records are written.'); process.exitCode = 1; });
module.exports = { importHistory };
