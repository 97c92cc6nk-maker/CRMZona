'use strict';

module.exports = (req, res) => {
  const smtp = {
    configured: Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT),
    hasHost: Boolean(process.env.SMTP_HOST),
    hasPort: Boolean(process.env.SMTP_PORT),
    hasUser: Boolean(process.env.SMTP_USER),
    hasPassword: Boolean(process.env.SMTP_PASS),
    from: process.env.SMTP_FROM || process.env.SMTP_USER || null,
  };

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({
    ok: true,
    runtime: 'vercel-function',
    smtp,
    at: new Date().toISOString(),
  }));
};
