'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { Store, SupabaseStore, createRequestHandler } = require('../lib/app');

const OFFICE_TYPES = {
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
function functionSource(name) {
  const start = source.indexOf(`async function ${name}(`);
  const end = source.indexOf('\n}', start) + 2;
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}

function uploadUI(files, failedNames = []) {
  const notices = [], requests = [], documents = [{ id: 'existing' }];
  const state = { retailPointDocumentUploading: false, permissions: { canManageRetailPoints: true } };
  const els = {
    retailPointCardForm: { dataset: { pointId: 'point-451' } },
    retailPointDocumentFile: { files, value: 'selected' },
    uploadRetailPointDocument: { disabled: false, textContent: 'Upload' },
    retailPointDocumentsNotice: {},
  };
  let active = 0, maxActive = 0, rendered;
  const context = vm.createContext({ state, els,
    showNotice: (_el, message, type) => notices.push({ message, type }),
    setRetailPointCardEditable: () => {},
    retailPointDocumentPayloadFromFile: async (file) => file,
    api: async (url, options) => {
      active += 1; maxActive = Math.max(active, maxActive);
      requests.push({ url, file: options.body.file.name });
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      if (failedNames.includes(options.body.file.name)) throw new Error('Drive unavailable');
      documents.push({ id: options.body.file.name });
      return { point: { id: 'point-451', documents: [...documents] }, storage: { persistent: true } };
    },
    replaceRetailPointInState: () => {},
    selectedRetailPoint: () => ({ documents }),
    renderRetailPointDocuments: (docs) => { rendered = docs; },
    storageWarningText: () => '',
  });
  vm.runInContext(`${functionSource('runWithButton')}\n${functionSource('handleRetailPointDocumentUpload')}`, context);
  return { context, state, els, notices, requests, documents, run: () => context.handleRetailPointDocumentUpload(),
    maxActive: () => maxActive, rendered: () => rendered };
}

test('point document picker accepts multiple files and has its own accessible result', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.match(html, /<input[^>]*id="retailPointDocumentFile"[^>]*\bmultiple\b/);
  assert.match(html, /id="retailPointDocumentsNotice"[^>]*role="status"/);
  const picker = html.match(/<input[^>]*id="retailPointDocumentFile"[^>]*>/)[0];
  for (const ext of Object.keys(OFFICE_TYPES)) assert.ok(picker.includes(`.${ext}`));
});

function payloadUI() {
  const context = vm.createContext({
    readFileAsDataUrlWithMime: async (_file, mime) => `data:${mime};base64,dGVzdA==`,
    compressReceiptImage: async (file) => ({ size: file.size, dataUrl: 'data:image/jpeg;base64,dGVzdA==' }),
  });
  vm.runInContext(functionSource('retailPointDocumentPayloadFromFile'), context);
  return context.retailPointDocumentPayloadFromFile;
}

test('UI accepts Office documents with native, generic and missing MIME types up to 10 MiB', async () => {
  const payload = payloadUI();
  for (const [ext, mime] of Object.entries(OFFICE_TYPES)) {
    for (const type of [mime, '', 'application/octet-stream']) {
      const file = { name: `document.${ext.toUpperCase()}`, type, size: MAX_FILE_SIZE };
      const result = await payload(file);
      assert.equal(result.mimeType, mime);
      assert.equal(result.fileName, file.name);
      assert.equal(result.size, MAX_FILE_SIZE);
      assert.ok(result.dataUrl.startsWith(`data:${mime};base64,`));
    }
  }
  for (const [name, type] of [['document.pdf', 'application/pdf'], ['photo.jpg', 'image/jpeg']]) {
    assert.equal((await payload({ name, type, size: MAX_FILE_SIZE })).size, MAX_FILE_SIZE);
    await assert.rejects(payload({ name, type, size: MAX_FILE_SIZE + 1 }), /10 МБ/);
  }
  await assert.rejects(payload({ name: 'large.xlsx', type: '', size: MAX_FILE_SIZE + 1 }), /10 МБ/);
  for (const name of ['file.exe', 'file.docm', 'file.xlsm', 'file.zip', 'file.constructor']) {
    await assert.rejects(payload({ name, type: 'application/octet-stream', size: 5 }), /Поддерживаются/);
  }
});

