'use strict';

let cachedToken;

async function googleJson(url, options, stage) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
    const payload = await response.json();
    if (!response.ok) {
      const disabled = payload.error?.details?.some((detail) => detail.reason === 'SERVICE_DISABLED');
      const reason = disabled ? 'Gmail API не включён в Google Cloud.'
        : stage === 'oauth' && payload.error === 'invalid_grant' ? 'Нужно повторно разрешить отправку писем в Google.'
          : `Gmail API: ошибка ${stage}, HTTP ${response.status}.`;
      throw new Error(reason);
    }
    return payload;
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new Error(`Gmail API: таймаут ${stage}. Доставка не подтверждена.`);
    }
    if (error instanceof TypeError || error instanceof SyntaxError) {
      throw new Error(`Gmail API: недоступен ответ ${stage}. Доставка не подтверждена.`);
    }
    throw error;
  }
}

async function sendGmailMessage(message, env = process.env) {
  const { GMAIL_CLIENT_ID: clientId, GMAIL_CLIENT_SECRET: clientSecret, GMAIL_REFRESH_TOKEN: refreshToken } = env;
  if (!clientId || !clientSecret || !refreshToken) throw new Error('Gmail API не настроен: отсутствует OAuth-разрешение отправки.');
  // The cache is bound to the complete configuration so rotating credentials takes effect immediately.
  if (!cachedToken || cachedToken.clientId !== clientId || cachedToken.clientSecret !== clientSecret
    || cachedToken.refreshToken !== refreshToken || cachedToken.expiresAt <= Date.now()) {
    const token = await googleJson('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret,
        refresh_token: refreshToken, grant_type: 'refresh_token' }),
    }, 'oauth');
    if (!token.access_token) throw new Error('Gmail API: Google не вернул токен отправки.');
    cachedToken = { clientId, clientSecret, refreshToken, accessToken: token.access_token,
      expiresAt: Date.now() + Math.max(0, (Number(token.expires_in) || 3600) - 60) * 1000 };
  }
  // Do not retry a send automatically: a lost HTTP response can still mean the message was delivered.
  const sent = await googleJson('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', headers: { Authorization: `Bearer ${cachedToken.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: Buffer.from(message, 'utf8').toString('base64url') }),
  }, 'send');
  if (!sent.id) throw new Error('Gmail API: доставка письма не подтверждена.');
  return { status: 'sent', sourceUnavailable: false, transport: 'gmail-api', messageId: sent.id };
}

module.exports = { sendGmailMessage };
