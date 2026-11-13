'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { fetchRates } = require('../lib/financial-rates');

async function main() {
  const asOf = process.argv[2];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf || '')) throw new Error('Specify a verified-through date');
  const seed = await fetchRates(asOf);
  fs.writeFileSync(path.join(__dirname, '../lib/financial-key-rate-history.json'), `${JSON.stringify(seed, null, 2)}\n`);
  console.log(JSON.stringify(seed));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
