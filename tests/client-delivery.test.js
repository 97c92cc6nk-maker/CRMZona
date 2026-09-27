'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const { build } = require('../scripts/build-client');
const handler = require('../api/client-part');
const generated = build();

test('standalone public delivery returns exact bounded slices without database or authentication', async (t) => {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}/api/client-part`;
  for (const [name, size, digest] of generated.manifest.parts) {
    const chunks = [];
    for (let offset = 0; offset < size; offset += 2048) {
      const response = await fetch(`${base}?name=${name}&offset=${offset}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store, no-transform');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.length, Math.min(2048, size - offset));
      assert.equal(response.headers.get('content-length'), String(bytes.length));
      chunks.push(bytes);
    }
    const complete = Buffer.concat(chunks);
    assert.equal(crypto.createHash('sha256').update(complete).digest('hex'), digest);
    assert.deepEqual(complete, generated.files.get('public/client-parts/' + name));
  }
  const name = generated.manifest.parts[0][0];
  for (const query of [
    '', `?name=${name}`, `?name=${name}&offset=-1`, `?name=${name}&offset=1`,
    `?name=${name}&offset=6144`, `?name=${name}&offset=0&offset=2048`,
    `?name=${name}&offset=0&path=.env`, '?name=../../.env&offset=0',
    '?name=__proto__&offset=0', '?name=constructor&offset=0', '?name=unknown.bin&offset=0',
  ]) {
    const response = await fetch(base + query);
    assert.ok([400, 404].includes(response.status), query);
    assert.ok((await response.text()).length < 30);
  }
  const denied = await fetch(`${base}?name=${name}&offset=0`, { method: 'POST' });
  assert.equal(denied.status, 405);
  assert.equal(denied.headers.get('allow'), 'GET, HEAD');
  const head = await fetch(`${base}?name=${name}&offset=0`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), '2048');
  assert.equal(await head.text(), '');
});
