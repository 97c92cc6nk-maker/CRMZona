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
