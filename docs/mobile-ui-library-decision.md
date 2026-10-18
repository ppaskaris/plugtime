# Mobile UI library decision

Research date: October 17, 2026. Decision: **Ionic React**, using its iOS interaction
mode and a restrained PlugTime theme. The user has now approved implementation
under the revisions plan. Local browser testing is sufficient for implementation
acceptance; the user owns final nuanced device testing. Deployment remains separate.

## Decision rationale

PlugTime's highest priority is a coherent iPhone-first application experience:
stable surfaces, direct manipulation, coordinated overlays, scrolling, navigation,
and input. Existing Tailwind code is useful, but minimizing presentation changes
is secondary to delivering that experience.

Ionic offers more of the surrounding mobile application behaviour in one system.
Base UI/shadcn can deliver excellent individual interactions, but PlugTime would
own more of the screen-level coordination. Given this app's small four-screen
scope, replacing its simple presentation shell is an acceptable cost.

This is a project-specific engineering decision. Research did not establish a
universal community consensus or an Apple-endorsed web counterpart to MUI.
Both candidates ultimately render browser UI; neither gives a PWA UIKit controls
or immunity from Safari limitations.

## Research method and limits

- Reviewed the actual app's React 19.3.1, Tailwind 4.3.3, Vite 8, TypeScript 7,
  Dexie, Workbox configuration, shell, editor, sync, and persistence boundaries.
- Examined current official component and navigation documentation, package
  manifests, release notes, and selected upstream issue resolution.
- Read Ionic modal/refresher/navigation pages through a browser where the web
  reader returned 403, including the iOS refresh implementation requirements.
- Opened and visually inspected Ionic's official iOS card-modal example in a
  desktop browser. This demonstrates the shipped surface, not iPhone fidelity.
- Did not install packages, build either candidate, measure transferred bytes,
  benchmark frame rates, test physical gestures, or test a real iPhone/VoiceOver.
  Conclusions about fit and engineering effort are judgments, not benchmark results.
- Direct registry/API requests from the shell failed TLS establishment; no checks
  were bypassed. Published-release pages and source manifests supply version evidence.

## Comparison against PlugTime's requirements

| Requirement | Ionic React | Base UI / shadcn | Assessment |
| --- | --- | --- | --- |
| Coherent mobile screen structure | Page/content/header/tab conventions and coordinated navigation | We compose the viewport shell, screen state, and navigation | Ionic advantage for this project |
| iPhone-oriented visual starting point | iOS component mode, customizable theme | Unstyled primitives or general shadcn styling | Ionic needs less initial visual-system work |
| Sheets as manipulable surfaces | Card/sheet modals, drag events, breakpoints, scroll coordination | Strong Drawer with gestures, snap points, backdrop and indent support | Both credible |
| Pull-to-sync | Dedicated refresher coordinated with scroll content | No equivalent identified in the reviewed component set | Ionic advantage |
| Keyboard and focus | Overlay focus handling and documented PWA keyboard boundaries | Explicit drawer keyboard provider and controllable focus | Both need actual-device validation |
| Tab continuity | Retained views and per-tab navigation stacks | Application owns retention, scroll restoration, and transitions | Ionic advantage, with added conventions |
| Notifications and Undo | Toast actions, swipe dismissal, navigation anchoring | Toast manager, action parts and interactive stacks | Both need app-owned recovery/timing rules |
| Existing Tailwind workflow | Tailwind for our layouts; variables/parts for component internals | Direct styling throughout; close fit to current stack | Base UI advantage |
| Freedom over presentation | Significant within supported theming interfaces | Full control of markup composition and styling | Base UI advantage |
| Integration and future coupling | New page/router/lifecycle conventions | More conventional React composition | Base UI advantage |
| Overall fit at the stated priorities | More of the desired experience is already coordinated | More mobile shell and design work remains ours | Choose Ionic |

These are qualitative judgments; feature presence does not establish an app's quality.

## 1. Surfaces, motion, and scrolling

