# PlugTime architecture and implementation plan

Initial review: 2026-10-17. The first milestone is a working local PWA. Cloud provisioning, synchronization, and historical migration follow after offline verification.

## Requirements and boundaries

Single user, primarily an installed iPhone PWA in a garage without connectivity. React, TypeScript, Vite, Tailwind, vite-plugin-pwa/Workbox and Dexie. Default estimates use 9.6 kW and CAD 0.203/kWh; each session keeps its own assumptions. Payments, multiple vehicles, actual TOU schedules and automatic rate retrieval are outside scope. No paid resources or automatic production deployments.

## Local architecture

The UI reads IndexedDB. Start, stop, edits and deletions commit in a Dexie read/write transaction together with an outbox mutation. Only report a successful save after that transaction resolves. A single indexed active-session key prevents concurrent starts across tabs. Historical incomplete records use a separate `incomplete` state so they do not become a year-long live charging timer.

Session fields: UUID `id`, UTC ISO `startAt`, nullable `endAt`, `state` (`active`, `incomplete`, `completed`, `deleted`), `powerWatts`, `rateMicrosPerKwh` (millionths of CAD), `createdAt`, `updatedAt`, local `revision`, and last acknowledged `serverRevision`. Tombstones retain deletion history. Derived duration, energy and price are recalculated rather than persisted as competing truths. Sum unrounded rational cost numerators, then round for display; do not sum rounded session prices.

Outbox fields: UUID mutation ID, session ID, local revision and base server revision. Settings hold default watts and rate, separately from session snapshots. A later sync schema will add server acknowledgements and conflict snapshots without erasing pending local edits. JSON exports are versioned and include settings, all sessions (including tombstones) and pending mutations; CSV is a human-readable export of visible records.

Store UTC instants, display/edit device-local time. Require explicit end dates for manual sessions spanning midnight. Reject nonexistent or ambiguous local times instead of silently adjusting them; future import uses explicit America/Toronto conversion and reports DST ambiguity. Attribute a session to the month/year of its local start time, including cross-midnight sessions.

Workbox precaches the built shell, scripts, styles and icons. No fonts/CDNs at runtime. API and Access paths are excluded from navigation fallback and are never cached. Prompt for app updates and defer reload during a session or open editor. Request persistent browser storage from a user action; expose whether it was granted.

## Risks and mitigations

- **iOS storage:** installed web apps can request persistent storage, but device cleanup, clearing site data, uninstalling or failed writes can still lose local data. Catch all transaction errors, offer JSON export, and later add cloud recovery. Never describe local save as a cloud backup. Real iPhone force-quit/airplane-mode testing is a release gate. [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/).
- **Suspension:** store start/end timestamps rather than relying on timers or background execution. Recompute elapsed time on resume. Synchronize on launch, visibility/pageshow, online and manual retry only.
- **Caching/auth:** public app shell, protected same-origin `/api` and `/api/*`. No Access login page in Workbox caches. Treat 401/403, redirects and HTML login responses as authentication failures. A user-triggered top-level sign-in restores the cookie; no third-party-cookie dependency.
- **Device clocks/DST:** elapsed time is between instants, not clock-face subtraction. Invalid ordering is an actionable form error. Import reports spreadsheet-vs-instant differences, particularly at DST transitions.
- **Data privacy:** ignore the entire local reference directory and exports. Tests use synthetic sessions only. Personal history must never be bundled into static assets, committed or sent to telemetry.

## Cloud architecture, validated against official documentation

One Worker with Static Assets hosts `dist/`. Route `/api` and `/api/*` through the Worker first with `assets.run_worker_first`; keep SPA fallback for UI routes. D1 is bound only to the Worker. No ORM is needed. Separate development and production D1 bindings and migration application. [Static Assets routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/).

Access supports **Cloudflare as an identity provider**. Restrict the application policy to the owner's identity rather than everyone who has a Cloudflare account. Keep the shell public. Validate Access JWT signature, issuer, audience and expiry in the Worker using the documented `jose`/JWKS approach, and enforce the allowed identity. Protect or disable alternate workers.dev and preview entry points. Missing configuration fails closed. [Cloudflare identity provider](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/cloudflare/), [JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

Use Free plans only and verify the account's plan before provisioning. D1 Free has hard limits; do not upgrade automatically when exhausted. Static assets and a personal dataset fit this design in principle, but account setup and free-plan eligibility must be verified at deployment. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Static Assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).

### Synchronization protocol (Phase 2)

`GET /api/snapshot` downloads the complete small dataset, tombstones and server revisions. `POST /api/mutations` accepts a stable mutation ID, base server revision and validated session snapshot. Atomically deduplicate the mutation ID and compare-and-swap the server revision in D1. An applied retry returns its original acknowledgement. A stale revision returns 409 and the remote snapshot; retain the local version and present a choice. Explicit conflict resolution creates a new mutation based on the returned revision.

Snapshot pulls must never overwrite rows with pending mutations. Acknowledge only the exact outbox item sent, so edits made during an in-flight request remain pending. Serialize per-session mutations; recover an uncertain request by retrying its same ID. Keep remote tombstones indefinitely for this small dataset. Retry after network errors without clearing outbox items. Download on a new device only after authentication. Decide a cross-device active-session conflict explicitly; preserve both snapshots rather than discard one.

## Minimal project structure

```text
src/                  React UI, domain calculations, Dexie persistence, exports
public/               locally bundled icons and HTTP headers
tests/                synthetic calculation/persistence and browser tests
docs/                 architecture, manual tests, deployment guidance
worker/               Phase 2 authenticated API
migrations/           Phase 2 D1 SQL migrations
scripts/              Phase 3 local migration tools
reference/            ignored original workbook and screenshot
.local/               ignored handoff, migration reports and scratch work
```

## Concrete implementation phases

1. **Offline application:** scaffold and lock dependencies; implement atomic start/stop, timestamp correction, manual/incomplete sessions, deletion tombstones, local history, estimates, settings, statistics and local CSV/JSON export. Unit-test arithmetic and concurrency/persistence. Verify a production build's service worker with a desktop offline browser test, then execute the iPhone procedure. Cloud status must say it is unconfigured.
2. **Cloud infrastructure:** implement D1 migrations and revision/idempotency protocol with synthetic tests for retries, edits during upload, conflict resolution, deleted-row recovery and fresh-device download. Configure Access and validate unauthorized/expired access before private data is uploaded. Add foreground sync and visible pending/auth/conflict status. Keep deployment manual.
3. **Migration and polish:** implement a local XLSX-to-versioned-JSON migration with a dry-run report, repeatable IDs, Toronto timezone conversion, malformed/incomplete-row handling and cached-formula comparison. Preserve source evidence separately. Review reconciliation proposals before applying them. Confirm export/restore round trips, real iPhone offline behavior and the deployed free-tier setup.

## Decisions and prerequisites

No missing information blocks Phase 1. Use `main`, npm and a simple three-section UI. The public repository name is `plugtime` under the authenticated personal GitHub account; no license is inferred. GitHub CLI operations require network access in this environment. Later deployment needs a Cloudflare account/Free plan, hostname, Access team domain/application audience and allowed identity. Historical reconciliation requires explicit review; no source corrections are applied automatically.