test('company document helper keeps the existing formats and 5 MiB limit', async () => {
  const payload = payloadUI();
  const options = { allowOffice: false, maxBytes: 5 * 1024 * 1024 };
  await assert.rejects(payload({ name: 'doc.docx', type: OFFICE_TYPES.docx, size: 10 }, options), /Поддерживаются/);
  await assert.rejects(payload({ name: 'doc.pdf', type: 'application/pdf', size: options.maxBytes + 1 }, options), /5 МБ/);
});

test('UI uploads every selected document sequentially, preserves existing files and supports another batch', async () => {
  const ui = uploadUI([{ name: 'first.pdf' }, { name: 'second.jpg' }]);
  await ui.run();
  assert.deepEqual(ui.documents.map(d => d.id), ['existing', 'first.pdf', 'second.jpg']);
  assert.equal(ui.maxActive(), 1);
  assert.equal(ui.notices.at(-1).type, 'success');
  assert.match(ui.notices.at(-1).message, /2 из 2/);
  assert.equal(ui.els.retailPointDocumentFile.value, '');
  assert.equal(ui.els.uploadRetailPointDocument.disabled, false);
  assert.equal(ui.state.retailPointDocumentUploading, false);
  ui.els.retailPointDocumentFile.files = [{ name: 'third.pdf' }];
  await ui.run();
  assert.equal(ui.rendered().length, 4);
  assert.ok(ui.requests.every(r => r.url === '/api/retail-points/point-451/documents'));
});

test('UI continues after a failed file and reports partial success without losing uploaded files', async () => {
  const ui = uploadUI([{ name: 'first.pdf' }, { name: 'bad.pdf' }, { name: 'last.pdf' }], ['bad.pdf']);
  await ui.run();
  assert.deepEqual(ui.documents.map(d => d.id), ['existing', 'first.pdf', 'last.pdf']);
  assert.equal(ui.notices.at(-1).type, 'warning');
  assert.match(ui.notices.at(-1).message, /2 из 3/);
  assert.match(ui.notices.at(-1).message, /bad.pdf: Drive unavailable/);
  assert.equal(ui.els.uploadRetailPointDocument.disabled, false);
});

test('UI rejects empty selection and ignores a second click while uploading', async () => {
  const empty = uploadUI([]);
  await empty.run();
  assert.equal(empty.requests.length, 0);
  assert.equal(empty.notices.at(-1).type, 'error');
  const ui = uploadUI([{ name: 'first.pdf' }]);
  await Promise.all([ui.run(), ui.run()]);
  assert.equal(ui.requests.length, 1);
});

test('UI does not switch back or render wrong documents when a different point is opened during upload', async () => {
  const ui = uploadUI([{ name: 'first.pdf' }]);
  const promise = ui.run();
  ui.els.retailPointCardForm.dataset.pointId = 'another-point';
  ui.context.selectedRetailPoint = () => ({ documents: [{ id: 'another-document' }] });
  await promise;
  assert.equal(ui.els.retailPointCardForm.dataset.pointId, 'another-point');
  assert.deepEqual(ui.rendered(), [{ id: 'another-document' }]);
});