Ionic's modal has two useful presentations: an iOS card over its presenting
surface, and a bottom sheet with explicit breakpoints. It exposes gesture events
and can coordinate dragging with scrollable content. Include a zero breakpoint
for swipe dismissal; configure scroll expansion intentionally. For our editor,
use a content-sized bottom sheet with a visible backdrop, Close, and the agreed
toolbar icons. Do not add half-height states just because the library supports them.
[Ionic modal](https://ionicframework.com/docs/api/modal)

Base UI's Drawer is substantial. It provides swipe dismissal, snap points, an
optional background indent, and a virtual-keyboard provider. Its docs address
dragging versus text selection and gesture exclusions. It is not merely a styled
container, and we should not dismiss it as such. It could implement our editor well.
[Base UI Drawer](https://base-ui.com/react/components/drawer)

The deciding difference is screen coordination. Ionic's content and navigation
components establish the scroll and view boundaries that its interactions expect.
Base UI supplies a drawer, not a complete tabbed mobile screen architecture. Our
app would coordinate those surrounding pieces. Safe-area padding still needs
care: Ionic Content explicitly does not add it indiscriminately, because headers
and footers can already own it. Avoid double insets and nested body/content scrolling.
[Ionic Content](https://ionicframework.com/docs/api/content)

Pull-to-sync is a core interaction in the agreed design. Ionic's refresher works
with its scroll content; its iOS implementation uses rubber-band scrolling and
falls back on devices without that behaviour. A desktop forced-iOS preview cannot
validate that path. Finish/cancel the indicator on every sync outcome, retain the
explicit Settings action, and test pages shorter than the viewport.
[Ionic Refresher](https://ionicframework.com/docs/api/refresher)

## 2. Navigation and component lifetime

Ionic RouterOutlet retains views and supplies transition behaviour; tabs have their
own stacks. This helps preserve History position and screen context. Top-level
tab changes should not be treated as forward navigation with sliding animations.
Use only the shallow routing needed for our four tabs and editor overlays.
[Ionic React navigation](https://ionicframework.com/docs/react/navigation)

Retained pages are also a cost: leaving a page does not guarantee React unmounts
it. Keep sync, connectivity, notification queues, and database coordination in one
app-level owner. Gate visible-only timers and focus work on view entry/exit, and
reset sheet drafts on each open. Do not accumulate listeners in cached screens.
[Ionic React lifecycle](https://ionicframework.com/docs/react/lifecycle)

A design refinement follows from this model: the global account badge should open
the shared Account & sync content as a sheet over the current tab. Settings uses
the same content in its Account & sync section. This preserves the agreed direct
access while retaining tab context, following Ionic's documented shared-account
pattern. It avoids an unexpected cross-tab navigation when inspecting status.

Base UI does not impose this model, which is an advantage for many conventional
web apps. Here, we would need to choose and implement equivalent retention and
navigation policies ourselves. We currently have no router to preserve or migrate.

## 3. Input, accessibility, and Undo

Neither library resolves our autofocus bug automatically. Preserve deliberate
native date/time picker activation; initially focus Close or the sheet heading.
Keep the native inputs unless device testing demonstrates a reason to replace
them. Selecting Ionic does not require replacing them with IonDatetime.

In a PWA, native keyboard plugins are unavailable. Ionic documents browser keyboard
limitations and Visual Viewport-based detection. Test date pickers as well as text
keyboards; they are not interchangeable. The editor's toolbar must remain usable
when the visible viewport changes, and dismissal must not lose a write in progress.
[Ionic keyboard guidance](https://ionicframework.com/docs/developing/keyboard)

Base UI has a clear accessibility focus and explicit keyboard controls. A reported
iOS drawer-keyboard issue was closed through an implementation change in June
2026; it is not evidence that the current drawer remains broken. Its newer mobile
capabilities deserve testing rather than dismissal based on older reports.
[Base UI accessibility](https://base-ui.com/react/overview/accessibility),
[resolved drawer keyboard issue](https://github.com/mui/base-ui/issues/4301)

Ionic Toast offers actions, swipe dismissal, and anchoring above navigation. Its
announcement does not automatically read the action buttons, so the deletion
message must communicate Undo availability. Library duration alone is insufficient
for our pause/queue/recovery requirements; use one app-owned coordinator and test
timed-action accessibility. Never claim deleting is reversible until the database
restoration path works offline and after sync.
[Ionic Toast](https://ionicframework.com/docs/api/toast)

Base UI also has a capable Toast manager with action parts, stacking, and an Undo
example. Notifications do not distinguish the candidates enough to drive the choice.
Our same-record, revision-safe restoration rules are application responsibilities.
[Base UI Toast](https://base-ui.com/react/components/toast)

## 4. Aesthetics and Tailwind integration

Start from Ionic's iOS mode, with PlugTime's own accent, background hierarchy,
typography, and spacing. This is not a commitment to stock blue controls or to
copying the newest Apple appearance. Its platform mode and theme are configurable.
[Ionic platform styles](https://ionicframework.com/docs/theming/platform-styles)

The intended visual language is a full-height app canvas, anchored navigation,
compact grouped surfaces, clear pressed states, and a foreground sheet that moves
with the user's gesture. Use translucency sparingly for navigation/overlays, with
opaque high-contrast alternatives. Do not reproduce the current vertical stack
of oversized cards inside Ionic tags. Keep the stable charging tile as the main
custom surface and make normal history rows compact.

Tailwind remains useful for our layout and custom session summaries. Component
internals often require Ionic CSS variables and exposed Shadow Parts; arbitrary
descendant utility selectors cannot cross Shadow DOM. Review preflight/global
resets and stylesheet order rather than stacking conflicting global themes. This
is an intentional loss of all-Tailwind uniformity, not a free drop-in replacement.
[Ionic Shadow Parts](https://ionicframework.com/docs/theming/css-shadow-parts)

Base UI is the stronger option for completely custom visuals: no bundled component
CSS, direct composition, and documented Tailwind/Vite/React support. Shadcn supplies
editable component source rather than a ready-made iPhone application system.
That flexibility is valuable, but mobile consistency would be our design and
maintenance obligation across the whole app.
[Base UI background](https://base-ui.com/react/overview/about),
[shadcn introduction](https://ui.shadcn.com/docs)

## 5. Currency, compatibility, and maintenance

This decision uses current evidence, not Ionic's historical reputation. Ionic 9
launched August 19, 2026, including React Router 6 support. The release page returned
9.0.7 dated October 7. Main-branch package versions are not proof of publication.
Use a verified published, pinned v9 patch when implementation starts.
[Ionic 9 announcement](https://ionic.io/blog/announcing-ionic-framework-9),
[published releases](https://github.com/ionic-team/ionic-framework/releases)

The inspected package manifests accept React 18/19 and React Router >=6.4,<7.
PlugTime already uses React 19 and has no router, so no existing router needs
downgrading. Pin matching Ionic React/router packages and a compatible Router 6
release. Confirm the actual install and TypeScript 7 build before considering
compatibility verified. Published browser support lists Safari 16+ for v9.
[React manifest](https://github.com/ionic-team/ionic-framework/blob/main/packages/react/package.json),
[router manifest](https://github.com/ionic-team/ionic-framework/blob/main/packages/react-router/package.json),
[browser support](https://ionicframework.com/docs/reference/browser-support)

Ionic's recent notes include fixes to retained routes, lifecycle dispatch, overlay
sizing, and accessibility. This shows maintenance and highlights integration risks.
Its own announcement acknowledges the long router migration. Treat promises of
React Router 7 and a future modular architecture as roadmap, not available features.
[Ionic release notes](https://ionicframework.com/docs/reference/release-notes)

Base UI is also actively maintained: its release page returned 1.9.0 dated October
9. The docs list Drawer becoming stable in v1.3 and subsequent mobile-keyboard
work. Both candidates have credible current development; raw stars do not settle
quality, actual adoption, or long-term maintenance commitments.
[Base UI releases](https://github.com/mui/base-ui/releases),
[component evolution](https://base-ui.com/react/overview/releases)

Evaluate the current shadcn Base variant, not an old Vaul-based tutorial. The
current drawer docs describe the Base UI migration; Vaul's repository says it is
unmaintained. This is a dependency-level distinction, not a reason to reject all
shadcn components. Neither an unfamiliar niche library nor an agent skill is needed.
[shadcn drawer](https://ui.shadcn.com/docs/components/base/drawer),
[Vaul maintenance notice](https://github.com/emilkowalski/vaul)

## 6. Cost, performance, and offline operation

Ionic is a broader dependency and shell commitment. Base UI can be adopted more
selectively. There is no measured bundle-size or speed winner in this research;
package unpacked size and marketing claims are not usable app benchmarks. Record
the existing production build baseline, then compare initial JS/CSS, offline
precache, route chunks, cold startup, gesture smoothness, and long-list scrolling
on the target iPhone during implementation. Avoid unnecessary blur and transitions.

An Ionic web app does not require Capacitor, a native project, Ionic CLI hosting,
Appflow, or paid services. Keep Vite, the existing PWA plugin, Workbox, Dexie,
the cloud API, and manual deployment. Ensure all imported components, icons, and
any lazy chunks required offline are precached; test a first visit to each tab
after losing connectivity. Preserve exclusions for API/Access navigation.
[Ionic PWA deployment](https://ionicframework.com/docs/deployment/progressive-web-app)

Ionic does not change persistence, calculations, sync leases, conflicts, or data
ownership. Keep those modules independent from Ionic components so future UI
replacement remains possible. Do not add Capacitor keyboard/haptics dependencies
to solve problems in an installed web app.

## Delivery direction and acceptance

Adopt the complete small Ionic shell rather than mixing Ionic overlays with a
second component system. Keep the agreed screen designs and restyle them as one
application. Centralize service lifetimes and notification policy. Retain native
date fields and all offline/recovery semantics.

The first implementation milestone must demonstrate the real shell, editor sheet,
and pull-to-sync working together, before migrating every settings control. Device
acceptance must cover:

- iPhone Safari and standalone PWA, short and long scroll areas, landscape/notch
  insets, repeated sheet opening, backdrop dismissal, and keyboard/picker opening.
- A sheet that follows dragging and settles predictably, without dragging the
  background or fighting its inner scroll region.
- A fixed Start/Stop position, retained History position, compact tab/segment
  layouts, and direct account inspection without losing the current tab.
- Large text, VoiceOver action discovery, adequate icon hit areas, keyboard use,
  reduced motion, dark/high-contrast surfaces, and actionable Undo timing.
- Offline first use of every cached screen, pending mutations, sign-in expiry,
  sync errors, conflicts, Undo after uploaded deletion, and service-worker updates.

If a concrete blocker emerges, document it before revisiting the choice. Ordinary
theming effort is expected; do not silently replace Ionic or mix in another UI stack.
