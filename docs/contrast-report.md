# Contrast report

Updated 2026-10-03 for the in-app shell, PageHeader, form controls, dialogs, menus and empty states. Ratios use the WCAG 2.x relative-luminance formula and alpha-composite opacity tokens against the stated surface. Normal-size text passes AA at 4.5:1; the large-text threshold is 3:1.

| Foreground / background | Contrast | Result |
| --- | ---: | --- |
| White / navy-900 | 17.23:1 | AAA |
| White / navy-800 | 16.52:1 | AAA |
| White / navy-700 | 13.71:1 | AAA |
| Navy-900 / white | 17.23:1 | AAA |
| White at 72% / navy-900 | 9.14:1 | AAA |
| White at 55% / navy-900 | 5.74:1 | AA |
| Navy-800 at 72% / white (hints and supporting copy on content panels) | 7.36:1 | AAA |
| White at 72% / navy-900 (page-header and shell supporting copy) | 8.97:1 | AAA |
| White / navy-700 (account trigger and raised navy panels) | 13.71:1 | AAA |
| Navy-700 / white (visible focus ring on light surfaces) | 13.71:1 | AAA |
| White / navy-900 (inverse focus ring on navy surfaces) | 17.23:1 | AAA |
| Success text / success surface | 6.66:1 | AA |
| Warning text / warning surface | 6.23:1 | AA |
| Error text / error surface | 6.79:1 | AA |

Feedback states also pair each color with an icon and a visible text label. The muted functional tokens remain reserved for labeled feedback; the rest of the interface uses navy and white. Opacity tints are used for surface fills, separators and decorative stripes, not body text. Decorative stripes are hidden from assistive technology and are not used to communicate state. Focus rings use solid navy on white and white on navy.
