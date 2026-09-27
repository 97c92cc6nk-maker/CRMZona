# Gmail delivery over HTTPS

Set private server environment variables on Timeweb and Vercel:

- `MAIL_TRANSPORT=gmail-api`
- `SMTP_FROM=familycoex@gmail.com`
- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`

Enable Gmail API in the existing Google Cloud project. Authorize only
`https://www.googleapis.com/auth/gmail.send`; no mailbox-reading permission is
needed. Keep Gmail credentials separate from the existing Google Drive token.

The local desktop-client helper is `scripts/gmail-oauth-local.js`. It uses a
loopback callback, random state, PKCE, a 15-minute deadline and an ignored
`work/gmail-oauth/gmail.env` output. Never commit or log that output. OAuth test
mode can expire refresh tokens; check the existing consent publishing status.

All registration, recovery and task emails use the shared transport. Gmail sends
are not automatically retried or silently redirected to SMTP after failure, as
an ambiguous response could otherwise cause duplicate messages. API errors do
not include credentials or Google response bodies. Existing SMTP configuration
is retained for explicit rollback (`MAIL_TRANSPORT=smtp` or unset).

Self-service password recovery only changes the password and revokes sessions
after confirmed email submission. A delivery failure returns 503, keeps the old
password/sessions and does not write the new password to a temporary outbox.
Mail acceptance is not proof of inbox delivery. A database failure after mail
acceptance can still require another recovery attempt.

Verification: `npm test`, `npm run smoke`, then a harmless diagnostic email to an
approved mailbox. Do not reset a production user's password as an automated test.

Sources:
- https://developers.google.com/workspace/gmail/api/guides/sending
- https://developers.google.com/identity/protocols/oauth2/native-app
