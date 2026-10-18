# Mobile UI revisions — design and implementation plan

Started October 17, 2026. Status: approved for implementation by the user, including
Ionic React selection and the cancellation/short-charge recovery rules below.
Local dependency installation and application changes needed for this plan are
authorized. Local browser testing is sufficient for implementation acceptance;
the user will perform final nuanced iPhone interaction testing after migration.
Deployment remains separately authorized.

## Goal

Make PlugTime feel like an iPhone app in everyday use: stable controls, compact
screens, familiar gestures, deliberate focus, sheets, and brief actionable feedback.
Remain an offline-first web app with useful desktop and keyboard interactions.
Remove promotional copy from routine use; retain explanations needed for decisions.

## Current implementation evidence

- React 19, TypeScript, Vite, Tailwind 4, Dexie, and a PWA shell; no UI component library.
- `src/App.tsx` owns Charging, History, Statistics/Settings, and the session dialog.
- Charging uses separate idle/active markup with different heights and action positions.
- SessionEditor explicitly autofocuses its `datetime-local` start input.
- The dialog has Cancel/Escape handling but no backdrop dismissal handler.
- Action notices persist until another action replaces them.
- Last charge is the latest completed session by start time, with no age limit.
- `src/domain.ts` sorts period groups ascending and emits only periods with records.
- `src/CloudPanel.tsx` appears beneath every screen and runs foreground/automatic sync.
- Connectivity is displayed, but CloudState contains no signed-in identity.
- The API permits one configured owner email. Local IndexedDB data and the cloud
  dataset are not partitioned by account; this revision retains that single-owner scope.
- Deletion writes a versioned tombstone and a queued mutation. Undo needs a real
  restoration operation that remains correct if deletion has already synchronized.

These findings come from source inspection, not a new visual or real-iPhone test.

## Component and tooling research

**Decision: Ionic React with its iOS interaction mode and a custom PlugTime theme.**
The user asked for a final engineering decision after reopening the Konsta choice.
The [detailed comparison and rationale](mobile-ui-library-decision.md) supersedes
the initial research notes below. Prioritize coordinated mobile surfaces,
navigation, scrolling, sheets, and refresh gestures over retaining an entirely
Tailwind-based component layer. Base UI/shadcn remains a credible alternative,
but requires more application-level mobile coordination for this project.

No dependency was installed or application code changed during this comparison.

### Initial research notes (superseded by the decision above)

| Candidate | Documented capabilities | Fit assessment |
| --- | --- | --- |
| Framework7 React | React page pull-to-refresh; sheets with outside/backdrop/Escape dismissal and swipe-to-close; toast actions; mobile navigation components | Not selected: user prefers to avoid an additional app-platform framework. |
| Konsta UI | React components built with Tailwind; iOS theme; app-level safe-area support; lists, navigation, and overlay components | Earlier preference superseded by the deeper Ionic/Base UI comparison. |
| Ionic React | Mobile page/content structure, tab retention, card/sheet modals, refresh gestures and iOS mode | Selected; actual iPhone validation remains required. |

Konsta was initially preferred for its Tailwind fit; the user then requested deeper
evaluation. Ionic is now selected, with the implementation steps updated below.
Before adoption, verify the actual React 19/TypeScript 7 build, stylesheet integration, build impact, licenses,
keyboard/screen-reader behaviour, and installed-iPhone PWA gestures. Choose one
primary UI system rather than mixing several component families.

Follow-up research:

- Konsta's usage docs explicitly describe standalone use with its App wrapper;
  Framework7/Ionic are supported integrations, not mandatory dependencies.
- Its release history shows continued fixes; this does not establish visual
  currency or broad ecosystem adoption. Repository snapshots show roughly 4.3k
  Konsta stars versus 52.7k Ionic stars. These are rough interest signals across
  entire projects, not React-specific adoption measurements or proof of consensus.
- No single iOS-web counterpart to MUI was established by this research. The
  practical distinction is an integrated mobile toolkit (Ionic/Framework7) versus
  general React primitives with an app-specific iPhone-oriented presentation.
