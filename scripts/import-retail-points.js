'use strict';

const fs = require('fs');
const path = require('path');

const { createStore } = require('../lib/app');

const actor = {
  id: 'retail-points-import',
  role: 'owner',
  fullName: 'Retail points import',
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fileArg = args.find((arg) => arg !== '--dry-run');
  if (!fileArg) {
    throw new Error('Usage: node scripts/import-retail-points.js <points.json> [--dry-run]');
  }

  const jsonPath = path.resolve(fileArg);
  const records = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  if (!Array.isArray(records)) {
    throw new Error('Import file must contain an array of retail point records.');
  }

  const store = createStore();
  const existing = await asPromise(store.listRetailPoints(actor));
  const existingByName = new Map(existing.map((point) => [normalizeKey(point.name), point]));
  const result = {
    source: jsonPath,
    dryRun,
    total: records.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  for (const [index, record] of records.entries()) {
    try {
      const payload = normalizeImportRecord(record);
      if (!payload.name) {
        result.skipped += 1;
        continue;
      }

      const existingPoint = existingByName.get(normalizeKey(payload.name));
      if (existingPoint) {
        result.updated += 1;
        if (!dryRun) {
          const updated = await asPromise(store.updateRetailPoint(actor, existingPoint.id, payload));
          existingByName.set(normalizeKey(updated.name), updated);
        }
      } else {
        result.created += 1;
        if (!dryRun) {
          const created = await asPromise(store.createRetailPoint(actor, payload));
          existingByName.set(normalizeKey(created.name), created);
        }
      }
    } catch (error) {
      result.errors.push({
        row: index + 2,
        name: record?.name || record?.['Название торговой точки'] || '',
        error: error.message,
      });
    }
  }

  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length) {
    process.exitCode = 1;
  }
}

function normalizeImportRecord(record) {
  return {
    name: text(record.name),
    address: text(record.address),
    landlord: text(record.landlord),
    legalEntity: text(record.legalEntity),
    rentCost: text(record.rentCost),
    ownerName: text(record.ownerName),
    phone: text(record.phone),
    email: text(record.email),
    comment: text(record.comment),
  };
}

function normalizeKey(value) {
  return text(value).toLowerCase();
}

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function asPromise(value) {
  return value && typeof value.then === 'function' ? value : Promise.resolve(value);
}
