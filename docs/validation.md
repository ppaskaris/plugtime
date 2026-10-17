# Phase 1 and Phase 2 validation

Checked 2026-10-17 with Node 24.15.0 on Windows. Personal reference files were read locally and left unchanged; no historical data is bundled with the app.

- TypeScript check and production Vite build pass; Workbox generates a precache containing the application shell, scripts, styles and icons.
- 21 unit tests pass: estimates and rounding, absolute elapsed time across Toronto DST changes, timestamp validation, incomplete-history exclusion, concurrent starts, reopening IndexedDB, stale edits/stops, assumption preservation, historical completion, deletion tombstones, transaction rollback on failed outbox writes, complete local JSON serialization/CSV omission of deleted rows, secure UUID generation, and the minimum charge duration. Stops at 0 and 59,999 milliseconds are discarded, exactly 60 seconds is kept, reversed device-clock time leaves the charge active, and manual/corrected records under one minute are rejected.
- 4 Chromium browser tests pass at a 390 × 844 viewport with America/Toronto timezone. The production app starts offline, survives closing/reopening a page, stops offline, accepts an overnight correction, calculates statistics, and prepares a JSON download offline. Quick cancellation and sub-minute stops do not count after an offline relaunch. The last completed charge can be deleted directly after confirmation; dismissing confirmation keeps it. Invalid spring-forward and ambiguous fall-back form inputs are rejected.
- The offline recording browser test disables `crypto.randomUUID` throughout the workflow to reproduce its absence in Safari's LAN HTTP preview. Session and pending mutation IDs use `crypto.getRandomValues` in this case; no non-cryptographic randomness is used.
- Mobile light/dark screenshots were visually reviewed. Both retain visible controls, navigation and readable status text.
- Dependency installation reported zero known vulnerabilities.

## Phase 2 additions

- 35 unit/integration tests pass, including nine sync tests: ordered uploads, fresh-device recovery, interrupted acknowledgement replay, edits during upload, version conflicts, cloud/local resolution, deletion retention, expired auth, simultaneous runs, expired leases, unconfigured backends and active-session conflicts.
- Five server tests use Miniflare’s real local D1 and signed test JWTs. Concurrent identical requests produce one receipt; stale revisions and second active sessions fail atomically. Reused mutation IDs with changed payloads are rejected. Validation rejects malformed units/times/durations. JWT tests reject expired, wrong-audience, wrong-identity and forged tokens.
- All five Chromium browser tests pass. Expired cloud authentication leaves recording, relaunch and JSON export available.
- Frontend/Worker TypeScript checks, production PWA build, local/remote migrations and deployment dry run pass. Production deployed manually to the owner’s confirmed Free account. Shell, manifest and service worker return 200 publicly; `/api`, `/api/config`, `/api/snapshot` and `/api/mutations` redirect unauthenticated traffic to Access. The owner confirmed successful production sign-in and synchronization.
- Private identifiers, allowed identity, references and reconciliation notes remain in ignored `.local/`/`reference/`. Tests use synthetic data only.

Not verified yet: physical iPhone installation/force-quit/storage behavior, actual saved export contents on an iPhone, JSON restoration, XLSX migration and real two-device end-to-end synchronization. See [the iPhone checklist](iphone-testing.md) and [phased plan](architecture.md).
