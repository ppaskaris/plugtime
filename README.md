# PlugTime

A personal, offline-first EV charging log for an installed iPhone PWA and desktop browsers. All session recording and calculations happen on the device using IndexedDB. Defaults are 9.6 kW and CAD $0.203/kWh, preserved separately on every session.

## Current milestone

The application uses an Ionic React iOS shell with Charging, History, Statistics and Settings tabs, dismissible session sheets, pull-to-sync, and queued notifications with Undo. It supports start/stop, manual corrections, unfinished history, estimates, local statistics, defaults and CSV/JSON export. The production shell and component chunks work offline after caching. Phase 2 adds a Cloudflare Worker, D1, owner-only Cloudflare Access, foreground synchronization and conflict review. The owner reported the real-iPhone offline acceptance walkthrough passed on 2026-10-17. Phase 3 adds reviewed JSON recovery and a reconciled historical migration.

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

Open the printed localhost URL online once and wait for **Works offline** in the charging card (or **Ready for offline use** in Settings). Keep the same origin and port when reopening. Remote iPhone access requires HTTPS; HTTP over a LAN address cannot prove PWA behavior.

To preview on another device on the same network, run `npm run dev -- --host 0.0.0.0` and use the printed Network URL. Session IDs use secure random bytes when `crypto.randomUUID` is unavailable on HTTP. This supports local recording in the preview; service-worker installation and offline startup still require a production build over HTTPS.

## Validation

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Tests use synthetic data, fake IndexedDB, and real local D1 through Miniflare. They cover interrupted uploads, stable retries, stale revisions, changes during upload, deletion/conflict handling, fresh-device recovery and signed JWT validation. The browser suite verifies offline behavior and confirms expired authentication does not block recording. The mobile UI migration is validated locally in Chromium at phone and desktop sizes. Nuanced Safari/installed-PWA touch, picker and VoiceOver feel still needs the owner’s final device evaluation; see [the iPhone procedure](docs/iphone-testing.md).

## Data and backups

The app saves locally before showing success. An active session survives closing the app because its timestamps are persisted. Repeated accidental starts/stops sync as cancellations without uploading obsolete starts ahead of them; existing queue-order conflicts are repaired on the next sync. Historical unfinished records do not automatically become live sessions. Duplicate starts and concurrent stale edits are rejected.

Changing defaults does not change existing estimates. Consumption and price assume continuous power and are estimates, not meter readings. Prices are calculated with integer units and exact cost accumulation, with rounding only when displayed. Statistics has Overview and By year segments. Years start collapsed and expand into populated months, then sessions, newest first. All periods use the device-local start date; empty months are omitted.

History groups sessions beneath month-and-year headings, skipping empty months,
with aligned date, time and estimate columns. Statistics rows expand from year to
populated months to individual completed sessions; monthly rows open the same
editable session list. A charge spanning months or years belongs entirely to its
starting month/year in the device timezone. Unfinished sessions remain in History
and are excluded from statistics.

Available app updates appear as a download button in the top toolbar and inline
in Settings → App updates. Installation waits until charging and editing finish.
Cancelling a never-sent active charge, including a sub-minute Stop, removes its
pending mutations immediately while retaining a local deletion marker for Undo
and import protection. Uploaded or uncertain changes retain cloud cleanup work.

Use **Cancel charge** to undo an accidental start directly from the Charging screen. Within the first minute it cancels immediately; after that it asks for confirmation. Stopping a charge under 60 seconds automatically discards it. Exactly 60 seconds counts. Completed manual entries and timestamp corrections must also be at least one minute. The recent card shows the newest charge by completion time for 12 hours and hides during an active charge. **Delete last charge** and the editor’s trash icon delete immediately with an eight-second **Undo** notification. Cancel and automatic short-charge discard also offer Undo: they resume the original charge at its original start time, or restore it as unfinished if another charge is active. Undo restores the same record with a new revision, including after upload; newer changes or unresolved conflicts block restoration and show an error. Discarded/deleted records are excluded from history, statistics and CSV, with deletion markers retained for future sync.

