'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

loadEnvFile(path.join(ROOT_DIR, '.env'));

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const DATA_DIR = process.env.DATA_DIR ? path.resolve(ROOT_DIR, process.env.DATA_DIR) : path.join(ROOT_DIR, 'data');

const FILES = [
  ['users.json', []],
  ['sessions.json', {}],
  ['schedules.json', {}],
  ['repairs.json', []],
];

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running migration.');
  }

  for (const [fileName, fallback] of FILES) {
    const value = readJson(fileName, fallback);
    await upsert(fileName, value);
    console.log(`Migrated ${fileName}`);
  }

  const auditPath = path.join(DATA_DIR, 'audit.log');
  if (fs.existsSync(auditPath)) {
    const events = fs.readFileSync(auditPath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { at: null, action: 'audit.parse_failed', details: { line } };
        }
      });
    await upsert('audit.json', events);
    console.log('Migrated audit.json');
  } else {
    await upsert('audit.json', []);
    console.log('Created audit.json');
  }
}

function readJson(fileName, fallback) {
  const filePath = path.join(DATA_DIR, fileName);
  if (!fs.existsSync(filePath)) return fallback;
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw.trim() ? JSON.parse(raw) : fallback;
}

async function upsert(key, value) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/app_kv?on_conflict=key`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      key,
      value,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Supabase migration failed for ${key}: ${text || response.statusText}`);
  }
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
