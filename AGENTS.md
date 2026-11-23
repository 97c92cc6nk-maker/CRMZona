# CRMZona Project Instructions

## Publication Policy

- The user has given standing approval to publish completed project changes immediately.
- After implementation and relevant tests, commit the scoped changes and push to
  `97c92cc6nk-maker/CRMZona`, branch `main`.
- Deploy the resulting commit to the existing Timeweb application `260923` for
  `https://www.crmzona.net/`. Do not ask whether to deploy or wait for a separate
  deployment request. A GitHub push or Vercel deployment alone is not completion.
- Keep the existing Vercel deployment workflow as a secondary target; Timeweb is
  the primary production host. See `docs/timeweb-migration.md` for deployment details.
- Verify Timeweb has activated the intended commit and check `/health/ready`.
  Report a successful publication only after verification.
- If authentication expires, report the access blocker and request only the
  necessary sign-in, never another approval to deploy. Do not bypass authentication,
  broaden permissions, change billing, or expose secrets to avoid the blocker.
- Preserve production data and integration settings. Never commit credentials,
  employee documents, private financial source files, or local database copies.

This standing preference was explicitly reaffirmed by the user on 2026-11-23.
