'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const ROOT = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8').replace(/\r\n/g, '\n');
const hash = (value, encoding = 'hex') => crypto.createHash('sha256').update(value).digest(encoding);
const scriptNames = ['print-forms-model.js', 'app.js', 'print-forms.js', 'surveillance.js'];
const styleNames = ['styles.css', 'surveillance.css'];

function build() {
  const bundle = {
    html: read('public/index.html'),
    styles: styleNames.map((name) => read('public/' + name)),
    scripts: scriptNames.map((name) => read('public/' + name)),
  };
  const json = JSON.stringify(bundle);
  const packed = zlib.gzipSync(Buffer.from(json), { level: 9 });
  const manifest = { hash: hash(packed), size: Buffer.byteLength(json), parts: [] };
  const files = new Map();
  const delivery = {};
  for (let offset = 0; offset < packed.length; offset += 6144) {
    const bytes = packed.subarray(offset, offset + 6144);
    const checksum = hash(bytes);
    const name = 'part-' + manifest.parts.length + '-' + checksum.slice(0, 12) + '.bin';
    manifest.parts.push([name, bytes.length, checksum]);
    files.set('public/client-parts/' + name, bytes);
    delivery[name] = bytes.toString('base64');
  }
  const loader = read('client/reliable-loader.js');
  const shell = read('client/reliable-shell.html');
  const html = shell.replace('__CLIENT_MANIFEST__', JSON.stringify(manifest)).replace('__CLIENT_LOADER__', loader);
  if (Buffer.byteLength(html) > 12288 || zlib.gzipSync(html).length > 6144) throw new Error('Reliable entry page exceeds 12 KiB (6 KiB compressed)');
  const diagnostic = read('client/connection.html')
    .replace('__CLIENT_PARTS__', JSON.stringify(manifest.parts))
    .replace('__ENTRY_SIZE__', Buffer.byteLength(html));
  if (Buffer.byteLength(diagnostic) > 8192) throw new Error('Diagnostic page exceeds 8 KiB');
  const shellStyle = shell.match(/<style>([\s\S]*?)<\/style>/)[1];
  const csp = {
    scripts: [loader, diagnostic.match(/<script>([\s\S]*?)<\/script>/)[1], ...bundle.scripts].map((value) => "'sha256-" + hash(value, 'base64') + "'"),
    styles: [shellStyle, diagnostic.match(/<style>([\s\S]*?)<\/style>/)[1], ...bundle.styles].map((value) => "'sha256-" + hash(value, 'base64') + "'"),
  };
  files.set('public/stable.html', Buffer.from(html));
  files.set('lib/client-entry.json', Buffer.from(JSON.stringify(html) + '\n'));
  files.set('public/connection.html', Buffer.from(diagnostic));
  files.set('public/client-parts/manifest.json', Buffer.from(JSON.stringify(manifest)));
  files.set('lib/client-csp.json', Buffer.from(JSON.stringify(csp, null, 2) + '\n'));
  files.set('lib/client-delivery.json', Buffer.from(JSON.stringify(delivery) + '\n'));
  return { files, manifest, bundle, packed };
}

function run(check) {
  const { files, manifest, packed } = build();
  for (const [name, bytes] of files) {
    const target = path.join(ROOT, name);
    if (check) {
      const existing = fs.existsSync(target) ? fs.readFileSync(target) : null;
      const actual = name.endsWith('.bin') ? existing : existing && Buffer.from(existing.toString('utf8').replace(/\r\n/g, '\n'));
      if (!actual || !actual.equals(bytes)) throw new Error(name + ' is stale. Run npm run build:client.');
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes);
    }
  }
  // Remove only obsolete generated parts, never directories or unrelated files.
  if (!check) {
    const directory = path.resolve(ROOT, 'public/client-parts');
    for (const name of fs.readdirSync(directory)) {
      const target = path.resolve(directory, name);
      if (path.dirname(target) !== directory) throw new Error('Invalid generated path');
      if (/^part-\d+-[a-f0-9]{12}\.bin$/.test(name) && !files.has('public/client-parts/' + name)) fs.unlinkSync(target);
    }
  }
  console.log(`Client ${check ? 'verified' : 'built'}: ${manifest.parts.length} parts, ${packed.length} compressed bytes`);
}

if (require.main === module) run(process.argv.includes('--check'));
module.exports = { build, run };
