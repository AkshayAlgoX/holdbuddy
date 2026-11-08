# Public boundary and resource policy

Only the public Node gateway listens on the advertised port. The existing call orchestrator and simulator are connected through typed, in-process ports. No local runtime HTTP server, simulator HTTP server, source bearer, paid provider client, developer HTML, Vite dev server, recording loader, diagnostic controller or evaluator is built into the public service.

Each browser tab obtains a random 256-bit capability using POST `/api/bootstrap`. It is stored in sessionStorage, scoped to that tab, expires after 30 minutes, and authorizes only that visitor's single fictional call. Another capability cannot read its state or events, fetch its audio or issue any command. Possession of that capability grants access to that fictional call, so it is never placed in URLs or logs. It is unrelated to a provider key. A closed tab leaves at most a three-minute fictional call; idle visitor state is retired after five minutes.

Public routes are explicitly enumerated:

- GET `/`, `/index.html`, and exact files created in `dist/public/assets/`.
- GET `/healthz`: one boolean, no inventory or diagnostic details.
- POST `/api/bootstrap`, GET `/api/connection`, GET `/api/v1/health`.
- POST `/api/v1/sessions`: one of six allowlisted scenarios (five preserved scenarios plus the shared three-objective Hindi line), goal up to 300 characters, Hindi or English.
- GET `/api/v1/sessions/:owned-id`, GET `…/events` with bounded replay.
- POST `…/stop`, `…/takeover`, `…/human-decision`, `…/clarification` with explicit JSON schemas.
- GET `/judge-audio/v1/sessions/:owned-id/prompts/:played-prompt/fragments/0`: new synthetic audio from that call only.

Everything else returns 404, including `.git`, `.env`, source and package paths, filesystem traversal, sourcemaps, developer pages, metrics, reconciliation, audio upload, source-start injection and simulator administration. Only necessary event fields are projected to the browser. Filesystem paths, hashes, request budgets, simulator identities/revisions, receipt identifiers and raw errors are not returned. Serving browser JavaScript cannot prevent a visitor opening their own browser's built-in developer tools; the protected boundary is the application's tools and private interfaces.

The exact configured Host and Origin are checked; cross-site Fetch Metadata is rejected. No CORS permission is returned. Token-bearing JSON/SSE/audio responses are no-store. CSP restricts connections, scripts and fonts to the same origin, permits audio blobs and denies embedding. Microphone, camera, location and payment APIs are disabled. No user microphone or real phone call is involved.

Limits per instance: 8 active/reserved calls; 128 visitor records; 12 call starts per visitor lifetime; 30 bootstrap requests and 30 call starts globally per minute; 180 API requests per visitor per minute; 2,000 non-health requests globally per minute; 128 TCP connections; 2 SSE streams per call; 2 KB JSON bodies; 8 KB request headers; 15-second body deadline; 256 buffered call events; 2 queued audio segments; 180-second call duration; 45-second source-silence deadline; 5-second STT deadline. Large static/audio responses also have global 512 MB/hour and 2 GB/day byte budgets, with 12 MB audio per call and four fetches per played clip. Budgets are in memory and reset on restart; small denial responses and provider-level HTTP overhead are not a hard account billing cap. Stalled SSE consumers are disconnected instead of accumulating buffers. Unknown delivery is not retried. A new call is refused until the previous simulator stop is confirmed.

The global admission caps are intentional for a small competition demo. They limit damage but are not a bot identity system or hard billing cap. No client-supplied forwarded IP is trusted. Shared-NAT visitors can use separate capabilities. Large attacks may temporarily deny admission; Render's edge DDoS protection and operator monitoring remain relevant. Horizontal scaling requires a separate session design and is outside this demo package.

No analytics, persistent visitor log, request-body log, database or file upload is enabled. Fixed error responses reveal no stack, request content or provider response. Temporary files contain only the new public synthetic audio and are removed after recognition/termination; a read-only container and a 32 MB tmpfs were used for verification. Provider account secrets are neither required nor read.
