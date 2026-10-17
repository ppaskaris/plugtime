# Initial milestone validation

Checked 2026-10-17 with Node 24.15.0 on Windows. Personal reference files were read locally and left unchanged; no historical data is bundled with the app.

- TypeScript check and production Vite build pass; Workbox generates a precache containing the application shell, scripts, styles and icons.
- 14 unit tests pass: estimates and rounding, absolute elapsed time across Toronto DST changes, timestamp validation, incomplete-history exclusion, concurrent starts, reopening IndexedDB, stale edits/stops, assumption preservation, historical completion, deletion tombstones, transaction rollback on failed outbox writes, and complete local JSON serialization/CSV omission of deleted rows.
- 2 Chromium browser tests pass at a 390 × 844 viewport with America/Toronto timezone. The production app starts offline, survives closing/reopening a page, stops offline, accepts an overnight correction, calculates statistics, and prepares a JSON download offline. Invalid spring-forward and ambiguous fall-back form inputs are rejected.
- Mobile light/dark screenshots were visually reviewed. Both retain visible controls, navigation and readable status text.
- Dependency installation reported zero known vulnerabilities.

Not verified yet: a physical iPhone installation, iOS force-quit/storage behavior, actual saved export contents on an iPhone, JSON restoration, XLSX migration, cloud authentication/synchronization, two-device convergence, and deployed Cloudflare free-plan configuration. See [the iPhone checklist](iphone-testing.md) and [phased plan](architecture.md).