- Base UI is an unstyled React library from creators of Radix, Material UI, and
  Floating UI, compatible with Tailwind. Its Drawer documents swipe dismissal,
  snap points, and software-keyboard handling. shadcn/ui's current Base drawer
  uses this implementation. Neither supplies an iOS visual system by default.
- Vaul's repository explicitly says it is unmaintained; avoid recommending the
  older shadcn/Vaul drawer stack from habit. The current Base UI option is distinct.
- The requested comparison is complete in the linked decision report. Pull-to-sync
  and overall iPhone feel still require actual-device implementation validation.

Additional primary sources:

- [Konsta standalone usage](https://konstaui.com/react/usage)
- [Konsta releases](https://github.com/konstaui/konsta/releases)
- [Konsta repository](https://github.com/konstaui/konsta)
- [Ionic repository](https://github.com/ionic-team/ionic-framework)
- [Ionic React](https://ionicframework.com/react)
- [Base UI background and compatibility](https://base-ui.com/react/overview/about)
- [Base UI Drawer](https://base-ui.com/react/components/drawer)
- [shadcn Base drawer](https://ui.shadcn.com/docs/components/base/drawer)
- [Vaul maintenance notice](https://github.com/emilkowalski/vaul)

Framework7 also publishes an official documentation MCP with component APIs,
theme variables, and React demo sources. This is useful assistant tooling, not a
design skill or a runtime dependency. No third-party skill or MCP was installed.
An implementation skill should encode our agreed interaction rules after the
screen designs are settled; a generic visual-design skill cannot settle them for us.

Primary sources consulted:

- [Framework7 React page and pull-to-refresh](https://framework7.io/react/page)
- [Framework7 React sheet modal](https://framework7.io/react/sheet-modal)
- [Framework7 React toast](https://framework7.io/react/toast)
- [Framework7 documentation MCP](https://framework7.io/mcp/)
- [Konsta UI React components](https://konstaui.com/react)
- [Konsta installation](https://konstaui.com/react/installation)
- [Konsta app theme and safe areas](https://konstaui.com/react/app)
- [Ionic platform overview](https://ionicframework.com/docs/core-concepts/cross-platform)

## Captured user requests

### Shared shell, account, and sync

- Use pull-down to sync instead of a sync button at the bottom of each page.
- Show that a user is signed in, with a badge conveying connectivity, pending
  uploads, or syncing.
- Show signed-in identity and sync status. The user withdrew the logout criticism;
  logout, account switching, and separate user histories are outside this revision.
- Keep a bottom tab bar, but make the overall experience more app-like.
- Fix button alignment and visual affordances; destructive actions should look
  intentional, not like indented links without a button boundary.

### Charging

- Remove “ready when you are,” “one tap,” and similar sales copy.
- Keep the charging tile dimensions and Start/Stop control position stable.
- Retain a useful recent-charge card after stopping; hide it after 12 hours.
- Provide Undo for deleting the last charge, even if deletion was confirmed.
- Use transient in-app notifications for discard/cancel/delete results rather
  than permanent banners or text.

### Session creation and editing

- Do not autofocus a date/time field and unexpectedly open the iPhone picker.
- Preserve the quick Add Session → Save Session workflow with the current start
  time and no required picker interaction.
- Keep start/end inputs within the sheet/dialog margins on iPhone.
- Allow dismissal by tapping outside the modal.
- Dismiss changed or unchanged fields without a discard confirmation.
- Place Save (checkmark) and Delete (trash) icon buttons at the top right;
  Delete appears only for an existing session.
- Make Save/Delete actions consistently aligned and visibly actionable.

### History

- Preserve reverse chronological ordering, newest first.
- Use one continuous list without date-group headings.
- Make each row an at-a-glance summary rather than a data grid: start day/time
  and duration on the left, estimated energy and cost on the right.
- Label the local start day “Today” or “Yesterday” when applicable; otherwise
  show a concise calendar date. For sessions under 24 hours, show only the start
  day, even if charging crosses midnight; do not repeat the end date/time.
- Apply shared editor, button, notification, and destructive-action improvements.

### Statistics and settings

- Make statistics more compact.
- Consider a segmented interface: Overview / Last 12 months / Yearly.
- Show monthly and yearly statistics newest first, consistent with History.
- Limit monthly statistics to 12 months, including months with zero sessions.
- Display the month name prominently, with a muted year on a separate byline,
  for example “October” above “2026.”
- Keep settings reachable without scrolling through an ever-growing monthly list.

## Agreed Charging layout

The user accepted the proposed Charging layout during discussion:

- Compact title and account/sync status at the top.
- Stable charging tile with reserved status, timer/estimates, and primary-action
  positions; Start/Stop switches content without moving the button.
- Idle content: “Ready to charge,” a muted `0h 00m`, and configured power/rate.
- Manual session entry below the tile.
- Recent-charge card visible for 12 hours after the session ends.
- Brief notifications with Undo for deletion.

Implementation is approved. Account layout,
notification timing, and recent-card visibility are settled in the sections below.

## Agreed session editor decisions

- No discard prompt: dismissing drops unsaved edits to the two date fields.
- Save uses a checkmark icon in the top-right toolbar.
- Delete uses a familiar trash icon alongside Save, only when editing an existing
  session. Order: trash, then checkmark at the far right.
- Both icon buttons need accessible names and adequately sized, separate touch
  targets. Toolbar icons supersede the earlier full-width bordered Delete proposal
  for this editor; consistent action alignment still applies elsewhere.
- Preserve deliberate picker activation, valid default values, and contained fields.

Plan a bottom sheet with a top-left Close control, title, and top-right actions.
Exact visual styling will use Ionic's iOS interaction mode with PlugTime's own theme.

## Agreed History direction

- Continuous list, newest first, with no grouped date headings or data-grid layout.
- Row example: `Today, 9:05 AM (3 hours 40 minutes)` on the left and
  `35.2 kWh / $7.15` on the right; use “Yesterday” for the previous local day.
- Other days use one concise start-date string for sessions under 24 hours.
  Crossing midnight alone does not require a second date.
- The editor provides full timestamps when needed. Preserve clear active and
  unfinished states, which cannot use a completed-session duration/cost summary.
- On narrow screens or with enlarged text, allow the summary to wrap without
  overlap while retaining the same information hierarchy.
- Sessions lasting 24 hours or more display both start and end dates. Older dates
  use a concise format such as “Oct 12,” including a year for a different calendar year.
- A top-right + opens Add Session; tapping a row opens its editor.

## Agreed Statistics and navigation

- Four bottom destinations: Charging / History / Statistics / Settings.
- Settings has its own tab and does not sit beneath statistics.
- Statistics uses a segmented control: Overview / Last 12 months / Yearly.
- Overview shows compact totals for sessions, charging time, estimated energy,
  and estimated cost, with averages below.
- Last 12 months includes the current calendar month and previous 11 months in
  device-local time, newest first, including months with zero sessions.
- Monthly rows show the month name above a muted year.
- Yearly shows compact annual summaries, newest first.

## Agreed Settings layout

- Compact sections: Account & sync, Charging defaults, Data, and App.
- Account & sync: signed-in identity, sync status, pending changes, last successful
  sync, and an explicit Sync now action; no logout or account switching.
- Charging defaults: power and electricity rate.
- Data: export and import, retaining the existing review and recovery safeguards.
- App: updates, offline readiness, and storage information/actions.
- The header account/status badge opens Account & sync directly. With Ionic, present
  that shared content in a sheet over the current tab; Settings retains the same
  section. This preserves direct access without changing tab/navigation context.
- Pull-down triggers sync and existing automatic sync continues.

## Interaction rules — approved; agreed screen decisions above take precedence

1. Use a compact header with account/status access. Opening it reveals identity,
   sync details, last successful sync, and an explicit Sync action.
   Pull-to-sync is the everyday gesture; an explicit action also supports desktop,
   keyboard access, and discoverability. Existing automatic sync continues.
2. Separate connectivity, authentication, and sync health. “Online” must not imply
   that the account is authenticated or changes are uploaded. Prioritize actionable
   errors/conflicts, then syncing, then pending count; expose details on tap.
   Offline identity is last verified identity, not proof of current authentication.
3. Use a stable charging tile with reserved areas for status, elapsed time,
   estimates, primary control, and secondary actions. Keep the primary control
   anchored through transitions without making idle space feel arbitrarily empty.
   Stability applies at a given viewport/text size; enlarged text must still fit.
4. Define “recent” using completion time: newest eligible completed session with
   `0 <= now - endAt < 12 hours`. History retains all sessions. Hide this card
   while another charge is active.
5. Use an iPhone-style session sheet, with accessible initial focus on a heading
   or container rather than a picker. Preserve native date/time inputs initially;
   opening a picker should be deliberate. Use the agreed top-right Save/Delete
   icons; propose a Close control at top left.
6. Support backdrop and swipe dismissal. Changed and unchanged sheets close
   without a discard prompt; unsaved field edits are dropped.
   Avoid accidental dismissal while saving; return focus to the opener.
7. Show brief notifications above the tab bar/safe area. Destructive notifications
   include Undo. Ordinary notices last about 3 seconds, Undo notices about 8;
   pause expiry during interaction. Errors requiring action remain reachable.
8. Undo restores the same record and historical assumptions via a new revision,
   including after a completed deletion upload. A conflicting newer edit must not
   be silently overwritten. Active cancellation and automatic under-one-minute
   discard need separate restoration rules because only one charge can be active
   and completed charges currently require at least one minute. Approved recovery
   rules are specified in the implementation plan below.
9. Use the agreed compact rows and segmented statistics control. Include current
   calendar month plus previous 11 months in device-local time, including zero rows.
   Keep yearly history available newest first. Preserve grouping by start date
   and completed-only calculations unless explicitly changed.
10. Use the agreed four bottom destinations: Charging / History / Statistics /
    Settings. Settings remains directly reachable independent of statistics length.
11. Match destructive button geometry and alignment to neighbouring actions.
    The editor uses the agreed toolbar icons; elsewhere use a clear button surface
    or a full-width grouped action row as appropriate.
12. Preserve safe areas, touch target sizes, readable text, dark mode, reduced
    motion, screen-reader labels, and keyboard access. Pull-to-sync must not fight
    page scrolling or cause a browser reload; validate in Safari and standalone PWA.

## Decisions to discuss one screen at a time

Suggested discussion order:

1. **Charging + shared header:** tile content, action placement, recent charge,
   account/status entry point. Layout and idle content agreed above; resolve
   remaining details alongside account and notification discussions.
2. **Session sheet:** create/edit flow, Save/Delete hierarchy, dismissal and drafts,
   deliberate date/time selection, cancellation/discard Undo semantics.
3. **History:** continuous list and concise row contents agreed above; confirm
   older-date/long-session formatting and add-session placement in the final plan.
4. **Statistics:** layout, 12-month boundary, zero-month presentation, yearly view,
   and separate Settings tab agreed above; validate segmented labels on narrow phones.
5. **Settings/account:** navigation placement, identity, pending changes,
   conflict review, backup/import, app updates, and storage information.

Account scope resolved: the user withdrew the request for logout and testing as
another user. Retain single-owner storage and the existing owner-only Access policy.
Signed-in identity, sync status, and sign-in recovery for expired authentication
remain in scope; logout, account switching, and multiple-user histories do not.

Settings arrangement agreed above. Screen structure discussions are complete;
review the implementation plan next.

## Agreed finishing details

- Hide the recent-charge card while another charge is active; show the newest
  completed charge after Stop, provided its end time is within the 12-hour window.
- For explicit session deletion, use immediate deletion plus Undo instead of a
  confirmation followed by Undo. Keep cancellation and automatic short-charge
  discard semantics as separate decisions in the implementation plan.
- Show ordinary success notices for about 3 seconds; deletion notices with Undo
  for about 8 seconds, pausing expiry during interaction. Ensure screen-reader
  announcements and keyboard access. Errors/conflicts remain reachable in status
  details instead of disappearing as the only explanation.
- History uses a top-right + action, opens the editor on row tap, and uses a concise
  date such as “Oct 12” (with a year for a different calendar year). Completed
  sessions of 24 hours or more show both dates. Active/unfinished rows keep clear
  state labels rather than implying completed totals.

Implementation is approved. The plan below specifies approved
short-charge recovery, sync-safe Undo, and gesture integration without another
app framework by default.

## Implementation plan — approved

### 1. Establish the Ionic React shell

- Verify and pin a published Ionic v9 patch with matching
  React/router packages and supported React Router 6 dependencies. Verify the
  existing React 19/TypeScript 7 build rather than inferring full compatibility
  from peer ranges alone. Review the MIT licenses and record build-size baseline.
- Adopt IonApp, IonPage, IonContent, IonHeader/IonToolbar, and the supported
  IonReactRouter/IonTabs/IonRouterOutlet structure with four shallow tab routes.
  Use iOS mode, custom PlugTime theme tokens, safe areas, and readable light/dark
  surfaces. Preserve view/scroll state without sliding between top-level tabs.
- Split screen presentation from the current large App component while retaining
  Dexie and the existing domain, sync, import, and export behaviour.
- Retain Tailwind for owned layouts/custom rows; theme Ionic internals through
  supported variables/Shadow Parts and review reset/stylesheet interactions.
- Use IonModal for the editor, IonRefresher for pull-to-sync, IonSegment for
  Statistics, and IonToast with an app-owned coordinator for notifications.
- Keep assets and required lazy chunks bundled/precached for offline use. Do not
  add Framework7, Konsta, shadcn/Base UI, Capacitor, paid Ionic services, or CDN
  assets alongside the selected UI system. Keep Vite, Workbox, and Dexie.
- Account for retained pages: global sync/listeners/queues have a single owner;
  visible-only work uses view lifecycle hooks. Validate the shell, sheet, and
  refresh together before completing the remaining controls.

### 2. Centralize sync status and notifications

- Move foreground-sync lifecycle ownership out of the repeated CloudPanel into
  one app-level owner shared by automatic sync, pull-down, and Sync now.
- Use IonRefresher within each main IonContent. At the top of a main screen, a downward pull triggers synchronization without
  reloading the app. Do not intercept editor gestures or normal list scrolling.
  Give short screens sufficient scroll/gesture behaviour; release the indicator
  on success, authentication failure, offline failure, and conflicts.
- Replace repeated bottom cloud panels with the header badge and Settings details.
  Keep conflicts discoverable and preserve the full existing resolution workflow.
- Add a small protected identity response from the existing authenticated API,
  derived from verified identity, without exposing auth tokens. Mark any stored
  identity as last verified when current authentication cannot be checked.
- Derive the badge from connectivity, authentication, sync, pending uploads, and
  conflicts; a network connection or successful request alone never means synced.
- Add a shared notification queue. An unrelated success notice must not replace
  an available Undo. Give each destructive notice its own action; queue notices
  and start their expiry when visible. Pause while focused, hovered, or touched,
  and while the app is hidden. Keep notifications above sheets/tab bars with
  accessible announcements and adequate action targets.

### 3. Implement restoration before exposing immediate deletion

- Add a transactional restoration operation for the same session ID, retaining
  original timestamps, assumptions, and creation time. Write a new local revision
  and queued mutation using the current server revision, not an old snapshot's
  synchronization metadata. Never rewind or remove an upload already in progress.
- Guard against newer content changes and unresolved conflicts. Acknowledgement
  metadata changes alone must not invalidate Undo. Restoration failures remain
  visible and do not silently overwrite another version.
- Use immediate deletion with Undo in the editor and recent-charge card.
- Approved cancellation rule: preserve the existing confirmation for cancelling
  an active charge of at least one minute; add Undo after cancellation. Shorter
  cancellations remain immediate and also offer Undo.
- Approved short-charge rule: Stop still automatically discards a charge under
  one minute. Its notification offers Undo, which resumes the original active
  charge with its original start time rather than creating an invalid short
  completed session. Cancelling an active charge uses the same resume behaviour.
- If another charge has started before Undo, recover the old charge as an
  unfinished record instead of creating two active charges, and explain that
  result. Undo of a deleted completed/unfinished record restores its previous state.
- Undo is an in-app notification action, not a new permanent trash/history screen;
  independent backup/import safeguards remain available.

### 4. Build Charging, the session sheet, and History

- Charging layout: header → stable status/timer/estimate tile → anchored Start/Stop
  → manual entry → eligible recent charge. Reserve secondary-action space without
  constraining enlarged text. Remove sales copy.
- Find the newest completed charge by end time, not start time. Show it only when
  idle and ended less than 12 hours ago; update the boundary on time/resume.
- Sheet layout: Close | title | trash/checkmark → Start → optional End → relevant
  estimate/timezone context and inline validation. Save preserves Add → Save as an
  unfinished record. No initial picker focus and no overflowing date fields.
- Support backdrop, downward swipe, Escape, and Close with no discard prompt;
  block accidental dismissal during a write, manage focus, and restore opener
  focus where it still exists. Only the explicit delete action deletes a record.
- History layout: title/+ → continuous tappable summary rows. Use local calendar
  days for Today/Yesterday, elapsed duration for the 24-hour rule, and wrap text
  naturally on narrow screens. Clearly label estimates without repeating long
  explanatory copy in every row.

### 5. Build Statistics and Settings

- Statistics layout: title → Overview / Last 12 months / Yearly segmented control
  → selected compact metrics/list. Preserve completed-only, start-date grouping
  and existing calculation/rounding rules.
- Generate exactly 12 local calendar months ending with the current month, filling
  zero months, sorted newest first. Yearly remains complete and descending.
- Settings layout: Account & sync → Charging defaults → Data → App. Use compact
  grouped rows and disclose lengthy backup/import/conflict details when needed.
- Header badge opens shared Account & sync content in a sheet over the current
  tab; Settings renders the same content in its section. Preserve export/import,
  update deferral during charging/editing, storage actions, and sign-in recovery.
  No logout, account switching, or Access-policy expansion.

### 6. Validate and deliver for review

- Add targeted tests for restoration before/after upload and during an in-flight
  upload, concurrent edits/conflicts, active uniqueness, short-charge recovery,
  local date labels, overnight/24-hour sessions, recent-charge expiry, and monthly
  zero filling/year rollover. Extend identity authorization tests where needed.
- Run the existing unit suite, production build, and relevant browser checks.
  Verify editor focus/bounds/dismissal, stable Start/Stop geometry, navigation,
  accessible icon names, notification Undo, and offline recording in browser tests.
- Inspect narrow mobile and desktop layouts, enlarged text, dark mode, keyboard
  focus, and reduced motion. Local browser testing is sufficient to verify the
  implementation. The user will perform final real-iPhone/installed-PWA testing
  for nuanced touch, scroll, and picker feel after migration; do not block delivery
  or request device testing before completing the locally testable work.
- Update user-facing documentation for changed flows, review the final diff,
  and report validation and remaining device limitations. Deployment remains a
  separate user-authorized step; this plan does not publish anything.

Implementation acceptance: all agreed screens and interactions above work together,
existing records remain intact, offline recording and sync/recovery checks pass,
and unverified real-device behaviour is explicitly identified rather than assumed.

## Planning and implementation gate

The user approved the plan and recovery defaults and explicitly requested a new
project chat to implement it. Proceed with all authorized local implementation and
validation without requesting plan approval again. The final iPhone interaction
feel check belongs to the user after migration. Do not deploy without authorization.

Anticipated validation for that later plan:

- Real iPhone Safari and installed PWA: safe areas, pull-to-sync, short pages,
  picker focus, field bounds, keyboard, sheet dismissal, and stable Start/Stop.
- Recent-charge boundary, overnight sessions, month/year rollover, local timezone,
  zero-session months, and descending statistics.
- Delete/Undo offline and after upload; concurrent changes, active-charge
  uniqueness, and under-minute discard rules.
- Authentication expiry, sign-in recovery, and pending changes; confirm online
  connectivity alone never displays “synced.”
- Narrow screens, large text, reduced motion, dark mode, screen readers, and
  desktop keyboard operation. Retain existing offline, sync, and recovery checks.
