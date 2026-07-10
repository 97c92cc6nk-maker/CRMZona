'use strict';

const os = require('os');
const path = require('path');

if (!process.env.DATA_DIR) {
  process.env.DATA_DIR = path.join(os.tmpdir(), 'crmzona-data');
}

const { createRequestHandler } = require('../server');

const handler = createRequestHandler();

module.exports = (req, res) => handler(req, res);
