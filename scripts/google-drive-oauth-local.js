'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const clientPath = process.argv[2] || process.env.GOOGLE_OAUTH_CLIENT_PATH;
const outPath = process.argv[3] || process.env.GOOGLE_OAUTH_OUT_PATH || path.resolve(process.cwd(), 'vercel-google-oauth.env');
const statusPath = process.argv[4] || process.env.GOOGLE_OAUTH_STATUS_PATH || path.resolve(process.cwd(), 'google-drive-oauth-status.json');
let pendingAuthUrl = '';

if (!clientPath) {
  throw new Error('Usage: node scripts/google-drive-oauth-local.js <client_secret.json> [out.env] [status.json]');
}

function writeStatus(status) {
  fs.writeFileSync(statusPath, `${JSON.stringify({ ...status, at: new Date().toISOString() }, null, 2)}\n`, 'utf8');
}

function browserOpen(url) {
  const command = process.platform === 'win32'
    ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]];
  execFile(command[0], command[1], (error) => {
    if (error) {
      writeStatus({ status: 'open_failed', message: error.message, authUrl: url });
    }
  });
}

async function main() {
  const clientRaw = JSON.parse(fs.readFileSync(clientPath, 'utf8'));
  const client = clientRaw.installed || clientRaw.web;
  if (!client?.client_id || !client?.client_secret) {
    throw new Error('OAuth client JSON does not include client_id/client_secret.');
  }

  const redirectUri = 'http://localhost';
  const state = crypto.randomBytes(16).toString('hex');
  const authUrl = new URL(client.auth_uri || 'https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', client.client_id);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/drive');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);
  pendingAuthUrl = authUrl.toString();

  const code = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('OAuth timeout: Google did not return an authorization code in 10 minutes.'));
      server.close();
    }, 10 * 60 * 1000);

    const server = http.createServer((req, res) => {
      const requestUrl = new URL(req.url, redirectUri);
      const requestState = requestUrl.searchParams.get('state');
      const error = requestUrl.searchParams.get('error');
      const authCode = requestUrl.searchParams.get('code');

      if (requestState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('OAuth state mismatch.');
        clearTimeout(timeout);
        reject(new Error('OAuth state mismatch.'));
        server.close();
        return;
      }
      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`OAuth error: ${error}`);
        clearTimeout(timeout);
        reject(new Error(`OAuth error: ${error}`));
        server.close();
        return;
      }
      if (!authCode) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('OAuth code missing.');
        clearTimeout(timeout);
        reject(new Error('OAuth code missing.'));
        server.close();
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>Google Drive подключен</h1><p>Можно закрыть эту вкладку и вернуться в Codex.</p>');
      clearTimeout(timeout);
      resolve(authCode);
      server.close();
    });

    server.on('error', reject);
    server.listen(80, '127.0.0.1', () => {
      writeStatus({ status: 'waiting', message: 'Waiting for Google OAuth callback.', authUrl: pendingAuthUrl });
      browserOpen(pendingAuthUrl);
    });
  });

  writeStatus({ status: 'exchanging', message: 'Exchanging OAuth code for refresh token.' });
  const tokenResponse = await fetch(client.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: client.client_id,
      client_secret: client.client_secret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const tokenPayload = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenPayload.refresh_token) {
    throw new Error(tokenPayload.error_description || tokenPayload.error || 'Google did not return a refresh token.');
  }

  fs.writeFileSync(outPath, [
    `GOOGLE_DRIVE_CLIENT_ID=${client.client_id}`,
    `GOOGLE_DRIVE_CLIENT_SECRET=${client.client_secret}`,
    `GOOGLE_DRIVE_REFRESH_TOKEN=${tokenPayload.refresh_token}`,
    'GOOGLE_DRIVE_EXPENSES_FOLDER_NAME=Хозрасходы',
    '',
  ].join('\n'), 'utf8');

  writeStatus({ status: 'done', message: 'OAuth refresh token saved.', outPath });
}

main().catch((error) => {
  writeStatus({ status: 'failed', message: error.message, ...(pendingAuthUrl ? { authUrl: pendingAuthUrl } : {}) });
  process.exit(1);
});
