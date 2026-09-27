# Connection Troubleshooting

`/connection.html` is a small, generated, self-contained diagnostic page. It checks
the current entry page and actual public application parts without credentials.
The route selector compares server delivery (default) with static CDN delivery.
Each check reads the expected byte count with a 15-second deadline; parts must
also pass SHA-256 validation. A stalled HTTP EOF does not prevent success.
HTTP 200 alone is not a successful check. The last startup failure is shown from
tab-local sessionStorage with its timestamp, completed parts and byte counts.
It does not test database access or authenticated business operations. Results
remain in the browser; no telemetry or employee information is uploaded.

The legacy source page (`public/index.html`) renders a small fallback before application assets load. Styles
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

`/`, `/index.html` and `/stable.html` all serve the resilient entry point, using
the same authentication, API and database. Both Vercel routes and the local Node
server map these addresses to `public/stable.html`. The main address no longer
requests `/styles.css` or the other large assets individually. `public/index.html`
remains the build's markup source; do not replace it with the generated shell.
The connection diagnostic tests this delivery path, not obsolete large assets.

The entry contains a small inline loader. It downloads a gzip-compressed bundle
of the existing markup, styles and scripts in parts of at most 6 KiB, with at most
two requests in flight. The entry is bounded to 12 KiB raw and 6 KiB compressed.
Each part has a pinned byte count and SHA-256 digest. Once that exact byte count
is received, the request is cancelled without waiting for HTTP EOF, then verified.
Missing/corrupt static parts can be retried up to three times; business writes
are never retried. After the first static failure, the loader tries the same
public bytes through `/api/client-part` in slices of at most 2 KiB, verifying the
full original part hash before execution or caching. A successful route is
remembered for this tab/bundle. If the API-first route fails, CDN is tried too.
Each network request has a 12-second deadline. There is no fixed global
deadline that discards slow but successful progress; the finite manifest and
three-attempt limit still bound download time. Verified public parts are saved in
tab-local sessionStorage, keyed by the bundle hash, and reverified on reload.
Private data and API responses are never stored there. Storage being unavailable
does not prevent loading. Failed startup cancels other in-flight requests and
keeps forms inert. Nothing executes until all hashes and the bundle size pass.
In this mode, API JSON objects are also parsed incrementally and accepted only
once the complete JSON object validates, without waiting for a stalled HTTP EOF.
There are still no automatic retries of API calls, including writes.

After decompression, original scripts run in their original order. Startup uses
an explicit event, not DOMContentLoaded, which can itself wait on a stalled main
HTML response. Forms remain inert until initialization completes. CSP allows the
exact script/style hashes; neither eval nor unsafe-inline is required. An up-to-date
browser with DecompressionStream and Web Crypto is required.

When editing any frontend source, run `npm run build:client` and commit the generated
`public/stable.html`, `public/connection.html`, `public/client-parts/*` and
`lib/client-csp.json` and `lib/client-delivery.json` alongside it. Edit diagnostics in `client/connection.html`;
its manifest, entry size and CSP hashes are generated with the rest of the client.
The legacy Vercel static builder serves these committed artifacts. `npm test`
verifies that they match the source, including normalized line endings. The build
does not read `.env`, user records or any production data. Do not edit generated
files by hand. This mitigates incomplete transfers, but cannot guarantee service
through an ISP that blocks even the small entry point or API responses.

The standalone `api/client-part.js` does not import the application, initialize
Supabase or read environment credentials. It serves only generated, allowlisted
public byte strings. Filenames and aligned offsets are validated; arbitrary
filesystem paths, unknown parts and write methods are rejected. Each successful
response sets an explicit Content-Length and no-store/no-transform. Production
routes must keep it ahead of the general `/api/(.*)` handler. This is an alternate
Vercel delivery path, not a separate host or a guaranteed bypass of ISP blocking.
