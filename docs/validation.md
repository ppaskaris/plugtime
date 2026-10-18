# PlugTime validation

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

## Owner-reported iPhone acceptance test — 2026-10-17

The owner reported that all cases in the step-by-step iPhone checklist supplied in this chat passed on the deployed HTTPS app: Home Screen installation, offline startup, accidental-start cancellation/discard, suspension and force-close recovery, offline completion and relaunch, timestamp corrections/overnight entries, unfinished records, saving offline exports, reconnection/sign-in/synchronization, desktop verification and test-record cleanup.

The owner also created two overlapping charge sessions offline, encountered a sync conflict and resolved it by selecting the cloud copy. There was no cloud copy of the erroneous manual session, so that local session was deleted as intended. This records the observed scenario; it does not establish a general rule that every overlapping interval triggers a conflict.

These are owner-reported results, separate from the automated suite. Exact iPhone model, iOS version and build identifier were not supplied. Additional issues noticed during testing are deferred to a separate session; no fixes were requested in this report. Phase 2's core iPhone acceptance testing has passed.

Extended scenarios in [the comprehensive iPhone checklist](iphone-testing.md) beyond the chat walkthrough have not all been independently reported. See the [phased plan](architecture.md).

## Phase 3 additions — 2026-10-17

Final automated result: 50 unit/integration tests and seven Chromium browser tests pass, plus both TypeScript checks and the production PWA build. The actual private migration also passed a separate real-D1 end-to-end check.

- JSON restoration validates schema-version-2 backups and atomically adds missing records after review. Round-trip tests cover settings, incomplete/active sessions, tombstones, pending mutations and saved conflicts. Tests exercise uncertain receipt replay followed by a later edit, cloud deletion protection, local differences, duplicate starts, stale reviews, invalid files, sync leases and storage-failure rollback.
- Historical conversion tests use synthetic cells for overnight/incomplete records, formula templates, deterministic protocol-compatible IDs, reviewed corrections, malformed rows, duplicate starts, unmatched corrections, cached-formula discrepancies and Toronto DST gaps/repeated times. DST-crossing elapsed-time discrepancies are exposed for review.
- Private source reconciliation passed against cached formulas. Missing values, approved corrections and source notes remain in the ignored report. All visible screenshot entries were compared. Originals remain unchanged. Personal counts, dates and totals are excluded from public fixtures/docs.
- A private end-to-end check imported actual history through IndexedDB and foreground sync into real local D1 seeded with production data. The queue drained without conflicts, totals matched reconciliation, original records were preserved and repeat import created no records/receipts.
- Production D1 was backed up before the guarded additive migration. Verification confirmed expected historical values and byte-for-byte preservation of pre-existing session bodies. Repeating the operation made no changes. Installed clients receive history on authenticated foreground sync.
- The sixth Chromium test reviews/imports JSON offline, checks the pre-import download, exports the recovered pending record, relaunches offline and verifies repeat import is skipped. The five existing offline/authentication tests still pass.
- Both TypeScript projects and the production build pass. The app was deployed manually with the existing Free-plan configuration and no D1 schema changes. New import-specific iPhone file-picker/download testing remains a manual follow-up; successful Phase 2 physical acceptance evidence above is retained.

## Installed PWA update follow-up — 2026-10-17

Subsequent owner report: force-quitting/reopening revealed the update card at the bottom of the installed app's Charging screen. The owner independently compared statistics with the corrected Excel workbook and reported they match. On the physical iPhone, importing the older Phase 2 JSON identified all four records as unnecessary (one skipped, three blocked); all four are currently deleted. This verifies file selection and review on that device, not applying an import or saving the automatic pre-import download. The review copy was clarified to name preserved deletions separately from existing live sessions; import decisions and writes are unchanged.

The owner reported the iPhone Home Screen app received migrated data but retained the older interface while the desktop browser showed the new features. This confirms data synchronization, not successful app-shell updating. Inspection found that the update prompt was below all page content and that no explicit service-worker update check ran on resume/reconnection. The exact state of the owner's iPhone worker was not inspected.

The app now checks on registration, pageshow, visible resume and reconnection, and offers **Check for app updates** in Settings. A waiting-worker check supplements the PWA library's notification handling. The installation prompt appears at the top. Activation in another view never forces this view to reload without its own explicit approval. Installation remains disabled while a charge or editor is open.

The seventh Chromium test uses an isolated HTTP server and two byte-distinct production service workers. It verifies resume discovery, a real waiting worker, disabled installation during charging/editing, activation in another window without losing an editor, explicit reload, retained history and offline relaunch. Offline manual checking gives an actionable message. This supports the fix but does not replace confirming the update on the owner's physical iPhone.
