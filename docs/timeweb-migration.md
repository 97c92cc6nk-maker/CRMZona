# Timeweb deployment

Production delivery moved from Vercel to Timeweb after the user verified the
temporary domain without a VPN on the affected ISP. Vercel remains the rollback
target. The application continues using the existing Supabase database.

## Application

- Repository: `97c92cc6nk-maker/CRMZona`, branch `main`.
- Framework: Dockerfile, project directory: repository root.
- Region: Moscow. Confirm the live panel price before ordering.
- Dockerfile exposes port 8080 and checks `/health/live` with Node.
- Leave Timeweb's healthcheck-path field empty so its generated probe does not
  replace the Dockerfile HEALTHCHECK. The platform override failed on this image;
  the Dockerfile probe passed on the deployed container.
- The official Node 24 Debian image installs Linux dependencies, including ffmpeg.
- Container runs as non-root. The build context excludes local secrets and data.
- A single allowlisted source copy and install/build step avoid unnecessary
  build-layer overhead. The deny-by-default `.dockerignore` is covered by tests.
- Secrets are supplied through private platform environment variables, never Git.
- Preserve production Supabase, SMTP, Google Drive and other integration settings.
- Do not copy Vercel system variables (`VERCEL*`) or local filesystem paths.
- Docker defaults: `CLIENT_DELIVERY=standard`, `SUPABASE_REQUIRED=true`.

Standard mode delivers the original application with gzip, explicit lengths and
ETag revalidation, without the fragment loader. API responses are not cached.
Required Supabase mode refuses startup without database credentials and returns
503 on a database failure instead of accepting temporary writes. Network failures
may leave a write outcome uncertain; check the saved data before repeating it.

## Verification and cutover

1. Wait for the build and `/health/live` (process only) to pass.
2. Check `/health/ready`: read-only database probe, no records returned or modified.
3. Check normal login, existing employee/point lists and report reads. Do not seed
   a new owner, import old JSON data, or run database migration scripts.
4. Verify outgoing SMTP and Google OAuth connectivity. Any notification or file
   upload test must use explicitly designated test recipients/documents.
5. Check optional AI integrations separately: provider availability can depend on
   the server region. Do not silently disable or reroute them.
6. Have the user test the temporary HTTPS domain without VPN on Istranet.
7. Attach `crmzona.net` and `www.crmzona.net`; record current DNS for rollback,
   then replace only their web records with the targets shown by Timeweb. Preserve
   mail records. Verify certificate issuance and both hostnames externally.
8. Recheck login, database and document reads on the final domain. Keep Vercel
   deployed until the user confirms stable access from the affected network.

A repository connected by public URL requires manual deployment of new commits
in Timeweb. Enable GitHub auto-deployment only with explicit authorization for
the requested repository permissions. Continue publishing commits to GitHub.

## Checks

`npm test` covers managed asset delivery, no-fragment entry, strict storage,
readiness/liveness separation and the existing business logic tests.
`npm run smoke` exercises the application against isolated local test data.
Build the image on Timeweb when Docker is unavailable on the workstation; a
passing local Node test does not itself verify the Linux image build.

## Production status (2026-09-27)

- Timeweb application: `260923`, CRMZona, Moscow MSK-1, approved 810 RUB/month.
- Test host: `97c92cc6nk-maker-crmzona-c6c2.twc1.net`.
- Initial staging deployment `afc51ba` became healthy at 16:08 Moscow time.
- Production deployment `00d0e65` started at 17:13 and became healthy at about
  17:14 Moscow time. Its Linux image built successfully on Timeweb.
- HTTPS certificate validation passed for both `crmzona.net` and `www.crmzona.net`.
  Their `/health/ready` endpoints returned 200 with database available.
- The main-domain login page rendered without browser warnings/errors. All eight
  primary assets downloaded completely with gzip via normal public DNS, without
  the fragment loader (0.22-6.49 seconds each from the test client).
- The complete automated test suite passed: 104 tests, zero failures.
- User confirmed the temporary site opens without VPN. Authenticated business
  data verification is still pending.
- Apex and `www` A records now point to `147.45.185.13` (TTL 60 seconds).
  Both were verified against the authoritative Vercel DNS server. Neither name
  has an AAAA record; public `www` HTTPS lookup returns no old Vercel route.
- Both names are attached to Timeweb alongside the technical host. The automatic
  domain redeploy at 16:29 failed after approximately 30 minutes, with multi-minute
  gaps between short Docker steps. After simplifying the Docker build, the
  deployment of `00d0e65` succeeded and both public domains passed HTTPS checks.
- Gmail API delivery was authorized and configured after SMTP connection timeouts.
  Only the `gmail.send` scope was granted, and Google Cloud reports the existing
  OAuth application as In production. Google accepted the diagnostic email.
- The request to open SMTP in ticket `12728715` was withdrawn at 18:54 Moscow:
  keep the existing network restrictions. See `docs/gmail-mail.md`.
- Gmail deployment `437582e` is Ready on Vercel with private Production variables
  (deployment `Aw6sK6CHB3hzBD8ueR2VLnApsnD7`). Timeweb saved the same configuration
  and started deployment at 18:48; the build succeeded at 18:48:47, but image
  activation was delayed. Timeweb's status page reported App Platform MSK-1
  degradation during the delay: https://timeweb.cloud/live . Support was informed
  in the existing ticket. The image finished pulling at 19:09:13, passed its
  healthcheck at 19:09:40 and deployment succeeded at 19:09:41 Moscow time.
- Timeweb now reports `437582e` as the running version. At 19:14 Moscow,
  `https://www.crmzona.net/health/ready` returned HTTP 200 with database available.
  Saved mail settings were rechecked: `MAIL_TRANSPORT=gmail-api`, sender
  `familycoex@gmail.com`, and Gmail credentials match the locally tested import.
  The diagnostic email was sent from the workstation, not the production
  container. Browser access to the server console failed, so a user-initiated
  recovery after activation is still needed to confirm production delivery.
  Do not reset a real user's password merely to test delivery.
- Other server-side integrations still require live verification; database
  readiness alone does not confirm those services.

### DNS before cutover

Vercel hosts the authoritative DNS. Before cutover its panel managed these records
(all TTL 60 seconds):

| Name | Type | Value |
| --- | --- | --- |
| apex | ALIAS | `6e9796f088d2a292.vercel-dns-017.com` |
| `*` | ALIAS | `cname.vercel-dns-017.com.` |
| apex | CAA | `0 issue "pki.goog"` |
| apex | CAA | `0 issue "sectigo.com"` |
| apex | CAA | `0 issue "letsencrypt.org"` |

Both apex and `www` remain attached to the Vercel `crm-zona` project; apex
redirects to `www` when routed to Vercel. Timeweb requests an A record pointing to `147.45.185.13`
before saving an external domain. Preserve the CAA records and the existing
Vercel deployment for rollback. Do not change registrar nameservers as part of
the web-record cutover.
