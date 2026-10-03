# Peerly Collab design plan

## Visual system

- Brand palette: `navy-900` for page backgrounds, `navy-800` for primary actions, `navy-700` for raised navy panels, and white for cards and inverse actions. Supporting text uses explicit white/navy opacity tokens. The only non-brand hues are muted feedback tokens reserved for labeled answer/status states.
- Spacing follows an 8px base scale: 8, 16, 24, 32, 48, 64, 80, and 96px. Components keep 8–24px internal gaps; section padding grows from 64px mobile to 96px desktop.
- Typography uses self-hosted Outfit for display and Inter for body. Body copy is 16px mobile and 18px desktop at 1.6 line height. Headlines use fluid `clamp()` sizing, tight 1.05 leading, and slightly negative tracking. Paragraphs stay at or below 65ch.
- Controls are at least 44px high. Cards use 16–24px radii, quiet borders, and navy-tinted shadows. Focus rings invert for the surface beneath them. Motion is brief and reduced when the user prefers less motion.

## Page layouts

- Landing page: a sticky, blurred navy header with a compact mobile menu; a spacious two-column navy hero with restrained pinstripes, prominent copy and a CSS-built interactive-looking quiz preview; a white quiz-mode chip strip; four white feature cards; a deep navy two-track instructor/student explainer; a white-on-navy closing call to action; and a simple navy footer.
- Role choice: full-height navy canvas with a large stripe fade kept behind the content, centered white panel, two equal selectable role cards, mode-aware heading, back link, and a full-width Continue action on narrow screens.
- Signup/signin placeholders: same navy/white shell, short heading and explanation, with a return-to-role path when no session role intent exists.
- Design gallery: a developer-only route on the same visual system showing every shared component, states, focus/disabled treatments, and responsive examples. Unknown paths use a composed 404 page with a clear home action.

## In-app shell and page structure

- Signed-in screens use a deep navy header with a subtle, fading white pinstripe, a white Peerly Collab logo, and a keyboard-operable account menu. The menu trigger includes an avatar ring, truncated name, readable role badge, and chevron; the menu starts with the account identity, then Profile and Sign out.
- `PageHeader` provides a reusable full-width navy band with masked stripes, an eyebrow badge, one page title, subtitle, and optional primary action. On narrow screens the action becomes full-width beneath the heading.
- The main content uses a white rounded panel that overlaps the page-header band by approximately 32px. Center it around 1120px with 16px mobile and 32px desktop gutters. Keep 1920px layouts purposeful by allowing content to grow to a comfortable max width.
- Dashboard hierarchy: page header, `StatRow` of honest zero/placeholder values, then a titled content section and a helpful `EmptyState`. Do not render fake counts or dead links. Instructor creation remains visibly disabled and labelled “Coming soon” until functional.
- Profile uses a `PageHeader` and `SectionCard` groups for personal details and account access; email and role stay read-only where appropriate.
- Auth and role-choice pages retain their established behavior and navy stripe canvas, while using consistent card radii, icon-led controls, clear validation, focus, disabled, and loading states.
- The 404 and loading states use the same navy identity, white panels, readable labels, and visible progress feedback.

## Shared component guide

Use `PageHeader` for page identity and a single optional page-level action. Use `EmptyState` when a list has no content; its stacked-card stripe illustration is decorative and hidden from assistive technology. Use `StatTile` and `StatRow` only for real or explicitly zero/placeholder metrics. Use `SectionCard` to group related form fields or content and `DataCard` for concise list items with title, metadata, optional badge, and real trailing actions.

`DropdownMenu` is the shared pattern for account and item menus; it supports Arrow keys, Home/End, Escape, and focus return. `Dialog` is for focused decisions and forms, with a labelled title, optional description, focus containment, Escape dismissal, and scroll lock. `ConfirmDialog` is for consequential in-app actions and can require exact text entry. `ToastProvider` exposes short success/error/info messages with a visible status label, icon, live announcement, manual dismiss, and timed dismissal. `Tooltip` is supplementary only; do not hide required instructions in it.

Use `Textarea`, `Select`, `Switch`, `Checkbox`, `RadioGroup`, `SegmentedControl`, and `Tabs` for their corresponding native form/selection patterns. Each control keeps label, hint, and error content associated. `Toolbar` combines a labelled search field and supplied filters; `DataCard` is the preferred reusable list-row surface. All controls keep 44px minimum touch targets, navy/white focus rings, and reduced-motion support.

The developer-only `/design` gallery demonstrates these components, disabled/error/loading/focus states, and responsive behavior. Sample list values there are illustrative only and must not be mistaken for live product data.

## Responsive and accessibility rules

- Use a 12-column desktop content grid capped near 1200px, collapse hero and paired content to one column at tablet/mobile widths, and preserve 24px side gutters down to 360px.
- Keep stripes decorative and away from paragraph text; content sits on solid panels. Use semantic landmarks, one page-level heading, a skip link, labeled controls, keyboard-operable radio selection, and non-color status cues.
- Verify 360px, 768px, and 1280px layouts in a browser when available, checking for horizontal overflow and alignment.
- See [the contrast report](./contrast-report.md) for measured WCAG ratios across text, surface, and feedback token pairs.

## Quiz authoring UX
- Use quick create for the required title, quiz type, and class, then open the Questions workspace.
- Organize authoring into Questions, Settings, and Preview with title and description in the workspace header.
- Save edits automatically with an explicit status and retry path. Keep incomplete questions visible but out of counts and publishing.
- Present plain-language presets before detailed settings, and keep the student experience summary live.
- Provide a live publish checklist, class context, breadcrumbs, and a back action that returns to the originating class or quiz list.
- Favor undo for low-risk question deletion and keyboard-first question entry.

