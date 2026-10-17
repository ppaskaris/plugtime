# PlugTime

A personal, offline-first EV charging log for an installed iPhone PWA and desktop browsers. All session recording and calculations happen on the device using IndexedDB. Defaults are 9.6 kW and CAD $0.203/kWh, preserved separately on every session.

## Current milestone

The initial local application supports start/stop, manual entries and corrections, incomplete history, deletion, estimated energy/cost, local monthly/yearly statistics, configurable defaults and CSV/JSON export. The built application precaches its shell for offline startup. Cloud synchronization and historical import are planned next; the UI explicitly labels cloud backup as unconfigured. Real iPhone verification is still required before relying on it.

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

## Validation

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Unit tests use synthetic data and fake IndexedDB. The browser suite uses the built app to test precaching, recording offline, closing/reopening a page, correcting an overnight session, statistics, JSON download and DST input validation in America/Toronto. It does not prove iOS behavior. Follow [the real iPhone procedure](docs/iphone-testing.md) before using this as the primary log.

## Data and backups

The app saves locally before showing success. An active session survives closing the app because its timestamps are persisted. Historical unfinished records do not automatically become live sessions. Duplicate starts and concurrent stale edits are rejected.

Changing defaults does not change existing estimates. Consumption and price assume continuous power and are estimates, not meter readings. Prices are calculated with integer units and exact cost accumulation, with rounding only when displayed. Monthly/yearly statistics use the device-local start date.

Export JSON in Statistics / Settings for the complete local dataset, assumptions and pending mutations. CSV contains visible history and derived estimates. Both exports work offline. JSON restore/import is a later milestone; retain the original backup for migration. Persistent browser storage helps reduce eviction risk but is not a substitute for exports and the planned cloud copy.

Original source material belongs in the ignored `reference/` directory. Generated migration reports and private scratch files belong in ignored `.local/`, and exports in ignored `exports/`. Never put personal history in `public/`, test fixtures or committed docs. The original workbook and screenshot have not been modified or imported.

## Architecture and next steps

See [architecture, data model and phased implementation plan](docs/architecture.md). `src/domain.ts` owns calculations and time input validation, `src/db.ts` owns transactional persistence, and `src/exports.ts` owns export formats. React reads local data using Dexie live queries. Workbox caches only the public application shell. No analytics, paid dependencies, authentication framework or background infrastructure.

Phase 2 adds a Cloudflare Worker with Static Assets, D1 and Access-protected APIs. Phase 3 migrates historical data with reviewable reconciliation. [Deployment guidance](docs/deployment.md) records the required setup and repository connection. No cloud resources have been provisioned or deployment enabled.

## GitHub

The public repository is [ppaskaris/plugtime](https://github.com/ppaskaris/plugtime), with `main` as the primary branch. Clone it with:

```sh
git clone https://github.com/ppaskaris/plugtime.git
```

Before pushing changes, review `git ls-files`: `reference/`, `.local/`, credentials and exports must not appear. No license has been selected yet.
