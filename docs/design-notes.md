# Cool-lab design plan

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

## Responsive and accessibility rules

- Use a 12-column desktop content grid capped near 1200px, collapse hero and paired content to one column at tablet/mobile widths, and preserve 24px side gutters down to 360px.
- Keep stripes decorative and away from paragraph text; content sits on solid panels. Use semantic landmarks, one page-level heading, a skip link, labeled controls, keyboard-operable radio selection, and non-color status cues.
- Verify 360px, 768px, and 1280px layouts in a browser when available, checking for horizontal overflow and alignment.
- See [the contrast report](./contrast-report.md) for measured WCAG ratios across text, surface, and feedback token pairs.
