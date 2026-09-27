'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { gzipSync } = require('node:zlib');

// Only public application assets enter this cache, never API responses or files from data/.
const files = new Map();
for (const name of ['index.html', 'startup.js', 'app.js', 'styles.css', 'print-forms-model.js',
  'print-forms.js', 'surveillance.js', 'surveillance.css', 'connection.html', 'health.html']) {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'public', name));
  const gzip = gzipSync(raw);
  const ext = path.extname(name);
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[ext];
  files.set('/' + name, {
    raw, gzip, type: type + '; charset=utf-8',
    etag: 'W/"' + crypto.createHash('sha256').update(raw).digest('hex') + '"',
  });
}

function serveStandardClient(req, res, pathname) {
  const asset = files.get(['/', '/stable.html'].includes(pathname) ? '/index.html' : pathname);
  if (!asset) return false;
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return true;
  }
  const gzip = String(req.headers['accept-encoding'] || '').split(',').some((item) => {
    const [name, quality = 'q=1'] = item.trim().split(';');
    return name === 'gzip' && Number(quality.trim().replace(/^q=/, '')) > 0;
  });
  const headers = {
    'Content-Type': asset.type,
    'Cache-Control': 'public, no-cache, no-transform',
    Vary: 'Accept-Encoding',
    ETag: asset.etag,
  };
  if (String(req.headers['if-none-match'] || '').split(',').map((tag) => tag.trim()).includes(asset.etag)) {
    res.writeHead(304, headers);
    res.end();
  } else {
    const bytes = gzip ? asset.gzip : asset.raw;
    if (gzip) headers['Content-Encoding'] = 'gzip';
    headers['Content-Length'] = bytes.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : bytes);
  }
  return true;
}

module.exports = serveStandardClient;
