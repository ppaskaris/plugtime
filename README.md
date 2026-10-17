# PlugTime

A personal, offline-first EV charging log for an installed iPhone PWA and desktop browsers. All session recording and calculations happen on the device using IndexedDB. Defaults are 9.6 kW and CAD $0.203/kWh, preserved separately on every session.

## Current milestone

The application supports start/stop, manual corrections, incomplete history, deletion, estimates, local statistics, defaults and CSV/JSON export. The built shell works offline after caching. Phase 2 adds a Cloudflare Worker, D1, owner-only Cloudflare Access, foreground synchronization and conflict review. Historical migration and physical iPhone offline verification remain pending.

## Development

Use Node.js 22.12+ (Node 24 LTS recommended) and npm.

```sh
npm ci
npm run dev
```

There are no required environment variables for the local application. `npm run dev` serves on localhost and does not install the production service worker. Use a production build to test offline behavior:

```sh
npm run build
npm run preview
```

Open the printed localhost URL online once and wait for **Ready for offline use**. Keep the same origin and port when reopening. Remote iPhone access requires HTTPS; HTTP over a LAN address cannot prove PWA behavior.

To preview on another device on the same network, run `npm run dev -- --host 0.0.0.0` and use the printed Network URL. Session IDs use secure random bytes when `crypto.randomUUID` is unavailable on HTTP. This supports local recording in the preview; service-worker installation and offline startup still require a production build over HTTPS.

## Validation

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Tests use synthetic data, fake IndexedDB, and real local D1 through Miniflare. They cover interrupted uploads, stable retries, stale revisions, changes during upload, deletion/conflict handling, fresh-device recovery and signed JWT validation. The browser suite verifies offline behavior and confirms expired authentication does not block recording. Follow [the real iPhone procedure](docs/iphone-testing.md) before using this as the primary log.

## Data and backups

The app saves locally before showing success. An active session survives closing the app because its timestamps are persisted. Historical unfinished records do not automatically become live sessions. Duplicate starts and concurrent stale edits are rejected.

Changing defaults does not change existing estimates. Consumption and price assume continuous power and are estimates, not meter readings. Prices are calculated with integer units and exact cost accumulation, with rounding only when displayed. Monthly/yearly statistics use the device-local start date.

Use **Cancel charge** to undo an accidental start directly from the Charging screen. Within the first minute it cancels immediately; after that it asks for confirmation. Stopping a charge under 60 seconds automatically discards it. Exactly 60 seconds counts. Completed manual entries and timestamp corrections must also be at least one minute. **Delete last charge** removes the latest completed session directly from its card after confirmation. Discarded/deleted records are excluded from history, statistics and CSV, with deletion markers retained for future sync.

Export JSON in Statistics / Settings for the complete local dataset, assumptions, pending mutations and both sides of unresolved conflicts (schema version 2). CSV contains visible history and derived estimates. Both work offline. JSON restore/import is a later milestone; retain the original backup for migration. Persistent browser storage and cloud synchronization do not replace independent exports.

Cloud backup shows pending, syncing, authentication, network and conflict states. Use **Sign in with Cloudflare** to restore an expired cloud session, then **Sync now** to retry. Recording always uses IndexedDB first. Foreground sync runs on launch, resume, connectivity recovery and local changes. Fresh authenticated installations download the complete history and tombstones. Default settings remain device-local; each cloud session carries its historical assumptions.

Conflicting edits preserve this device’s version and the cloud version until you choose. Two conflicting active charges can both be kept by marking this device’s charge unfinished and restoring the cloud charge as active. Changing the hostname or port creates a separate browser data store: records from a LAN preview do not automatically migrate to the deployed HTTPS origin.

Original source material belongs in the ignored `reference/` directory. Generated migration reports and private scratch files belong in ignored `.local/`, and exports in ignored `exports/`. Never put personal history in `public/`, test fixtures or committed docs. The original workbook and screenshot have not been modified or imported.

## Architecture and next steps

See [architecture, data model and phased implementation plan](docs/architecture.md). `src/domain.ts` owns calculations and time input validation, `src/db.ts` owns transactional persistence, and `src/exports.ts` owns export formats. React reads local data using Dexie live queries. Workbox caches only the public application shell. No analytics, paid dependencies, authentication framework or background infrastructure.

`worker/` implements the authenticated API and `migrations/` holds D1 SQL. `src/sync.ts` owns the foreground queue and conflict handling. See [deployment guidance](docs/deployment.md) for local simulation, private account configuration, manual deployment and rollback. Automatic deployment is not enabled. Phase 3 migrates historical data with the owner-approved corrections kept in private local notes.

## GitHub

The public repository is [ppaskaris/plugtime](https://github.com/ppaskaris/plugtime), with `main` as the primary branch. Clone it with:

```sh
git clone https://github.com/ppaskaris/plugtime.git
```

Before pushing changes, review `git ls-files`: `reference/`, `.local/`, credentials and exports must not appear. No license has been selected yet.
