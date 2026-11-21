# Container deployment implementation plan

> Execute inline using the executing-plans and test-driven-development skills. The user approved the proposed two-container deployment with “改”.

**Goal:** Keep the existing Bash deployment interface while shipping the UI and verified Word/PDF runtimes in an nginx image, and report actual readiness and editor failures.

**Architecture:** Build `rfq-service` and `rfq-web` with a shared release label. The web container serves the complete Vite output and proxies API requests over `rfq-net`. Existing host nginx can terminate HTTPS and proxy to the loopback web port. Database and existing document volume remain external to both images.

**Tech stack:** Bash, Docker, Node 22, nginx, React/Vite, Node test runner.

## Constraints and decisions

- Reuse the current checkout, preserving the user's SQL, lockfile and logs; do not commit or deploy to a server.
- No Docker Compose dependency; keep `build/start/stop/restart/status/logs`.
- Keep backend port 48081, existing image default and `rfq-office-documents`; web defaults to loopback port 48080.
- Build frontend from source and verified `packages/craft-editors/site` assets, not checked-in `deploy/frontend-dist` or stale public copies.
- No Rust rebuild for the PDF HTML bootstrap fix; update its manifest hash and its Python generator together.
- Docker daemon is unavailable locally. Use executable Bash tests with a fake Docker boundary, production frontend build, and artifact checks; report that real container integration remains unverified.

## Tasks

- [x] 1. Add failing deployment tests: both images build, failed/mismatched images preserve running containers, real health gates startup, web participates in lifecycle, volumes persist.
- [x] 2. Add web Dockerfile, narrow build context, gzip generation, nginx API/static routing, readiness and full editor integrity checks.
- [x] 3. Update the Bash manager to build a shared release, preflight before replacement, start/check both containers, and manage both lifecycles.
- [x] 4. Add an HTTPS container proxy mode with a documented one-time migration; retain legacy static hosting explicitly.
- [x] 5. Add failing editor regressions, report PDF bootstrap failures, give cold resource loading 180 seconds with a distinct document-open deadline and phase-specific messages; keep source generator and manifest consistent.
- [x] 6. Run targeted tests, root suite and production build; review the complete diff and document deployment commands and verification limits.

## Review focus

Missing/old web images must not remove a working backend. A running container with an unhealthy app must fail startup. All API paths must retain their URI and auth headers. Fixed editor filenames must revalidate and missing static files must return 404, not SPA HTML. Host HTTPS must actually stop serving old static files after migration. Health checks must not download large WASM files every 30 seconds.

## Verification ledger

- Deployment regression: 9 executable Bash tests passed with fake Docker/curl boundaries; initial implementation failed 7 feature tests before changes. Git Bash requires an escalated subprocess on this Windows host.
- Editor bridge: 22 tests passed after observing failing PDF bootstrap and cold-load deadline regressions.
- Compression: integrity, gzip round-trip and corruption rejection test passed. Production build passed; all 31 editor files verified, both WebAssembly binaries validate. Gzip sizes: Word 35,344,866 bytes, PDF 23,343,914 bytes.
- Editor DOM suite: 25 tests passed.
- Complete frontend suite: 619 tests passed, 0 failed (315.8 seconds).
- Root `npm test` stops on the pre-existing ignored `.workbuddy` directory. Separate tool suite reports 2 pre-existing SQL fixture failures: `init.sql contains the complete MySQL demo records and Word originals` and `match migration preserves applied schema and defines the durable comparison queue`. Verified SQL matches the current HEAD; no SQL changes made here.
- Independent read-only review found no Critical/Important regressions. Real Docker/nginx integration remains unverified because the local Linux Docker engine is unavailable.
- Decision: automatic rollback after a failed new container and automatic rewriting of custom host nginx sites are outside this change; readiness fails visibly and existing custom HTTPS configurations require the documented one-time migration.
