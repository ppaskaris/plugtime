# Manual Cloudflare deployment

Phase 2 uses Workers with Static Assets, D1 and Cloudflare Access. The owner confirmed Workers and Zero Trust Free plans on 2026-10-17. Separate development and production D1 databases are provisioned and migrated. Production is deployed manually; no Git-triggered deployment or paid feature has been enabled. Historical source files have not been uploaded by the agent.

## Local development and tests

```sh
npm ci
npm run cf:types
npm run cf:migrate:local
npm run build
npm run cf:local
```

`cf:local` serves the production shell and Worker on localhost using local D1. The public `wrangler.jsonc` contains deliberate placeholder database IDs and empty Access values. The API fails closed when these are missing; the offline application still works. `.dev.vars.example` documents the server-side variables. There is no local authentication bypass. Tests use a local signing key and Miniflare to validate JWT rules and D1 independently.

## Account configuration

Create the Workers hostname and enable Zero Trust on Free plans first. Configure Cloudflare as the identity provider with account membership restriction. Create two self-hosted Access applications, one for each environment’s `<hostname>/api` path, including its subpaths. Restrict each policy to the exact owner email and the Cloudflare login method. Keep the app shell public. Disable preview URLs; server JWT validation remains mandatory for any alternate entry point.

The Worker validates JWT signature, issuer, audience, expiry and owner email before database access. API writes require the app’s Origin; JSON bodies have a 16 KiB limit. API responses use no-store. `/api/login` redirects to the app only after authentication. `/api/config` returns only an enabled flag and is Access-protected on the deployed host.

Private identifiers belong in ignored `.local/cloudflare.json`:

```json
{
  "accountId": "your-account-id",
  "teamDomain": "https://your-team.cloudflareaccess.com",
  "allowedEmail": "you@example.com",
  "developmentDatabaseId": "your-development-database-id",
  "productionDatabaseId": "your-production-database-id",
  "developmentAudience": "your-development-access-audience",
  "productionAudience": "your-production-access-audience"
}
```

`npm run cf:configure` creates ignored `.local/wrangler.jsonc` with the correct paths and separate bindings. Tokens stay in Wrangler’s credential storage; the file above contains deployment settings only. Never commit these private files or expose server variables through `VITE_*`. This installation’s identifiers and rollout notes are under `.local/`.

## Production commands

```sh
npm run cf:configure
npm test
npm run build
npm run test:browser
npm run cf:check
npm run cf:migrate:production
npm run cf:deploy
```

`cf:check` bundles without deploying. Production migrations/deployment explicitly target production. For development-cloud operations use `--config .local/wrangler.jsonc --env ''`; do not use `--remote` during ordinary local development. Do not enable paid plans or automatic upgrades. Check Free quotas before expanding usage.

Before uploading personal records, verify shell/manifest/service worker return 200 publicly, API paths redirect to Access, the intended identity can synchronize, and unauthorized identities are denied. Login HTML must not be treated as JSON success. Recheck the iPhone procedure on HTTPS. Localhost, LAN and deployed HTTPS origins have separate browser stores; moving to production does not automatically move preview records.

## Recovery and rollback

Use `npx wrangler versions list --config .local/wrangler.jsonc --env production` and `npx wrangler rollback <version-id> --config .local/wrangler.jsonc --env production` after reviewing version compatibility. Worker rollback does not undo D1 migrations. Preserve D1 and mutation receipts; never delete a database to repair sync. Retain independent JSON exports and, before destructive schema changes, a D1 export in ignored `exports/`.

Sync uses a persistent two-minute lease to avoid simultaneous uploads across views. If a tab is terminated mid-sync, its successor retries when the lease expires. Each API request has a 15-second timeout, and its exact persisted envelope is replayed after uncertain outcomes. No iOS background execution is required.

## GitHub integration

Source lives on GitHub; deployment stays manual until real-device checks pass. If enabling Cloudflare Builds later, connect the repository, select `main`, use the npm build command and explicitly set production database/Access settings. Preserve the private settings workflow or configure equivalent CI secrets. Consult [Cloudflare’s GitHub integration documentation](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/) before enabling automatic deployment.
