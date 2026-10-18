# Ionic adoption audit and completion plan

Audit date: October 17, 2026. Source baseline: `e55f002`. The inventory and plan
below describe the pre-implementation source. All six phases have now been
implemented locally; see [completion evidence](#completion-evidence-october-17-2026)
for changes, measurements, validation and device limitations. The baseline counts
are preserved as historical evidence, rather than presented as current counts.

## Assessment

Ionic is broad enough for the standard visual components this app still builds by
hand. The remaining work is concentrated in card surfaces, ordinary buttons,
interactive history rows, and disclosures. The navigation shell, sheet containers,
numeric fields, account indicator, and notifications already use Ionic extensively.

The target should be Ionic components with a small, explicit application CSS layer.
It should not be an all-Ionic-tag rewrite. Text, semantic HTML, forms, responsive
session summaries, metric grids, spacing, and native file/date controls still have
valid roles. Replacing a `div` is useful when it replaces component behavior or a
duplicated visual primitive; changing a tag alone is not progress.

The original [library decision](mobile-ui-library-decision.md) explicitly retained
native date fields, custom session summaries, and a stable charging tile. It also
warned against preserving oversized stacks of cards merely by wrapping them in Ionic
tags. This plan keeps those constraints: standardize the tile's surface and actions,
retain its custom inner layout, and favor compact groups for ordinary settings.

## Scope and measurement

Reviewed all nine `src/*.tsx` files, all 15 named render components (including local
helpers), the root mount, all of `src/styles.css`, `useSafeArea.ts`, the pinned
dependency versions, prior UI decisions/implementation notes, and relevant browser
test coverage. Non-rendering hooks and persistence/sync/domain modules are not UI
replacement candidates.

Counts below are static source sites, measured with the installed Babel JSX parser
and PostCSS. Each opening/self-closing JSX element is counted once, including both
conditional branches; a mapped row is counted once regardless of rendered record
count. Fragments, React/router/app component invocations, and provider wrappers are
excluded from the HTML/Ionic columns. `IonReactRouter` is included as Ionic. Class
sites count `className` and `cssClass` attributes, including dynamic expressions;
they are not counts of unique classes or defects. Parent counts exclude markup
owned by child components.

| Measure | Current source |
| --- | ---: |
| HTML element sites | 146 |
| Ionic element sites | 76 |
| Class attribute sites | 84 |
| React inline `style` attribute sites | 0 |
| Custom `.card` container sites | 9 |
| Native `<button>` sites | 7 |
| Native `<details>` / `<summary>` pairs | 4 |
| Native input sites | 3: two date/time, one file |
| Application stylesheet | 175 non-trailing-blank lines |
| CSS rules / declarations | 154 / 456 |
| Distinct class selectors in application CSS | 62 |

CSS counts include theme variables, media-query rules, Ionic customization, native
control styling, and layout. They do not establish that 154 rules are unnecessary.
Similarly, the HTML count includes 40 paragraph sites and ordinary headings/spans;
there is no meaningful adoption percentage based on tag counts alone.

## Component-by-component inventory

Burden is a qualitative assessment of remaining hand-built visual/interaction
primitives, not component complexity. Links point to source; counts describe the
baseline above and will drift after implementation.

| Component | HTML / Ionic / class sites | Remaining custom presentation | Mapping and disposition | Burden |
| --- | --- | --- | --- | --- |
| [`Page`](../src/App.tsx#L60) | 6 / 12 / 4 | Page-width wrapper, inline error box and native Dismiss button; toolbar title width calculations | Keep `main.page-body`; replace Dismiss with `IonButton`. Share inline error presentation. Review title spacing within existing `IonToolbar`/`IonButtons`; keep measured safe-area handling. | Low |
| [`App`](../src/App.tsx#L81) | 2 / 15 / 2 | Account-sheet content wrapper, modal size/title adjustments | Shell, tabs, routing, modal, toolbar and buttons already Ionic. Keep root ownership and sheet geometry; give shared account content explicit page/sheet presentation rather than relying on ancestor CSS to strip its card. | Low |
| [`AccountButton`](../src/AccountButton.tsx#L5) | 2 / 9 / 4 | Positioned status/count badges and initials/icon composition | Already `IonButton` + `IonAvatar` + `IonBadge` + `IonSpinner`. Retain custom badge positioning and status logic; no single Ionic component represents this composite. | Low; justified custom layout |
| [`AccountPanel`](../src/CloudPanel.tsx#L82) | 19 / 3 / 11 | Custom card, paragraph rhythm, action row, repeated conflict sections with borders | Use an Ionic card/group for the page presentation; plain content in the sheet. Keep `IonButton` actions and wrapping layout. Conflict comparisons can remain labeled semantic sections with a shared border or become a list of non-clickable items; do not force long comparisons into compact rows. | Medium |
| [`ImportPanel`](../src/ImportPanel.tsx#L6) | 13 / 1 / 3 | Border/stack wrapper, native file field, review disclosure and text list, inline feedback | Retain native file input and semantic review `ul/li`. Adopt `IonAccordionGroup`/`IonAccordion` for review disclosure, consistent section spacing, and shared feedback presentation. Existing apply button already Ionic. | Medium |
| [`Notifications`](../src/Notifications.tsx#L13) | 0 / 1 / 1 | Toast colors, radius and touch-target parts; custom timing/queue/pause policy | Already `IonToast`. Retain styling and application coordinator; a stock duration does not replace paused Undo expiry or exact callback ownership. | Low; complete adoption |
| [`SessionRow`](../src/Screens.tsx#L10) | 8 / 0 / 5 | Native button acting as a list row, custom separators and responsive three-column summary | Prefer `IonItem button detail={false}` inside `IonList`; retain an inner grid for date/time/duration/estimate. Ionic owns the interaction, row surface and separators. Keep full-row accessible activation and focus restoration. | High |
| [`SessionList`](../src/Screens.tsx#L21) | 1 / 0 / 1 | Hand-built list surface and rounded clipping | Replace wrapper with `IonList`, with one shared list presentation. Coordinate separator/inset ownership with `SessionRow`; remove duplicated row borders. | Medium; shared dependency |
| [`PeriodList`](../src/Screens.tsx#L26) | 8 / 0 / 6 | Recursive native disclosures, handmade chevrons, separators and aggregate summary layout | Use nested `IonAccordionGroup`/`IonAccordion`, conventional Ionic item headers, stable period values and `multiple` behavior. Retain aggregate summary layout and nesting indentation. Treat expansion persistence and nested events as behavior work. | High |
| [`Charging`](../src/Screens.tsx#L35) | 17 / 2 / 14 | Two custom card surfaces; five native button sites; timer, estimates, active/idle geometry and secondary-action reserve; native confirmation | Use `IonCard`/content for tile and recent surface, `IonButton` for standard actions, shared Ionic session row for last charge, and `IonAlert` for cancellation confirmation. Retain timer typography, symbol, inner layout and stable primary-action position. | High |
| [`History`](../src/Screens.tsx#L68) | 6 / 0 / 3 | Month sections/headings, custom empty state and list surface via `SessionList` | Keep semantic month sections; use Ionic list/group headers where they preserve heading navigation, plus shared Ionic rows. Empty-state text/layout can stay HTML; no dedicated Ionic empty-state component is needed. | Medium; mostly shared work |
| [`Statistics`](../src/Screens.tsx#L77) | 27 / 5 / 5 | Three custom card sites across conditional views; metric grids, averages and recursive period container | Keep existing Ionic segment. Use standardized Ionic surfaces for overview/averages, accordion groups for periods, and shared session lists. Retain CSS metric grid and numeric typography; no Ionic energy/cost metric component exists. | High |
| [`SettingsScreen`](../src/Screens.tsx#L99) | 0 / 0 / 0 | Composition only | Keep composition; benefits from account/settings children. Avoid adding another layout/surface wrapper without a need. | None |
| [`SessionEditor`](../src/SessionEditor.tsx#L8) | 11 / 17 / 10 | Native date fields; assumptions disclosure; inline error; sheet geometry; native cancellation confirmation in handler | Keep native dates, form and existing Ionic numeric fields/sheet/actions. Convert assumptions disclosure to Ionic accordion and cancellation to shared `IonAlert`; retain validation-driven opening and focus. Share error presentation. | Medium; behavior-sensitive |
| [`SettingsPanel`](../src/SettingsPanel.tsx#L9) | 25 / 11 / 15 | Three custom card sections, sibling-margin stack, arbitrary divider, import disclosure, app-update callout and several spacing overrides | Use compact Ionic groups/lists for row-like settings; Ionic card/header/content for prose-heavy sections. Standardize import accordion and spacing. Keep long explanatory text outside compact rows, and keep a simple section border where it fits. Inputs/actions already Ionic. | High |

[`main.tsx`](../src/main.tsx) is the ninth TSX file and only mounts `App` under
`StrictMode`, imports Ionic base CSS, and configures iOS mode/reduced motion. It has
no custom UI of its own. Its import order and reset policy matter to the CSS plan.

## Mapping decisions and boundaries

### Standard components to finish adopting

1. **Surfaces:** use the `IonCard` family for actual cards; use `IonList` and
   `IonItemGroup` for compact grouped rows. A section does not automatically need
   a card. Preserve meaningful headings/labels when changing containers. Set card
   margins and content padding deliberately so Ionic defaults do not add to old
   `.card` padding. Do not make a whole card clickable when it contains buttons.
2. **Actions:** migrate all seven native button sites: Page Dismiss, session row,
   Start/Stop, Cancel, Correct timestamps, manual add, and recent delete. Six map
   to `IonButton`; the repeated session-row template maps to `IonItem button`.
   Keep recent delete separate from the clickable session row to avoid nested
   interactive controls. Preserve disabled states, names and focus behavior.
3. **Disclosures:** four source sites map to Ionic accordions: settings import,
   import record review, session assumptions, and recursive statistics periods.
   Nested period groups should permit independent expansion. Keep stable values
   through session edits and tab switches. Filter group change events to ignore
   bubbled changes from child controls/groups. Validation must open assumptions
   before reporting/focusing an invalid field.
4. **Confirmations:** two `window.confirm` sites, in Charging and SessionEditor,
   map to a shared Ionic alert flow. Preserve the one-minute threshold and
   immediate short-charge cancellation. Alert confirmation is asynchronous:
   guard repeated taps, handle dismissal as cancel, and ensure a cancelled alert
   cannot save/delete anything. Keep the editor's write/dismissal protection.

These mappings are supported by the installed Ionic **9.0.8** component types and
source: card composition, item `button`/`detail`/`lines`, accordion group
`multiple`/`value`, and alert buttons/overlay lifecycle. Public documentation for
[items](https://ionicframework.com/docs/api/item) also cautions against nested
interactive controls and packing long prose into list rows.

### Custom presentation to retain deliberately

| Application responsibility | Keep / constrain |
| --- | --- |
| Page width and responsive layout | Keep `.page-body` max width/gutters, metric grid, history summary grid and narrow-screen reflow. Ionic grid is available but adds no clear value over these small CSS grids. |
| Charging presentation | Keep timer sizing, tabular numerals, symbol treatment and stable action positioning. Put layout on content/inner elements rather than reproducing card chrome. |
| Account status | Keep badge offsets, icon/initial composition and count layout on Ionic primitives. |
| Spacing | Use a short shared spacing scale and container `gap`. Each gap has one owner: page groups, card content, field groups or actions. Avoid mixing sibling margins, Ionic margins and container gaps for the same boundary. |
| Arbitrary section borders | Keep a scoped border rule or semantic separator where useful. `IonItemDivider` is for separating groups of list items, not every horizontal line. |
| Native file control | Keep labeled `<input type="file">`; installed `IonInput` text-field types do not include file. Retain accept filter, disabled state, reset-to-allow-reselection and size/error handling. |
| Native date/time controls | Keep two `datetime-local` fields and scoped browser adjustments. `IonInput` does support `datetime-local` in this version, and `IonDatetime` exists, but neither is required: approved native picker behavior, second precision, timezone/DST validation and modal focus take priority. |
| Errors and explanatory copy | Keep semantic paragraphs, headings and persistent inline error/status regions. A small shared error component may contain an `IonButton`; do not replace field/import/conflict context with transient alerts/toasts merely to increase Ionic usage. `IonNote` fits supporting field/list text where appropriate. |
| Platform integration | Keep modal dimensions, measured safe-area recovery, viewport bounds and toast positioning. Review supported Ionic properties first, but do not remove tested WebKit accommodations without reproducing and resolving the original issue. |
| Application behavior | Keep sync ownership, offline storage, timers, validation, Undo coordination, domain calculations and update deferral independent of visual components. |

Ionic explicitly supports [CSS utilities on ordinary elements](https://ionicframework.com/docs/layout/css-utilities)
and [theming via variables and Shadow Parts](https://ionicframework.com/docs/theming/basics).
Its [item divider](https://ionicframework.com/docs/api/item-divider) has a specific
list-group purpose. These are boundaries for the proposed CSS layer, rather than
reasons to remove all HTML or all CSS.

## Stylesheet findings

| Current CSS area | Finding | Planned treatment |
| --- | --- | --- |
| `.card`, `.history-list`, `.session-row` borders/surfaces | Duplicates Ionic card/list primitives; nine custom card sites and a shared list/row implementation | Replace chrome with Ionic surfaces, set shared theme defaults, keep only content layout. |
| Global `button` rules, `.primary`, `.stop`, `.danger`, `.icon-button`, `.manual-button` | A parallel button system alongside `ion-button` | Move appearance to Ionic color/variant properties and shared button theme. Retain feature-specific width/placement rules. Scope native fallback styles if any remain. |
| `.stack`, `.divider`, `.actions`, `.settings-action`, `.app-updates`, `.settings-update` | Multiple spacing mechanisms: sibling top margins, explicit margins, flex gaps, nested margin resets and divider padding | Establish one spacing scale and one owner per boundary; use gap-based section/action layouts. Keep a minimal callout/section-border style if no standard component fits. |
| `.settings-fields` and Ionic button/input/toolbar parts | Mostly legitimate theming and target-size adjustments | Retain supported custom properties/parts; consolidate duplicate declarations. Check actual label/value geometry and wrapping before removing overrides. |
| `.period-*` and global `summary` | Custom disclosure chrome and interactive styling | Move chevrons, activation and expansion to accordions; retain summary alignment and hierarchy indentation. Remove global summary rules once all disclosures migrate. |
| `.metrics`, `.session-*`, `.timer`, `.charge-*` | Mixes valuable application layout with duplicated component styling | Keep layout/numeric rhythm; remove surface/action decoration after replacements. |
| Toolbar title width rules with `:has(...)`, sheet title padding | Hardcoded reservations depend on which actions are present | Review title/action layout as one unit, across header variants. Simplify only after narrow-screen/large-text checks confirm centered sheet titles and unobscured actions. |
| `.sheet-body .card` | Ancestor selector removes account-card border/background/padding in a sheet | Make account content presentation explicit; avoid building a card and then undoing it in another context. |
| `.safe-area-probe`, header inset, modal sizing, `.sheet-body` bottom inset | Deliberate platform accommodations, not redundant card CSS | Retain as a small platform layer; ensure only one owner per inset. |
| Global heading/paragraph resets, focus styles, dark/reduced-motion/forced-colors rules | Cross-cutting styling remains necessary but uses HTML-specific selectors in places | Audit resulting Ionic heading roles/focus parts and forced-color boundaries as tags change. Preserve accessible heading levels; the installed `IonCardTitle` defaults to heading level 2, whereas Charging currently uses `h1`. |
| `.year`, `.signin` | No class usages found in current `src` source | Remove if still unused at implementation time; do not confuse the data field/segment value `year(s)` with a class reference. |
| Tailwind imports | Theme/utilities imported; current TSX class attributes use application classes rather than Tailwind utility layouts | Decide explicitly whether to retain for future layout. Removal is optional dependency/build cleanup after a full usage/config search; it is not necessary for Ionic adoption. Do not reintroduce Tailwind preflight. |

### Charging bottom-space investigation

The source at [`styles.css`](../src/styles.css#L59) establishes several independent
contributors: `.card` has 16px bottom margin; `.charging-tile` has 20px bottom
padding; `.charge-secondary` reserves at least 60px; the manual-add button then has
22px bottom margin. The secondary reserve sits below Start/Stop, so reducing it
need not move the primary control. Heading/estimate/start blocks above the control
also reserve height and contribute to the stable-action requirement.

This is a plausible explanation for the reported appearance, not a rendered
diagnosis. Measure the card bounds, secondary content, following button and primary
action in idle/active states before changing values. Merely switching to `IonCard`
can add new default margins/padding and worsen it. The desired outcome is a stable
primary action with intentional space below it, not accidental cumulative reserves.

## High-level implementation sequence

Each phase should be independently reviewable. Relative sizes describe UI work,
not estimates in hours or commitments to a redesigned screen.

| Phase | Scope and dependency | Size | Completion evidence |
| --- | --- | --- | --- |
| 1. Establish shared rules | Define palette/spacing ownership; choose compact settings group versus card composition. Record baseline screenshots/geometry for key states. Introduce only thin shared compositions for recurring surfaces, section/action spacing and inline feedback. Preserve existing shell and native fields. | Small–medium | Agreed examples for a settings group, prose card, row and Charging tile; documented theme/layout/platform/native CSS responsibilities. No new generic component framework. |
| 2. Settings and shared account/import presentation | Apply surfaces/grouping and spacing to SettingsPanel, AccountPanel and ImportPanel. Keep existing Ionic fields/buttons. Separate account content from page/sheet surface ownership. Convert import/review disclosures. | Medium | Settings reads consistently without `.card.stack` or margin-reset patches; account content fits page and sheet; review/export/import/update/storage actions retain behavior. |
| 3. Charging and ordinary actions | Standardize tile/recent surfaces and all remaining ordinary buttons, including Page Dismiss. Keep timer/grid layout. Measure and fix lower spacing. Introduce shared cancellation alert used by Charging and editor. | Medium | Stable Start/Stop position, intentional secondary spacing, consistent button states, correct threshold/confirmation/Undo behavior. No duplicate or nested interactive actions. |
| 4. Shared history row/list | Convert SessionList/SessionRow together; adopt from History, recent charge and Statistics. Keep responsive summary grid and month semantics. | Medium | Ionic owns row interaction/separators; date/time/estimate alignment remains readable at 320px and large text; editing restores focus and scroll in every consumer. |
| 5. Remaining accordions and statistics surfaces | Standardize Statistics cards and recursive periods; migrate editor assumptions. Preserve independently open periods, drafts and validation disclosure behavior. | Medium–large | Expansion survives edits/tab switches; nested events do not toggle the wrong level; invalid collapsed fields become visible/focused. Aggregate values and period membership unchanged. |
| 6. Remove superseded CSS and verify | Remove migrated card/button/disclosure chrome, unused rules and stale overrides. Consolidate theme, layout, platform and native-field styles into clear sections (separate files only if helpful). Update migration notes and evidence. | Small–medium | No parallel standard card/button system; remaining custom rules have clear owners. Final build/regressions pass; physical-device results distinguished from browser results. |

Phases 4 and 5 are the most behavior-sensitive because the same row and recursive
disclosures appear in several retained views. Adopt shared components at their
common source rather than patching each screen separately. Keep data-model,
database, sync protocol and dependency upgrades outside this visual migration.

## Validation and acceptance criteria for implementation

The existing browser suites contain useful behavior assertions, but several use
`.session-row`, `details`, `summary` or `.period-block` selectors. Update those to
the intended accessible interaction/stable feature hooks when markup changes;
retain the behavioral assertions rather than deleting tests to accommodate tags.

- Run `npm run build`, `npm test`, and the relevant existing Playwright checks
  during each implementation slice. Run the full browser suite for final acceptance.
  A documentation-only audit does not justify rerunning the application suite.
- Verify idle/active/long-running Charging geometry, under-one-minute discard,
  cancellation on both sides of the threshold, alert cancel/confirm/repeated taps,
  recent expiry/delete and Undo. Add a focused lower-spacing assertion once the
  desired bounds are established; existing tests check primary-control stability
  but do not establish the desired lower whitespace.
- Preserve numeric precision/range/native validity, zero rate, session-specific
  assumptions, unchanged defaults, opening invalid collapsed fields, deliberate
  date-picker activation, DST validation, sheet dismissal/write lock and focus return.
- Preserve grouped History ordering, year/month totals, local-start-date membership,
  multi-open nested statistics, expanded state after editing, retained tab scroll
  and Settings drafts. Ensure nested accordion change events are isolated.
- Exercise account page/sheet, offline/auth/pending/error/conflict states, long
  identities/conflict text, import review and pre-import backup, storage actions,
  service-worker update discovery/deferral, and queued/paused Undo toasts.
- Check 320px and normal phone widths, desktop max width, 24px root text, long
  labels/values, dark mode, forced colors, reduced motion, keyboard activation,
  heading navigation, visible focus and at least 44px action targets. Check Ionic
  Shadow Parts rather than assuming global HTML selectors style internal controls.
- Verify real iPhone Safari and installed-PWA safe areas, landscape, warm reload,
  keyboard/date picker, scroll/drag dismissal and VoiceOver. Browser simulation
  alone does not verify these platform interactions.

Completion means standard primitives use Ionic consistently, custom layout is
scoped and explainable, and the current offline/recovery behavior survives. It
does not mean zero CSS, zero native elements, or every paragraph becoming IonText.

## Evidence and references

- App source: [shell](../src/App.tsx), [screens and shared rows](../src/Screens.tsx),
  [settings](../src/SettingsPanel.tsx), [account/sync](../src/CloudPanel.tsx),
  [account badge](../src/AccountButton.tsx), [import](../src/ImportPanel.tsx),
  [editor](../src/SessionEditor.tsx), [notifications](../src/Notifications.tsx),
  [mount/CSS imports](../src/main.tsx), [styles](../src/styles.css),
  [safe-area policy](../src/useSafeArea.ts), [pinned versions](../package.json).
- Prior intent: [library decision](mobile-ui-library-decision.md),
  [implementation and follow-ups](mobile-ui-implementation.md). These documents
  contain historical states; the current source governs this inventory.
- Existing acceptance behavior: [mobile browser tests](../tests/browser/mobile.spec.ts),
  [offline browser tests](../tests/browser/offline.spec.ts).
- Installed API verification: `node_modules/@ionic/core/dist/types/components/`
  (`card`, `item`, `accordion-group`, `alert`), `dist/types/interface.d.ts`
  (`TextFieldTypes`), and `dist/collection/components/card-title/card-title.js`.
  These are version-specific evidence, not committed dependencies. Some public API
  pages returned access errors during the audit; corresponding mappings were
  verified from the pinned installed package instead of inferred from search snippets.


## Completion evidence — October 17, 2026

All six phases are complete in the local checkout. The pre-existing audit and its
README link were preserved. No deployment or publishing was performed. Package
versions/lockfile, database, domain, sync and API/protocol modules are unchanged.

| Phase | Final implementation and evidence |
| --- | --- |
| 1. Shared rules | `UI.tsx` contains thin Ionic card/content, disclosure, persistent inline feedback and cancellation compositions. CSS separates theme, shell, content layouts, native controls and platform accommodations. Shared gaps own section/action spacing; Ionic margins are explicitly controlled. |
| 2. Settings/account/import | Settings uses Ionic card/content for explanatory groups and the existing compact Ionic list/input group for defaults. Import and record review use nested accordions with change-event filtering. Account page owns a card; the sheet renders plain semantic content with no ancestor rule undoing a card. Conflict comparisons remain readable prose. |
| 3. Charging/actions | All ordinary actions use IonButton. Both cancellation paths use the same asynchronous IonAlert policy, retaining the exact one-minute threshold, immediate shorter cancellation, existing deletion/Undo operations and editor write protection. Repeated requests are guarded before React renders disabled controls. Dismissal returns focus after React and Ionic reenable the native control. |
| 4. Shared lists/rows | History, recent charge and Statistics share IonList/IonItem button rows. Ionic owns row interaction and separators; the application owns the responsive date/time/duration/estimate grid. Recent delete remains a separate action. Editor dismissal focuses the Ionic opener's native button. Month sections and semantic headings remain. |
| 5. Accordions/statistics | Recursive groups use `multiple`, stable period values and event-target filtering; independently expanded years/months survive edits, tab switches and Overview/By year switches. Editor assumptions use an accordion; invalid collapsed numeric fields are revealed before focus/reportValidity. Statistics overview/averages use Ionic card/content surfaces. |
| 6. Cleanup/validation | Removed the custom card, native button and disclosure/chevron systems, dead `.year`/`.signin` rules, `.stack` sibling margins and the sheet-card stripping override. Updated browser selectors to Ionic interaction roles and stable period hooks. All final checks below pass. |

Source checks find **zero native button sites, zero native details/summary pairs,
zero `window.confirm` calls and zero `.card` container sites**. The approved three
native inputs remain: two datetime-local fields and one file input. Remaining
HTML and CSS implement semantics, responsive layouts, typography, spacing, account
badge composition, inline feedback and platform/native-control accommodations.
Tailwind theme/utilities remain available without preflight; dependency cleanup
was deliberately excluded from this visual migration.

### Measured Charging layout

Chromium, 390 × 844 viewport, default 16px root text. Coordinates are CSS pixels.
Baseline screenshots were taken before source edits against the local production
preview. Final geometry is saved in `.local/ionic-adoption-geometry.json`; baseline
and final idle/active screenshots use `.local/ionic-baseline-*.png` and
`.local/ionic-final-*.png` respectively. These are ignored local review artifacts.

| Measurement | Before | Final idle / active |
| --- | ---: | ---: |
| Card top / height | 74 / 474.375 | 74 / 455.75 |
| Primary control top / height | 409.375 / 58 | 407.75 / 58 |
| Card space below primary control | 81 | 64 |
| Secondary content reserve | 60 | 44, plus an explicit 8px gap |
| Following manual action gap | 16 | 16 |

The card is 18.625px shorter. Lower content now has one explicit gap, a 44px
secondary reserve and 12px bottom padding. Ionic button defaults no longer add
incidental margins. The primary control moves by about 1.6px relative to the old
surface, and its idle/active positions are identical. Tests also cover 320px with
24px root text, desktop width, and a 100-hour active timer (subpixel layout
rounding is allowed below 1px). The timer's minimum responsive size was adjusted
to avoid wrapping at enlarged text; this fixes a measured source-baseline layout
risk while retaining tabular numerals and the existing maximum size.

### Validation and actual coverage

- `npm run build`: browser and Worker TypeScript checks, Vite and Workbox succeed.
  Final main JS: 1,549.89 kB raw / 360.01 kB gzip; CSS: 28.90 / 7.07 kB. Workbox
  precaches 19 entries / 1,599.13 KiB. Vite's existing large-chunk warning remains.
- `npm test`: **75 unit/integration tests pass**, including IndexedDB/D1 persistence,
  sync/conflict handling, upload ordering, restoration and short-charge recovery.
- `npx playwright test --workers=1 --reporter=list`: **22 browser tests pass**
  against the production build in local Windows Chromium.
- Browser coverage includes 390px/320px phones, 1100px desktop, 24px root text,
  dark mode, reduced motion, forced colors, keyboard focus visibility, native
  field bounds and DST validity, centered editor titles, numeric precision/range
  and zero rate, assumption overrides and discarded drafts, invalid collapsed
  fields, Escape/backdrop/swipe sheet dismissal, focus return, short Stop/Cancel
  and Undo, threshold cancellation/Keep charging/Escape/repeated taps, preserved
  editor drafts after alert cancellation, and measured stable primary controls.
- Nested statistics checks retain multiple open years and sibling months after
  edits, navigation and segment switching. Existing ordering, start-date period
  membership, aggregate calculations, History scroll and Settings drafts pass.
- Account page/sheet, long identities and conflict comparisons at dark enlarged
  320px, offline/auth/pending states, paused Undo notifications, nested import
  review/pre-import backup/export/reimport, offline recording/relaunch/edit,
  update discovery/deferral/multi-window activation and simulated safe-area
  recovery remain covered. Conflict resolution correctness is also covered by
  the unchanged sync tests; no live production account was modified for testing.
- Visual inspection included final idle/active Charging, Settings, and the browser
  suite's narrow dark/enlarged History/Statistics and account evidence. No layout
  performance or physical touch-fidelity claim is made.

Two installed-Ionic details required explicit integration treatment: IonCard
forwards aria-label to an internal generic element, so named region semantics now
live on IonCardContent; Ionic controls can update their native disabled state
one rendering step after React, so cancellation focus return waits for both.
Semantic h1/h2/h3 headings are retained instead of changing their levels through
IonCardTitle defaults.

**Coverage adjustment:** the audit requested physical iPhone Safari and installed-PWA
verification. As authorized for this local implementation, those checks remain a
later owner device evaluation. This run used Chromium only, including emulated
viewports and synthetic touch/inset events. Real Safari/WebKit, iOS software
pickers/keyboards, rubber-band pull-to-refresh, VoiceOver, notch/landscape and warm
reload behavior on hardware have not been verified. Browser simulations do not
establish those results and do not block this local delivery.


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
