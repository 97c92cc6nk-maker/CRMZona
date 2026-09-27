'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');

const clientPath = process.argv[2];
const outputDir = path.resolve(process.argv[3] || 'work/gmail-oauth');
const scope = 'https://www.googleapis.com/auth/gmail.send';
fs.mkdirSync(outputDir, { recursive: true });
const statusPath = path.join(outputDir, 'status.json');
const status = (value) => fs.writeFileSync(statusPath, JSON.stringify(value, null, 2), { mode: 0o600 });

async function main() {
  const client = JSON.parse(fs.readFileSync(clientPath, 'utf8')).installed;
  if (!client?.client_id || !client.client_secret) throw new Error('A desktop OAuth client is required.');
  const state = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(48).toString('base64url');
  let redirectUri;
  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, redirectUri);
      if (url.pathname !== '/' || url.searchParams.get('state') !== state) {
        res.writeHead(400).end('Invalid OAuth callback.');
        return;
      }
      clearTimeout(timer);
      server.close();
      if (url.searchParams.has('error') || !url.searchParams.get('code')) {
        res.writeHead(400).end('Authorization was not completed.');
        reject(new Error('Google authorization was not completed.'));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('Authorization received. Return to Codex to finish connecting Gmail.');
      resolve(url.searchParams.get('code'));
    });
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('Authorization expired after 15 minutes.'));
    }, 15 * 60 * 1000);
    server.on('error', (error) => { clearTimeout(timer); reject(error); });
    server.listen(0, '127.0.0.1', () => {
      redirectUri = `http://127.0.0.1:${server.address().port}/`;
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.search = new URLSearchParams({
        client_id: client.client_id, redirect_uri: redirectUri, response_type: 'code',
        scope, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false',
        login_hint: 'familycoex@gmail.com', state,
        code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
      }).toString();
      status({ status: 'waiting', authUrl: authUrl.toString() });
      console.log('Waiting for Google authorization; URL saved in work/gmail-oauth/status.json.');
    });
  });
  status({ status: 'exchanging' });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: client.client_id, client_secret: client.client_secret,
      redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.refresh_token) throw new Error(`Google token exchange failed (HTTP ${response.status}).`);
  if (payload.scope && !payload.scope.split(' ').includes(scope)) throw new Error('Gmail send permission was not granted.');
  fs.writeFileSync(path.join(outputDir, 'gmail.env'), [
    'MAIL_TRANSPORT=gmail-api', 'SMTP_FROM=familycoex@gmail.com',
    `GMAIL_CLIENT_ID=${client.client_id}`, `GMAIL_CLIENT_SECRET=${client.client_secret}`,
    `GMAIL_REFRESH_TOKEN=${payload.refresh_token}`, '',
  ].join('\n'), { mode: 0o600 });
  status({ status: 'done', scopes: payload.scope || scope });
  console.log('Gmail authorization saved. No credentials printed.');
}

main().catch((error) => {
  status({ status: 'failed', message: error.message });
  console.error(error.message);
  process.exitCode = 1;
});
