# Peerly Collab design plan

## Visual system

- Light-first balance: canvas and content areas are white or a light navy tint (3–5% `navy-700-05`). Deep navy is reserved for the top nav bar, a compact `PageHeader` band (max about 160px on desktop, 120px mobile), primary buttons, selected states, icon tiles, and text. Rough visual proportions: ~70% light, ~25% navy, ~5% stripes.
- Decorative stripes: present only inside the `PageHeader` band and hero areas (at most the right 40% of the surface, masked with a gradient, thinner and widely spaced, and never behind text, buttons, tabs, forms, tables, cards, stat tiles, or the class-code panel).
- Brand palette: `navy-900` for chrome and primary text, `navy-800` for primary button fills, `navy-700` for raised elements and focus rings, and white for content surfaces. Supporting text uses `navy-800-72` (>= 4.5:1 AA/AAA contrast). Functional feedback tokens (`success`, `warning`, `error`) are strictly reserved for labeled status indicators and always pair color with an icon and text.
- Spacing follows an 8px base scale: 8, 16, 24, 32, 48, 64, 80, and 96px. Components keep 8–24px internal gaps; section padding grows from 64px mobile to 96px desktop.
- Typography uses self-hosted Outfit for display and Inter for body. Body copy is 16px minimum, metadata 14px, with 1.5–1.6 line height. Headlines use fluid `clamp()` sizing, tight 1.05 leading, and slightly negative tracking. Paragraphs stay at or below 65ch.
- Controls are at least 44px high. Cards use 16–24px radii, quiet borders, and soft navy-tinted shadows. Focus rings invert for the surface beneath them (navy-700 on light, white on navy). Motion is brief and disabled when the user prefers reduced motion.

## Page layouts

- Landing page: a sticky navy header with a compact mobile menu; a spacious two-column hero with restrained pinstripes, prominent copy and interactive-looking quiz preview; white quiz-mode chip strip; four white feature cards; navy two-track explainer; closing call to action; and simple navy footer.
- Role choice: full-height navy canvas with a stripe fade kept behind the content, centered white panel, two selectable role cards, mode-aware heading, back link, and Continue action.
- Signup/signin placeholders: clean shell, short heading and explanation, with return-to-role path when no session role intent exists.
- Design gallery: developer-only route demonstrating shared components, states, focus/disabled treatments, and responsive examples. Unknown paths use a composed 404 page.

## In-app shell and page structure

- Signed-in screens use the solid navy `AppShell` header with Peerly Collab logo and keyboard-operable account menu. Top chrome is free of distracting stripes behind controls.
- `PageHeader` provides a compact navy band (max ~160px desktop, ~120px mobile) with restrained right-masked stripes, eyebrow badge, single page title, subtitle, and optional action. On mobile, the action wraps cleanly beneath the heading.
- The main content sits on a white rounded panel overlapping the header band by approximately 32px, centered near 1120px with 16px mobile and 32px desktop gutters.
- Dashboard hierarchy: compact page header, `StatRow` of honest metrics, then titled content section and helpful `EmptyState`.
- Profile uses a `PageHeader` and `SectionCard` groups for personal details and account access; email and role stay read-only where appropriate.

## Shared component guide

- **Buttons**:
  - On light: primary = navy fill with white text; secondary = white fill with navy text and visible 1px navy-at-30% border (`--color-navy-900-30`); tertiary = navy text link.
  - On navy: primary = white fill with navy text; secondary = transparent fill with 1px white outline and white text. No dark-on-dark variant exists.
- **Tabs**: On light surfaces, inactive tab labels use navy-800-72 (>= 4.5:1) with a visible hover background (`navy-900-12`). Selected tabs use a filled navy-800 background with white text. Count badges use navy-tinted fill with navy text.
- **Stat tiles**: White cards with 1px border and soft shadow. The first tile may be navy-filled, without stripes (the navy stripe pseudo-element is removed).
- **Class-code panel**: A light card where the code is the hero (32–40px monospace, wide letter-spacing) with a primary "Copy code" button. Copy link, Share invite, and Regenerate are secondary. The Joining switch has a visible label and state text ("Open" or "Paused").
- **Empty states**: Flat white card, centered, with NO gradients. Crisp multi-layer card illustration with BookOpenCheck icon, headline, one-sentence description, and one primary button.
- **Alerts**: Neutral white card, left accent bar, icon, bold title, dark-ink body copy (>= 4.5:1), and optional action button. Errors, warnings, and info share one layout.
- **State Exclusivity**: Error and empty states never appear together (enforced via `resolveListStatus`).

## Responsive and accessibility rules

- Use a 12-column desktop content grid capped near 1200px, collapse hero and paired content to one column at tablet/mobile widths, and preserve side gutters down to 360px.
- Stripes are purely decorative, restricted to the right 40% of the header band, and never placed behind text, forms, or controls.
- See [the contrast report](./contrast-report.md) for measured WCAG ratios across text, surface, and feedback token pairs.

## Concept Canvas & Quiz Authoring

- Supported modes: `quiz`, `flashcards`, and `canvas` (locked upon creation).
- Canvas boards: exactly one 'board' question and answer key, up to 50 cards and 80 connections. Directed connections format as `fromId->toId`, undirected as `fromId<->toId` with alphabetically sorted endpoints.
- Student attempt answers are stored as `answers.board: string[]` capped at 80 items. Grading runs client-side in v1.
