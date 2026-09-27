# Timeweb deployment

This is a staged migration away from the Vercel delivery network. Do not change
production DNS until the new test domain has been verified without a VPN on the
affected ISP. Vercel remains the rollback target. No database import is needed.

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

## Staging status (2026-09-27)

- Timeweb application: `260923`, CRMZona, Moscow MSK-1, approved 810 RUB/month.
- Test host: `97c92cc6nk-maker-crmzona-c6c2.twc1.net`.
- Deployment `afc51ba` became healthy at 16:08 Moscow time.
- Public HTTPS `/health/ready` returned 200 with database available.
- Login page rendered without browser warnings/errors. All eight primary assets
  downloaded completely with gzip (0.26-0.65 seconds each from the test client).
- User confirmed the temporary site opens without VPN. Authenticated business
  data verification is still pending.
- Apex and `www` A records now point to `147.45.185.13` (TTL 60 seconds).
  Both were verified against the authoritative Vercel DNS server. Neither name
  has an AAAA record; public `www` HTTPS lookup returns no old Vercel route.
- Both names are attached to Timeweb alongside the technical host. Saving the
  domain list triggered a redeploy at 16:29 Moscow time; TLS verification pending.
- SMTP request `12728715` is pending: only outgoing smtp.gmail.com TCP 465 was
  authorized. Do not approve a broader unblock without user confirmation.

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