Export JSON in Settings → Data for the complete local dataset, assumptions, pending mutations and both sides of unresolved conflicts (schema version 2). CSV contains visible history and derived estimates. Both work offline. **Import JSON backup** reviews missing records before adding them, preserves local edits/deletions, retains pending uploads and conflicts, and prepares a pre-import download. See [migration and recovery](docs/importing.md) for safeguards and cloud reconciliation. Persistent browser storage and cloud synchronization do not replace independent exports.

The header account badge opens Account & sync over the current tab. The same section in Settings shows the last verified identity, connectivity, pending uploads, last successful sync and conflict review. Pull down at the top of any tab to sync and check for app updates, or use **Sync now** in Account & sync. Online connectivity alone does not mean synced. Use **Sign in with Cloudflare** to restore an expired cloud session, then **Sync now** to retry. Recording always uses IndexedDB first. Automatic foreground sync runs at most once per hour, including failed attempts. The limit persists across reloads and tabs; launch, resume, reconnection and local changes only trigger a run when due. An open, visible, online app also checks at the hourly boundary. Pull-to-refresh and **Sync now** bypass the cooldown, and a manual run starts a fresh cooldown. Fresh authenticated installations download the complete history and tombstones. Default settings remain device-local; each cloud session carries its historical assumptions.

Conflicting edits preserve this device’s version and the cloud version until you choose. Two conflicting active charges can both be kept by marking this device’s charge unfinished and restoring the cloud charge as active. Changing the hostname or port creates a separate browser data store: records from a LAN preview do not automatically migrate to the deployed HTTPS origin.

Original source material belongs in the ignored `reference/` directory. Generated migration reports and private scratch files belong in ignored `.local/`, and exports in ignored `exports/`. Never put personal history in `public/`, test fixtures or committed docs. Historical records were migrated additively after reconciliation; the original workbook and screenshot remain unchanged.

## Architecture and next steps

See [architecture, data model and phased implementation plan](docs/architecture.md). `src/domain.ts` owns calculations and time input validation, `src/db.ts` owns transactional persistence, and `src/exports.ts` owns export formats. React reads local data using Dexie live queries. Ionic owns the page/tab, sheet, refresher, segment and toast surfaces, plus standard Settings/sync/import buttons and the Settings number fields; Tailwind remains available for owned layouts without global preflight overriding Ionic. One root service owns foreground sync, connectivity and notification lifetimes across retained pages. Native date inputs open only on deliberate interaction. Close, Escape, backdrop taps and a downward sheet swipe drop drafts without a discard prompt. Save/checkmark and Delete/trash sit at the top right. Workbox caches only the public application shell. No analytics, paid dependencies, authentication framework or background infrastructure.

`worker/` implements the authenticated API and `migrations/` holds D1 SQL. `src/sync.ts` owns the foreground queue and conflict handling. `src/imports.ts` validates backups and commits reviewed additions. See [deployment guidance](docs/deployment.md) for local simulation, private account configuration, manual deployment and rollback. Automatic deployment is not enabled. Historical corrections and migration evidence remain in private local notes.

See [mobile implementation and validation](docs/mobile-ui-implementation.md) for pinned dependencies, bundle cost, local checks and remaining device limits. The [approved plan](docs/mobile-ui-revisions.md) and [library decision](docs/mobile-ui-library-decision.md) are retained.

The [Ionic adoption audit and completion plan](docs/ionic-adoption-audit.md) inventories every React component, maps remaining custom visual primitives to Ionic, and defines the application CSS to retain.

## GitHub

The public repository is [ppaskaris/plugtime](https://github.com/ppaskaris/plugtime), with `main` as the primary branch. Clone it with:

```sh
git clone https://github.com/ppaskaris/plugtime.git
```

Before pushing changes, review `git ls-files`: `reference/`, `.local/`, credentials and exports must not appear. No license has been selected yet.
