# Mobile UI migration implementation

Implemented locally October 17, 2026, against the [approved plan](mobile-ui-revisions.md)
and [library decision](mobile-ui-library-decision.md). Those original planning
documents are preserved. No deployment, publishing, account switching or logout
was added.

Deployment was subsequently authorized by the owner and completed on October 17,
2026. Production Worker version: `e0d6df60-e47a-4fd8-8114-2b463119526b`.
No D1 migrations were pending. The production manifest, service worker, JavaScript
and CSS match the tested local build; API routes continue to require Access sign-in.

## Delivered behavior

- Four retained Ionic tabs: Charging, History, Statistics and Settings. Top-level
  tab transitions do not slide. History scroll position and Settings drafts survive
  tab changes. One root owner manages sync, connectivity, time and notifications.
- A stable Charging tile keeps Start/Stop at the same position. The recent card
  selects by completion time, expires at 12 hours, rejects future completion times,
  and hides while charging.
- Session sheets support Close, Escape, backdrop dismissal and downward swipe.
  Drafts are dropped without confirmation. Close receives initial focus, native
  date inputs fit inside the sheet, and focus returns to the opener. Save/checkmark
  and Delete/trash have accessible labels and separate 44px targets. Dismissal is
  blocked during database writes. Quick Add → Save creates an unfinished record.
- Continuous History rows show local Today/Yesterday/calendar labels, duration,
  estimated kWh and CAD. Both dates appear for durations of at least 24 hours;
  crossing midnight alone does not add the end date.
- Statistics has Overview / Last 12 months / Yearly segments. Months are device-local,
  descending, exactly twelve including the current month and zeros. Yearly totals
  remain complete and descending. Calculation and rounding rules are unchanged.
- Settings groups Account & sync, Charging defaults, Data and App. Reviewed import,
  pre-import backup, export, conflict resolution, persistent-storage actions,
  offline readiness and safe update deferral are retained.
- The header badge opens shared Account & sync content over the current tab.
  `/api/identity` returns only the email from the same verified, owner-authorized JWT
  used by the other protected routes. Stored identity is explicitly last verified;
  network availability, authentication, pending uploads and sync health are distinct.
- Pull-to-sync uses Ionic Content/Refresher on all main pages and always completes
  its indicator through a finally handler. Automatic foreground sync remains active.
- App-owned queued Ionic toasts last about three seconds, or eight with Undo.
  Each action retains its own callback. Expiry starts after presentation and pauses
  for hover, touch, keyboard focus, hidden documents and an executing Undo.

## Recovery semantics

Deletion and short-charge discard retain tombstones. Undo transactionally restores
the same session ID, timestamps, creation time and historical assumptions through a
new revision and mutation. It uses the current server revision, never removes or
rewrites an upload in progress, and blocks on newer content or unresolved conflicts.
Acknowledgement-only metadata updates do not invalidate Undo.

Cancellation of a charge lasting at least a minute still asks for confirmation.
Short cancellations and Stop under one minute remain immediate. Undo resumes the
original active charge with its original start time; if another charge is active,
the recovered charge becomes unfinished with an explanatory notification.

## Dependencies, integration and build cost

Published versions were checked with the npm registry, rather than inferred from
repository main branches: `@ionic/react` and `@ionic/react-router` **9.0.8**, with
`react-router` / `react-router-dom` **6.30.6** and `ionicons` **8.0.13**, pinned in
the manifest and lockfile. Ionic declares React 18/19 and Router >=6.4,<7 peer support.
The actual React 19.3.1 / TypeScript 7.0.2 builds pass. Ionic, Router and Ionicons use
MIT licenses. No Capacitor or additional UI framework is installed.

Ionic runs in iOS mode with PlugTime light/dark tokens. Tailwind theme/utilities
remain available; Tailwind preflight is omitted so it does not reset Ionic internals.
Ionic CSS variables and supported Shadow Parts style the overlays and touch targets.
Content owns scrolling, toolbar/tab surfaces own their safe areas, and sheet content
adds its bottom inset. Reduced motion is respected at startup and in CSS.

Production measurements from the same local build environment:

| Output | Before | After |
| --- | ---: | ---: |
| Main JavaScript, raw / gzip | 360.94 / 112.97 kB | 1,536.29 / 356.30 kB |
| Main CSS, raw / gzip | 13.02 / 3.92 kB | 25.40 / 6.40 kB |
| Workbox precache | 13 entries / 379.20 KiB | 19 entries / 1,582.30 KiB |

