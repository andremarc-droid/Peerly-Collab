# Contrast report

Updated 2026-10-03 for the app shell, tinted panels, raised cards, shared data tables, dialogs, menus and feedback states. Ratios use the WCAG 2.x relative-luminance formula and alpha-composite opacity tokens against the stated surface. Normal-size text passes AA at 4.5:1; the large-text threshold is 3:1. Decorative stripe masks remain behind text; the white stripe token is 50% opacity and is never used to convey state.

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
| Navy-900 / navy-700 at 5% over white (tinted app panel) | 15.59:1 | AAA |
| Navy-800 at 72% / navy-700 at 5% over white (secondary content on panel) | 6.96:1 | AA |
| Navy-900 / white (raised card text on white) | 17.23:1 | AAA |
| White / navy-900 (inverse focus ring on navy surfaces) | 17.23:1 | AAA |
| Success text / success surface | 6.66:1 | AA |
| Warning text / warning surface | 6.23:1 | AA |
| Error text / error surface | 6.79:1 | AA |
| Canvas card title (navy-900) / card fill | 17.23:1 | AAA |
| Canvas note card text (navy-900-88) / note fill | 11.45:1 | AAA |
| Canvas link host (navy-800) / white | 16.52:1 | AAA |
| Canvas edge badge correct / success-bg | 6.66:1 | AA |
| Canvas edge badge wrong (danger-text) / danger-bg | 7.48:1 | AAA |
| Canvas edge badge missed (navy-900) / white | 17.23:1 | AAA |
| Canvas handle dot (navy-900) / card fill | 17.23:1 | AAA (UI component) |
| Canvas minimap node (navy-900) / minimap surface | 17.23:1 | AAA (UI component) |
| Canvas card double focus ring (white inner / navy-800 outer) | 16.52:1 | AAA (UI component) |
| Module card title (navy-900) / white | 17.23:1 | AAA |
| Module card meta (navy-800-72) / white | 7.36:1 | AAA |
| Module publish bar title (white) / navy-900 | 17.23:1 | AAA |
| Module publish bar copy (white-72) / navy-900 | 9.14:1 | AAA |
| Resource embed fallback text (navy-800-72) / white | 7.36:1 | AAA |
| Resource embed fallback link (navy-800) / white | 16.52:1 | AAA |

Feedback states also pair each color with an icon and a visible text label. Review mode connection statuses (correct, incorrect, missed) consistently use both an icon and text label in companion lists and board edge badges. The muted functional tokens remain reserved for labeled feedback; the rest of the interface uses navy and white. Opacity tints are used for surface fills, separators and decorative stripes, not body text. Decorative stripes are hidden from assistive technology and are not used to communicate state. Focus rings use solid navy on white and white on navy.
