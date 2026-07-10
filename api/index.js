'use strict';

const os = require('os');
const path = require('path');

process.env.VERCEL_API_ADAPTER = '1';

if (!process.env.DATA_DIR) {
  process.env.DATA_DIR = path.join(os.tmpdir(), 'crmzona-data');
}

let handler = null;
let bootError = null;

try {
  const { createRequestHandler } = require('../src/server');
  handler = createRequestHandler();
} catch (error) {
  bootError = error;
}

module.exports = (req, res) => {
  if (bootError) {
    console.error('CRMZona boot failed:', bootError);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      ok: false,
      error: bootError.message,
      stack: bootError.stack,
    }));
    return;
  }

  return handler(req, res);
};
