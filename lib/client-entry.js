'use strict';

const zlib = require('node:zlib');
const plain = Buffer.from(require('./client-entry.json'));
const gzip = zlib.gzipSync(plain);

module.exports = function clientEntry(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-transform');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Accept-Encoding');
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain', 'Content-Length': 18 });
    res.end('METHOD_NOT_ALLOWED');
    return;
  }
  const acceptsGzip = String(req.headers['accept-encoding'] || '').split(',').some((token) => {
    const [coding, ...parameters] = token.trim().toLowerCase().split(';');
    return coding === 'gzip' && !parameters.some((value) => /^\s*q\s*=\s*0(?:\.0*)?\s*$/.test(value));
  });
  const bytes = acceptsGzip ? gzip : plain;
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Length', bytes.length);
  if (acceptsGzip) res.setHeader('Content-Encoding', 'gzip');
  res.end(req.method === 'HEAD' ? undefined : bytes);
};
