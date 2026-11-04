'use strict';

const { SupabaseStore, initializeRetailPointCostHistories, buildManagementReport } = require('../lib/app');
const { isDeepStrictEqual } = require('node:util');

async function main() {
  const store = new SupabaseStore({ strict: true });
  const query = '/rest/v1/app_kv?key=eq.retail_points.json';
  const read = async () => {
    const rows = await (await store.supabaseFetch(`${query}&select=value,updated_at`)).json();
    if (rows.length !== 1 || !Array.isArray(rows[0].value)) throw new Error('Retail point source unavailable; no changes made.');
    return rows[0];
  };
  const before = await read();
  const points = initializeRetailPointCostHistories(before.value);
  const target = points.filter((point) => String(point.name).toLowerCase().replace(/[\s_]+/g, '') === '\u043b\u0430\u0439\u043a\u043e\u0432\u043e\u0432\u043e\u0434\u043e\u043c\u0430\u0442');
  if (target.length !== 1) {
    console.log(JSON.stringify({ candidates: points.filter((point) => /\u043b\u0430\u0439\u043a\u043e\u0432\u043e/i.test(point.name)).map(({ id, name }) => ({ id, name })) }));
    throw new Error('Expected exactly one Laykovo Vodomat point; no changes made.');
  }
  const changed = !isDeepStrictEqual(points, before.value);
  let backupKey;
  if (changed && process.argv.includes('--apply')) {
    if (!before.updated_at) throw new Error('Source revision unavailable; no changes made.');
    backupKey = `backup:retail-point-costs:${new Date().toISOString()}`;
    await store.supabaseFetch('/rest/v1/app_kv', { method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ key: backupKey, value: before.value, updated_at: new Date().toISOString() }) });
    const saved = await (await store.supabaseFetch(`${query}&updated_at=eq.${encodeURIComponent(before.updated_at)}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ value: points, updated_at: new Date().toISOString() }),
    })).json();
    if (saved.length !== 1) throw new Error('Retail points changed concurrently; migration was not applied. Run a fresh check.');
    await store.audit('retail_point.cost_history_migrated', { count: points.length, backupKey }, 'system');
    if (!isDeepStrictEqual((await read()).value, points)) throw new Error('Migration verification failed.');
  }
  const months = ['2026-01', '2026-06', '2026-07', '2026-10'];
  console.log(JSON.stringify({ applied: changed && process.argv.includes('--apply'), changed, count: points.length, backupKey,
    target: { id: target[0].id, name: target[0].name, managerCostHistory: target[0].managerCostHistory },
    checks: months.map((month) => {
      const report = buildManagementReport([], {}, [], [], points, [], {}, month);
      return { month, manager: report.rows.find((row) => row.pointId === target[0].id)?.manager };
    }),
  }));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
