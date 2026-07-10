'use strict';

module.exports = (req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({
    ok: true,
    runtime: 'vercel-function',
    at: new Date().toISOString(),
  }));
};
