# Deployment preparation

The public [GitHub repository](https://github.com/ppaskaris/plugtime) is connected as `origin`. No Cloudflare resources have been created by this milestone. Hosting remains manually controlled. The local application requires no environment variables, database or Access session.

## Phase 2 setup order

1. Verify the intended Cloudflare account is on Free plans for Workers/D1/Zero Trust. Do not enable a paid plan or automatic upgrades. Confirm availability and current limits in the dashboard.
2. Choose a stable HTTPS hostname. Browser storage and service-worker scope belong to an origin; moving hostnames later requires export/import or authenticated cloud recovery.
3. Add a Worker entry point, install a pinned Wrangler dev dependency, and add a `wrangler.jsonc` with Static Assets `directory: "./dist"`, `binding: "ASSETS"`, `not_found_handling: "single-page-application"` and `run_worker_first: ["/api", "/api/*"]`. Use the deployment day's supported compatibility date.
4. Add SQL migrations for sessions/revisions, tombstones and idempotent mutation receipts. Create separate development and production D1 databases/bindings. Apply/test migrations locally first, then explicitly to the selected remote environment. Do not bind local development to production data.
5. Configure Access on the API paths and Cloudflare as the identity provider with account membership restriction plus an owner-only identity policy. Verify the claimed identity format. Set Access issuer/team domain, audience and allowed identity as Worker configuration. They must not be `VITE_*` frontend settings. Tokens and private account configuration belong in ignored `.dev.vars`/Wrangler secrets, never committed examples.
6. Validate JWT signature, audience, issuer, expiry and owner identity before querying D1. Reject unauthorized requests and malformed inputs, require same-origin state-changing requests, and disable or protect alternate workers.dev/preview URLs. Do not cache API responses or redirect HTML in Workbox.
7. Run synthetic API and sync tests and unauthenticated probes. Deploy manually only after these pass. Upload private history only after authorization and conflict behavior have been verified.

Wrangler configuration, real environment examples and migration scripts will be added with the functioning Phase 2 backend, rather than include untested deployment commands now. Consult the official sources linked in [architecture.md](architecture.md) when implementing them.

## Connecting GitHub later

Once the public GitHub repository exists, Cloudflare Workers & Pages → select the Worker → Settings → Builds → connect the GitHub repository. Choose `main` and the npm build command. Keep automatic production deployments disabled during validation; manual Wrangler deployments remain the initial workflow. Do not connect deployment until the Worker, D1 environments and Access configuration are tested. Confirm the dashboard's current Git integration settings against [Cloudflare's GitHub integration documentation](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/).

Keep the public repository free of local source records, exported backups, deployment tokens, account IDs tied to private setup and personal configuration. GitHub CI can run the synthetic tests/build without access to personal data or cloud secrets.
