# Connection Troubleshooting

`/connection.html` is a small, self-contained diagnostic page. It fetches the
public application files sequentially without credentials or cached responses.
Each check reads the entire response body, with a 15-second deadline. HTTP 200
alone is not a successful check: a stalled/truncated body is reported as a failure.
It does not test database access or authenticated business operations. Results
remain in the browser; no telemetry or employee information is uploaded.

The entry page renders a small fallback before application assets load. Styles
are fetched with non-blocking media and enabled after loading. The application
stays hidden and inert until its handlers and styles are ready, preventing native
form submission during a failed script load. A slow asset reports its path after
15 seconds; a late successful response can still finish startup. Script errors
require a page reload, rather than re-executing partially initialized scripts.

API deadlines cover both headers and body (15 seconds for session lookup,
65 seconds otherwise). Writes are never retried automatically; a timeout cannot
prove whether the server committed the operation.

These measures prevent a silent blank page when resources stall. They cannot
repair a blocked DNS/TLS connection or guarantee availability on a specific ISP.
Collect the diagnostic results on the affected connection without a VPN before
changing DNS or hosting. Successful tests from another network are not proof of
availability on the affected ISP.

Inline startup styles and diagnostic script have explicit CSP hashes in
`lib/app.js`; `tests/startup.test.js` checks they match. Do not use `unsafe-inline`.

Verification: `npm test`, `npm run smoke`, then browser checks with stalled CSS,
failed JavaScript, a stalled API response body, and a normal authenticated session.

## Resilient Entry Point

`/stable.html` is an alternative entry point on the same origin, using the same
authentication, API and database. Normal `/` remains available. Links to this mode
are present in the normal loading fallback and the connection diagnostic page.

The entry contains a small inline loader. It downloads a gzip-compressed bundle
of the existing markup, styles and scripts in sequential parts of at most 6 KiB.
Each part has a pinned byte count and SHA-256 digest. Once that exact byte count
is received, the request is cancelled without waiting for HTTP EOF, then verified.
Missing/corrupt static parts can be retried up to three times; business writes
are never retried. There is a 12-second request deadline and a two-minute overall
download deadline. Nothing executes until all hashes and the bundle size pass.
In this mode, API JSON objects are also parsed incrementally and accepted only
once the complete JSON object validates, without waiting for a stalled HTTP EOF.
There are still no automatic retries of API calls, including writes.

After decompression, original scripts run in their original order. Startup uses
an explicit event, not DOMContentLoaded, which can itself wait on a stalled main
HTML response. Forms remain inert until initialization completes. CSP allows the
exact script/style hashes; neither eval nor unsafe-inline is required. An up-to-date
browser with DecompressionStream and Web Crypto is required.

When editing any frontend source, run `npm run build:client` and commit the generated
`public/stable.html`, `public/client-parts/*` and `lib/client-csp.json` alongside it.
The legacy Vercel static builder serves these committed artifacts. `npm test`
verifies that they match the source, including normalized line endings. The build
does not read `.env`, user records or any production data. Do not edit generated
files by hand. This mitigates incomplete transfers, but cannot guarantee service
through an ISP that blocks even the small entry point or API responses.
