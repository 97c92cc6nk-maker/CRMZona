'use strict';

// Only the build's public assets are embedded here, never arbitrary disk files.
const parts = require('./client-delivery.json');
const SLICE_BYTES = 2048;

module.exports = function clientPart(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-transform');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (status, bytes) => {
    res.statusCode = status;
    res.setHeader('Content-Length', bytes.length);
    res.end(req.method === 'HEAD' ? undefined : bytes);
  };
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    return send(405, Buffer.from('METHOD_NOT_ALLOWED'));
  }
  const query = new URL(req.url, 'http://localhost').searchParams;
  const name = query.get('name'), rawOffset = query.get('offset');
  if (query.getAll('name').length !== 1 || query.getAll('offset').length !== 1
    || [...query.keys()].some((key) => !['name', 'offset'].includes(key))
    || !/^(0|[1-9]\d{0,4})$/.test(rawOffset || '')) {
    return send(400, Buffer.from('INVALID_REQUEST'));
  }
  if (!Object.hasOwn(parts, name)) return send(404, Buffer.from('PART_NOT_FOUND'));
  const bytes = Buffer.from(parts[name], 'base64'), offset = Number(rawOffset);
  if (offset % SLICE_BYTES || offset >= bytes.length) return send(400, Buffer.from('INVALID_OFFSET'));
  return send(200, bytes.subarray(offset, offset + SLICE_BYTES));
};
