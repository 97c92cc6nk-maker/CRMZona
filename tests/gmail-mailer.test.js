'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sendGmailMessage } = require('../lib/gmail-mailer');
process.env.MAIL_TRANSPORT = '';
process.env.SMTP_HOST = '';
process.env.SMTP_PORT = '';
const { Store, createRequestHandler, verifyPassword } = require('../lib/app');
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
const config = (id) => ({ GMAIL_CLIENT_ID: id, GMAIL_CLIENT_SECRET: 'test-secret', GMAIL_REFRESH_TOKEN: 'test-refresh' });

test('Gmail sends MIME over HTTPS, caches tokens and respects credential rotation', async (t) => {
  const calls = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return reply(url.endsWith('/token') ? { access_token: 'test-access', expires_in: 3600 } : { id: 'mail-id' });
  });
  const mime = 'From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\n\r\nHello';
  assert.equal((await sendGmailMessage(mime, config('client-a'))).status, 'sent');
  await sendGmailMessage(mime, config('client-a'));
  assert.equal(calls.filter(c => c.url.endsWith('/token')).length, 1);
  const send = calls.find(c => c.url.endsWith('/send'));
  assert.equal(send.url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
  assert.equal(Buffer.from(JSON.parse(send.options.body).raw, 'base64url').toString(), mime);
  assert.equal(send.options.headers.Authorization, 'Bearer test-access');
  await sendGmailMessage(mime, { ...config('client-a'), GMAIL_REFRESH_TOKEN: 'rotated' });
  assert.equal(calls.filter(c => c.url.endsWith('/token')).length, 2);
});

test('Gmail errors are explicit, redact remote details and never silently fall back or retry', async (t) => {
  let sends = 0;
  t.mock.method(global, 'fetch', async (url) => {
    if (url.endsWith('/token')) return reply({ access_token: 'test-access' });
    sends++;
    return reply({ error: { message: 'secret-should-not-leak', details: [{ reason: 'SERVICE_DISABLED' }] } }, 403);
  });
  await assert.rejects(sendGmailMessage('test', config('client-disabled')), /не включён/);
  assert.equal(sends, 1);
  await assert.rejects(sendGmailMessage('test', {}), /не настроен/);
});

test('Gmail OAuth denial and timeouts are reported without token contents', async (t) => {
  t.mock.method(global, 'fetch', async () => reply({ error: 'invalid_grant', error_description: 'secret-value' }, 400));
  await assert.rejects(sendGmailMessage('test', config('client-denied')), /повторно разрешить/);
  global.fetch = async () => { throw new DOMException('secret-value', 'TimeoutError'); };
  await assert.rejects(sendGmailMessage('test', config('client-timeout')), /таймаут oauth/);
});

test('failed recovery keeps the password and sessions; confirmed Gmail delivery updates both', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crmzona-mail-test-'));
  const store = new Store(dataDir);
  const user = store.createUser({ fullName: 'Mail Test', phone: '+79991112233', email: 'mail-test@example.com', password: 'OldPassword123' });
  const sid = store.createSession(user.id);
  const server = http.createServer(createRequestHandler(store));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const originalFetch = global.fetch;
  const env = { ...process.env };
  t.after(() => { process.env = env; });
  Object.assign(process.env, config('client-recovery'), { MAIL_TRANSPORT: 'gmail-api' });
  let deliveredMime = '';
  let fail = true;
  t.mock.method(global, 'fetch', async (url, options) => {
    if (String(url).startsWith('http://127.0.0.1:')) return originalFetch(url, options);
    if (url.endsWith('/token')) return reply({ access_token: 'test-access' });
    if (fail) return reply({ error: { message: 'Mail service down' } }, 503);
    deliveredMime = Buffer.from(JSON.parse(options.body).raw, 'base64url').toString();
    return reply({ id: 'recovery-id' });
  });
  const reset = () => fetch(`http://127.0.0.1:${server.address().port}/api/forgot-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email }),
  });
  const failed = await reset();
  assert.equal(failed.status, 503);
  assert.match((await failed.json()).error, /Пароль не изменён/);
  assert.equal(verifyPassword('OldPassword123', store.getUserById(user.id).password), true);
  assert.ok(store.getSession(sid));
  assert.equal(fs.readdirSync(path.join(dataDir, 'outbox')).length, 0);
  fail = false;
  const success = await reset();
  assert.equal(success.status, 200);
  assert.equal((await success.json()).emailDelivery.status, 'sent');
  const password = deliveredMime.match(/Пароль: ([^\r\n]+)/)[1];
  assert.equal(verifyPassword(password, store.getUserById(user.id).password), true);
  assert.equal(verifyPassword('OldPassword123', store.getUserById(user.id).password), false);
  assert.equal(store.getSession(sid), null);
});