Ionic adds a material bundle cost; Vite reports its large-chunk warning. The app
does not claim a startup or frame-rate improvement. Required component/animation
chunks and bundled icon data work offline. Existing Workbox asset patterns cover
the added chunks; API and Cloudflare Access navigation exclusions remain intact.
No CDN assets or online-only UI dependency was introduced.

The final npm audit reports three moderate package findings, propagated from two
Router advisories: [untrusted backslash navigation](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6)
and [SSR error hydration](https://github.com/advisories/GHSA-337j-9hxr-rhxg).
PlugTime supplies fixed internal destinations and uses client rendering without SSR
hydration. Router 7 fixes are outside Ionic 9.0.8's declared peer range. Router 6.30.6
includes the available compatible redirect fixes; the remaining audit findings are
recorded rather than hidden or force-fixed through an unsupported major upgrade.

## Validation

- `npm test`: **59 tests passing**, including local/D1 persistence, same-record
  restoration before/during/after upload, newer-content/conflict guards, active
  uniqueness, short-charge recovery, identity authorization, retained identity,
  local calendar labels, recent expiry, month zeros and year rollover.
- `npm run build`: browser and Worker TypeScript checks and Vite/Workbox production
  generation pass.
- `npx playwright test --workers=1 --reporter=list`: **13 browser tests passing**
  in the final production regression run, including retained History scroll,
  Settings drafts and absence of per-tab sync ownership.
- Local Chromium checks cover 390px and 320px phone layouts, 1100px desktop,
  24px root text, dark mode, reduced motion, keyboard focus, sheet field bounds,
  Escape/backdrop/touch-swipe dismissal, stable control geometry, shared account
  content, refresh completion, segmented statistics, Undo and paused expiry.
- Existing production-service-worker checks cover offline recording/relaunch/edit,
  first offline access to screens, backup review/import/export, authentication
  expiry, real waiting-worker discovery, cross-window activation and update deferral.

Local browser validation is the implementation acceptance scope. Physical iPhone
Safari/installed-PWA rubber-band refresh, software date-picker/keyboard behavior,
notch/landscape insets and VoiceOver interaction feel are not claimed verified.
The owner's later device evaluation is not a prerequisite for this local delivery.

Primary references include the installed published Ionic package types/source,
[React navigation](https://ionicframework.com/docs/react/navigation),
[modal](https://ionicframework.com/docs/api/modal),
[refresher](https://ionicframework.com/docs/api/refresher),
[toast accessibility](https://ionicframework.com/docs/api/toast),
[Shadow Parts](https://ionicframework.com/docs/theming/css-shadow-parts), and
[Cloudflare JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

## Follow-up: sync cadence and standard Ionic controls

Following the owner's phone review, automatic sync is limited to one attempt per
hour. The attempt timestamp is persisted atomically with the sync lease in IndexedDB,
so reloads, foreground events, pending changes and other tabs cannot bypass it.
Failures count toward the cooldown. Manual Sync now and pull-to-refresh bypass the
limit; a manual attempt also resets the next automatic eligibility time. A visible,
online app runs again at the hourly boundary; otherwise it waits for foreground or
connectivity recovery. Existing stores seed the initial cooldown from last success.

Pull-to-refresh now checks both cloud sync and service-worker updates and completes
its indicator after both operations settle. Update installation remains explicit
and deferred while charging or editing.

The first migration deliberately retained existing Settings controls to reduce
behavioral risk. Ionic does not recommend restricting its components to the shell.
Ordinary Settings actions, conflict/sync actions and import actions now use IonButton;
charging defaults use IonList, IonItem and IonInput, retaining required/range/precision
validation. Custom layout CSS remains for grouped sections and bespoke charging and
history layouts. Native file and date inputs remain deliberate choices. The app-update
button has an explicit 16px top margin rather than depending on incidental stacking.

Follow-up validation: 64 unit tests, production build, all 15 browser checks and
Wrangler dry run pass. Checks include cooldown across tabs/reloads, manual bypass,
service-worker update discovery, input validation and update-button spacing.
Production version: `3b1b0990-af50-4c71-9d30-fd056f0d55b0`, deployed October 17,
2026. No database migrations or Access-policy changes were needed.

## Phone-review fixes: cancellations and UI polish

The rapid start/stop conflict report was caused by sorting the outbox globally by
local revision: each charge's start could reach the server before earlier charges'
stop/delete revisions. The server correctly enforced its single-active invariant,
but the queue manufactured conflicts for already-cancelled local records.

Sync now prunes superseded, never-sent active snapshots, retains cancellation
tombstones, preserves revision order within a record, and uploads active-slot
releases before starting another record. Uncertain envelopes are replayed exactly.
Stored, explicitly rejected active-conflict starts can be retired when a newer local
cancellation supersedes them. Conflicts whose blocker this device has already
released are retried, at most once per record per sync run. Genuine remote edits,
competing-device charges, and uncertain uploads remain protected. Existing false
queue-order conflicts are repaired on the next successful manual/automatic sync;
no manual deletion of each cancelled test session is required.

Settings displays pending updates and an Install update action directly in its App
section, using the same charging/editing deferral as the header banner. Explicit
gaps separate explanation, buttons, and result text. Native file/date field styling
is scoped to .native-field rather than leaking into Ionic's generated input labels.
Charging defaults use compact, full-size inline Ionic labels/inputs. The charging
card's secondary-action reserve is smaller, Start/Stop stays anchored, and starting
a charge no longer emits a redundant success toast.

The header now composes IonAvatar, IonBadge and IonSpinner in one accessible account
button. Overlays convey pending count, syncing, offline and attention states; the
full status remains in its accessible name and shared account sheet.

Main headers read the current safe-area inset directly and remeasure on pageshow,
resume, resize and orientation/visual-viewport changes. For an installed portrait
app, a previously measured nonzero inset is retained in session storage if WebKit
briefly reports zero during a warm reload. Landscape can return to zero, and sheets
retain their own Ionic inset handling. No device-specific inset is hardcoded.
The exact iPhone/WebKit transient was not reproduced on physical hardware; the
recovery policy is covered by browser simulations of measured/stale/rotated insets.

Validation: 70 unit/integration tests, including the browser-to-real-D1 rapid-cancel
path, and 17 browser checks pass. Browser coverage includes Settings update actions,
input label/value geometry, button/result spacing, avatar overlays, warm inset
recovery, landscape, no start toast, stable controls, offline recording and Undo.
Both production TypeScript builds and Wrangler dry run pass. The mixed browser/D1
integration fixture runs under Vitest separately from the two production ambient
TypeScript environments.

Deployed production version: `d05baafd-6a29-4c92-ae5a-d64dcb08191b`, October 17,
2026. Production shell/component assets match the tested build and unauthenticated
API requests still require Access sign-in. No database migrations were needed.

## Session editor follow-up

Sheet titles now reserve equal space on both sides, keeping Add and Edit centered
despite different action counts. A collapsed Power & electricity rate section
shows the record's stored assumptions and exposes Ionic numeric inputs for
session-specific changes, including one-off overrides when adding a record.
Saving uses the existing session mutation and recalculates estimates without
changing global defaults. Closing discards edits. Validation reveals and focuses
invalid fields even if the disclosure was collapsed, and preserves the existing
timestamp validation. Shared Ionic field colors explicitly follow the app theme.

Validation: production build, 70 unit/integration tests and 18 browser tests pass.
The additional browser coverage checks persisted overrides, zero cost, precision
validation, collapsed invalid fields, discarded edits, unchanged defaults, actual
dark input surfaces, and centered Add/Edit titles at 390px and 320px widths.
The final field styling also passes the Settings regression check.

Deployed production version: `2f7baf73-a06e-4c72-beee-e7312e1e14e3`, October 17,
2026. No database migration was needed.

## Grouped History and expandable Statistics

History now uses month/year sections, skips empty months and shows newest sessions
first. A shared session list renders separate aligned date, time and estimate
columns, with a stacked narrow-screen layout and tabular numbers. Today/Yesterday
labels remain, and older rows use the section heading for the year.

Statistics year rows expand into populated months, and month rows expand into the
same editable completed-session list. Last 12 months still includes zero months,
which expand to an empty-state explanation. Native disclosures support keyboard
and touch, preserve expansion while editing and update aggregates after a save.
History and statistics use a shared local-start-date grouping helper. Completed
sessions crossing months/years count entirely toward their starting period;
unfinished sessions appear only in History and deleted sessions are excluded.

Validation: production build, 71 unit/integration tests and all 19 browser checks
pass. New coverage includes month/year boundary sessions whose UTC date differs
from their local start date, list ordering, empty groups, aligned Today/Yesterday
times, keyboard expansion, offline session editing from Statistics, updated parent
totals, focus restoration and dark 320px layouts with enlarged text.

Deployed production version: `80203bfa-b678-4db6-9a1e-9af520bc47c8`, October 17,
2026. Production asset hashes match the tested build, API paths still require
Access sign-in, and no database migration was needed.

## Quieter status, toolbar updates and simpler rollups

Removed the standalone offline label and update card above page content. The
charging card's existing local-storage caption includes Works offline (or setup
pending), while Settings retains the detailed readiness status. Update availability
appears as an accessible download icon button in the main toolbar, with the inline
Settings installation control retained. Both controls defer installation during
charging or editing; toolbar space accounts for History's add button.

Statistics now has Overview and By year. Years start collapsed and expand into
populated months, then the shared session list. Removed the twelve-month view and
its zero-month generation; year/month groups retain local-start-date membership.

Cancelling a never-sent active session, or stopping it under a minute, now removes
all its queued mutations immediately in the same IndexedDB transaction. A local
tombstone remains for Undo and import protection. Server revisions, frozen upload
envelopes and existing conflicts prevent this cleanup: cloud deletions and exact
replay after uncertain outcomes are preserved. Undo queues one restored snapshot.

Validation: production build, all 75 unit/integration tests and 19 browser checks
pass. Added explicit stop/cancel coverage for unsent cleanup, edited assumptions,
Undo, uncertain envelopes and acknowledged starts. Browser checks verify the
pending badge clears immediately for offline cancellation and short Stop, toolbar
updates do not move the charging card, installation stays deferred during charging
or editing, multi-tab activation stays safe, and toolbar actions fit at 320px.

Deployed production version: `e8166eed-e1a4-452f-9b3f-ed803e727ed7`, October 17,
2026. Production assets match the tested build and API authentication remains
enforced. No database migration was needed.


## Ionic adoption completion — local, October 17, 2026

Completed all six phases of the [Ionic adoption audit](ionic-adoption-audit.md),
which preserves the original inventory and now records final evidence. Standard
surfaces, ordinary actions, shared session list rows, disclosures and both
cancellation confirmations use Ionic. Application CSS retains responsive content
layouts, timer/metric typography, spacing, account badge composition and measured
platform accommodations. Native date/time and file inputs remain approved controls.
Account content explicitly chooses page-card or plain-sheet presentation.

Nested years/months remain independently expanded through editing, tab and segment
changes. Collapsed invalid assumptions open before validation focuses the field;
editor and alert dismissal return focus to the correct Ionic native control.
Cancellation retains the exact one-minute threshold, immediate short cancellation,
existing Undo, repeated-request guards and write/dismissal protection.

Measured at 390 × 844: the Charging card is 455.75px high versus 474.375px before;
space below Start/Stop is 64px versus 81px. Idle and active controls both start at
407.75px and remain 58px high. Enlarged 320px and 100-hour timer checks pass with
less than 1px rounding tolerance. The audit contains the full geometry table and
local screenshot/evidence paths.

Validation: production build and both TypeScript checks pass; **75 unit/integration
tests and all 22 Chromium browser tests pass**. Coverage includes offline recording,
imports/exports, sync/auth/conflicts, Undo, update deferral, retained tabs/drafts,
nested accordions, native input validation, large text, dark/reduced-motion/forced
colors, keyboard focus and long account/conflict content. Main JS is 1,549.89 kB
raw / 360.01 kB gzip; CSS 28.90 / 7.07 kB; 19 precache entries / 1,599.13 KiB.
The existing large-bundle warning remains.

No database/sync/API protocol or dependency-version changes were made. No deployment
or publishing occurred in this completion pass. Actual coverage is local Windows
Chromium, not physical iPhone Safari or an installed PWA. Hardware picker/keyboard,
VoiceOver, rubber-band refresh, safe-area and gesture feel remain for the owner's
later device evaluation, as authorized in the original migration acceptance scope.


## Authorized production publication — October 17, 2026

After local completion, the owner explicitly authorized publishing for phone testing.
Deployed the tested build to [PlugTime](https://plugtime.patrick-c8b.workers.dev).
Production Worker version: `e8939744-e374-4497-acbe-d9ac5a842c69`.

Wrangler's production dry run passed and the remote migration list reported no
migrations to apply. All 17 served build files (including the shell, manifest,
service worker and application chunks) match local SHA-256 hashes; `_headers` is
Cloudflare configuration rather than a served asset. The root shell also matches.
The manifest and service worker return `Cache-Control: no-cache`. Unauthenticated
requests to `/api`, `/api/config`, `/api/identity`, `/api/snapshot` and
`/api/mutations` still redirect to Cloudflare Access. Verification details are saved
in ignored `.local/ionic-deployment-verification.json`. No database migration,
Access-policy change or authenticated production data mutation was performed.
Physical-phone testing remains with the owner; publication does not establish
Safari, picker, VoiceOver or installed-PWA hardware results.
