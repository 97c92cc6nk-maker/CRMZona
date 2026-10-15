'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../lib/app');

test('design preview never imports production point seeds', () => {
  const previous = process.env.CRMZONA_DESIGN_PREVIEW;
  process.env.CRMZONA_DESIGN_PREVIEW = 'true';
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'crmzona-preview-test-')));
  try {
    store.saveRetailPoints([{id:'only-demo-point',name:'Демонстрационная точка'}]);
    const owner = store.createUser({fullName:'Демо Тест Проверочный',phone:'+79990000001',email:'isolated@example.com',password:'PreviewTest2026!'});
    for (let read = 0; read < 2; read++) {
      assert.deepEqual(store.listRetailPoints(owner).map(p => p.id), ['only-demo-point']);
    }
    assert.deepEqual(store.loadJson('retail_points.json', []).map(p => p.id), ['only-demo-point']);
  } finally {
    if (previous === undefined) delete process.env.CRMZONA_DESIGN_PREVIEW;
    else process.env.CRMZONA_DESIGN_PREVIEW = previous;
  }
});
