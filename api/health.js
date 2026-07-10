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
  const supabase = {
    configured: Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY)),
    hasUrl: Boolean(process.env.SUPABASE_URL),
    hasServiceKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY),
    url: process.env.SUPABASE_URL || null,
  };

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({
    ok: true,
    runtime: 'vercel-function',
    smtp,
    supabase,
    at: new Date().toISOString(),
  }));
};
