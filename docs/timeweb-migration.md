# Timeweb deployment

This is a staged migration away from the Vercel delivery network. Do not change
production DNS until the new test domain has been verified without a VPN on the
affected ISP. Vercel remains the rollback target. No database import is needed.

## Application

- Repository: `97c92cc6nk-maker/CRMZona`, branch `main`.
- Framework: Dockerfile, project directory: repository root.
- Region: Moscow. Confirm the live panel price before ordering.
- Dockerfile exposes port 8080; healthcheck path: `/health/live`.
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