for (const mode of ['local', 'supabase']) test(`${mode}: multiple point documents, Office formats and size limits persist correctly`, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-point-docs-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const local = new Store(dir);
  const owner = local.createUser({ fullName: 'Test Owner', email: 'docs@example.test', phone: '+79990000001', password: 'TestPass123!', role: 'owner' });
  const point = local.createRetailPoint(owner, { name: 'КРАСНОГОРСК_451', address: 'Test address' });
  const store = mode === 'local' ? local : Object.assign(Object.create(SupabaseStore.prototype), {
    listUsers: async () => local.listUsers(), loadJson: async (...args) => local.loadJson(...args),
    saveJson: async (...args) => local.saveJson(...args), audit: async (...args) => local.audit(...args),
  });
  const originalEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^GOOGLE_DRIVE_/.test(key)));
  for (const key of Object.keys(originalEnv)) delete process.env[key];
  process.env.GOOGLE_DRIVE_ACCESS_TOKEN = 'test-only-token';
  process.env.GOOGLE_DRIVE_RETAIL_POINT_DOCUMENTS_FOLDER_ID = 'test-only-root';
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (/^GOOGLE_DRIVE_/.test(key)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });
  let uploadCount = 0, fail = false;
  const driveRequests = [];
  global.fetch = async (url, options = {}) => {
    url = String(url);
    assert.ok(url.startsWith('https://www.googleapis.com/'), 'Unexpected external destination');
    driveRequests.push({ url, options });
    let body = { files: [{ id: 'test-point-folder' }], id: 'test-permission' };
    if (url.startsWith('https://www.googleapis.com/upload/drive/')) {
      if (fail) throw new Error('Test upload failure');
      uploadCount += 1;
      body = { id: `test-file-${uploadCount}`, webViewLink: `https://drive.google.com/file/d/test-file-${uploadCount}/view` };
    }
    return { ok: true, status: 200, json: async () => body };
  };
  const file = { fileName: 'same-name.pdf', dataUrl: `data:application/pdf;base64,${Buffer.from('%PDF-test').toString('base64')}` };
  for (let i = 1; i <= 3; i++) {
    const result = await store.addRetailPointDocument(owner, point.id, { file });
    assert.equal(result.point.documents.length, i);
  }
  fail = true;
  await assert.rejects(store.addRetailPointDocument(owner, point.id, { file }), /Test upload failure/);
  const saved = (await store.listRetailPoints(owner)).find(p => p.id === point.id).documents;
  assert.equal(saved.length, 3);
  assert.equal(new Set(saved.map(d => d.id)).size, 3);
  assert.equal(new Set(saved.map(d => d.fileName)).size, 3);
  assert.deepEqual(saved.map(d => d.googleDrive.fileId), ['test-file-1', 'test-file-2', 'test-file-3']);
  await store.updateRetailPoint(owner, point.id, { comment: 'Updated without replacing documents' });
  const reopened = new Store(dir).listRetailPoints(owner).find(p => p.id === point.id);
  assert.deepEqual(reopened.documents, saved);
  assert.equal(driveRequests.filter(r => r.url.includes('/permissions?')).length, 3);

  fail = false;
  for (const [ext, mimeType] of Object.entries(OFFICE_TYPES)) {
    for (const incomingType of [mimeType, 'application/octet-stream']) {
      const result = await store.addRetailPointDocument(owner, point.id, { file: {
        fileName: `document.${ext.toUpperCase()}`, dataUrl: `data:${incomingType};base64,dGVzdA==`,
      } });
      assert.equal(result.document.mimeType, mimeType);
      assert.ok(result.document.fileName.endsWith(`.${ext}`));
      const request = driveRequests.filter(r => r.url.includes('/upload/drive/')).at(-1);
      assert.ok(request.options.body.toString().includes(`Content-Type: ${mimeType}\r\n`));
    }
  }
  const largeFile = { fileName: 'large.xlsx', dataUrl: `data:${OFFICE_TYPES.xlsx};base64,${Buffer.alloc(MAX_FILE_SIZE, 65).toString('base64')}` };
  if (mode === 'local') {
    const server = http.createServer(createRequestHandler(local));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
    const response = await originalFetch(`http://127.0.0.1:${server.address().port}/api/retail-points/${point.id}/documents`, {
      method: 'POST', headers: { Cookie: `session=${local.createSession(owner.id)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: largeFile }),
    });
    const result = await response.json();
    assert.equal(response.status, 201, JSON.stringify(result));
    assert.equal(result.document.size, MAX_FILE_SIZE);
  } else {
    assert.equal((await store.addRetailPointDocument(owner, point.id, { file: largeFile })).document.size, MAX_FILE_SIZE);
  }
  const beforeRejected = uploadCount;
  for (const rejected of [
    { fileName: 'too-large.pdf', dataUrl: `data:application/pdf;base64,${Buffer.alloc(MAX_FILE_SIZE + 1, 65).toString('base64')}` },
    { fileName: 'script.docx', dataUrl: 'data:text/html;base64,dGVzdA==' },
    { fileName: 'file.exe', dataUrl: 'data:application/octet-stream;base64,dGVzdA==' },
    { fileName: 'file.docm', dataUrl: 'data:application/vnd.ms-word.document.macroEnabled.12;base64,dGVzdA==' },
  ]) {
    await assert.rejects(store.addRetailPointDocument(owner, point.id, { file: rejected }), /10 МБ|Поддерживаются/);
  }
  assert.equal(uploadCount, beforeRejected, 'Rejected uploads must not reach Google Drive');
  const restored = new Store(dir).listRetailPoints(owner).find(p => p.id === point.id).documents;
  assert.equal(restored.length, 12);
  assert.equal(restored.at(-1).size, MAX_FILE_SIZE);
  assert.equal(restored.at(-1).mimeType, OFFICE_TYPES.xlsx);
});
