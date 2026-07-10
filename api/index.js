'use strict';

const { createRequestHandler, createStore } = require('../server');

const store = createStore();
const handler = createRequestHandler(store);

module.exports = (req, res) => handler(req, res);
