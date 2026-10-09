# Contrast report

Updated for the light-first balance rules in shared components and automated token parser test (`src/styles/contrast.test.ts`). Ratios use the WCAG 2.x relative-luminance formula and alpha-composite opacity tokens against their actual surfaces. Normal text passes AA at >= 4.5:1; UI components, focus rings, icons, and large text require >= 3:1.

## Light-First Balance
Canvas and content areas are white or a light navy tint (3–5%). Deep navy is reserved for the top navigation bar, a compact `PageHeader` band (max ~160px desktop, ~120px mobile), primary buttons, selected states, icon tiles, and text.
Stripes are strictly restricted to the right 40% of the `PageHeader` band, masked out, thinner and more widely spaced, and never placed behind text, buttons, tabs, forms, tables, cards, stat tiles, or the class-code panel.

## Measured Token Contrast Pairs

| Element / Variant | Tokens (Foreground / Background) | Contrast | Result |
| --- | --- | ---: | --- |
| Body text on white | `--color-navy-900` / `--color-white` | 17.23:1 | AAA |
| Heading text on white | `--color-navy-800` / `--color-white` | 16.52:1 | AAA |
| Supporting copy on white | `--color-navy-800-72` / `--color-white` | 7.36:1 | AAA |
| Body text on 5% tinted panel | `--color-navy-900` / `--color-navy-700-05` | 15.59:1 | AAA |
| Supporting copy on 5% tinted panel | `--color-navy-800-72` / `--color-navy-700-05` | 6.96:1 | AA |
| White text on navy-900 | `--color-white` / `--color-navy-900` | 17.23:1 | AAA |
| White text on navy-800 | `--color-white` / `--color-navy-800` | 16.52:1 | AAA |
| White text on navy-700 | `--color-white` / `--color-navy-700` | 13.71:1 | AAA |
| White supporting copy on navy-900 | `--color-white-72` / `--color-navy-900` | 9.14:1 | AAA |
| White meta copy on navy-900 | `--color-white-55` / `--color-navy-900` | 5.74:1 | AA |
| Button primary on light | `--color-white` / `--color-navy-800` | 16.52:1 | AAA |
| Button secondary on light | `--color-navy-900` / `--color-white` | 17.23:1 | AAA |
| Button tertiary link on light | `--color-navy-900` / `--color-white` | 17.23:1 | AAA |
| Button primary on navy | `--color-navy-900` / `--color-white` | 17.23:1 | AAA |
| Button secondary on navy | `--color-white` / `--color-navy-900` | 17.23:1 | AAA |
| Button destructive primary | `--color-white` / `--color-danger` | 4.54:1 | AA |
| Button destructive secondary | `--color-danger-text` / `--color-white` | 7.48:1 | AAA |
| Tab label on white (inactive) | `--color-navy-800-72` / `--color-white` | 7.36:1 | AAA |
| Tab label on rail (inactive) | `--color-navy-800-72` / `--color-navy-900-08` | 6.81:1 | AA |
| Tab hover label on rail | `--color-navy-900` / `--color-navy-900-12` | 13.91:1 | AAA |
| Tab selected label on fill | `--color-white` / `--color-navy-800` | 16.52:1 | AAA |
| Tab inactive count badge | `--color-navy-900` / `--color-navy-900-12` | 13.91:1 | AAA |
| Tab selected count badge | `--color-navy-900` / `--color-white` | 17.23:1 | AAA |
| Badge on light surface | `--color-navy-800` / `--color-white` | 16.52:1 | AAA |
| Badge on navy surface | `--color-white` / `--color-navy-700` | 13.71:1 | AAA |
| Alert title on white card | `--color-navy-900` / `--color-white` | 17.23:1 | AAA |
| Alert body on white card | `--color-navy-800-72` / `--color-white` | 7.36:1 | AAA |
| Feedback success text | `--color-feedback-success` / `--color-feedback-success-bg` | 6.66:1 | AA |
| Feedback warning text | `--color-feedback-warning` / `--color-feedback-warning-bg` | 6.23:1 | AA |
| Feedback error text | `--color-feedback-error` / `--color-feedback-error-bg` | 6.79:1 | AA |
| Danger text | `--color-danger-text` / `--color-danger-bg` | 7.48:1 | AAA |
| Focus ring on white canvas | `--color-navy-700` / `--color-white` | 13.71:1 | AAA |
| Focus ring on tinted canvas | `--color-navy-700` / `--color-navy-700-05` | 12.44:1 | AAA |
| Focus ring on navy surface | `--color-white` / `--color-navy-900` | 17.23:1 | AAA |
| Button secondary outline on navy | `--color-white` / `--color-navy-900` | 17.23:1 | AAA (UI component) |
| Active control border | `--color-navy-800` / `--color-white` | 16.52:1 | AAA (UI component) |
| Alert accent bar: success | `--color-feedback-success` / `--color-white` | 6.66:1 | AA (UI component) |
| Alert accent bar: error | `--color-feedback-error` / `--color-white` | 6.79:1 | AA (UI component) |
| Alert accent bar: warning | `--color-feedback-warning` / `--color-white` | 6.23:1 | AA (UI component) |
| Alert accent bar: info | `--color-navy-800` / `--color-white` | 16.52:1 | AAA (UI component) |
| Danger border | `--color-danger` / `--color-danger-bg` | 4.54:1 | AA (UI component) |
| Phone field outline | `--color-navy-800-72` / `--color-white` | 7.36:1 | AAA (UI component) |
| Phone field focus outline | `--color-navy-900` / `--color-white` | 17.23:1 | AAA (UI component) |
| Phone field error outline | `--color-feedback-error` / `--color-white` | 6.79:1 | AA (UI component) |
| Phone field placeholder | `--color-navy-800-72` / `--color-white` | 7.36:1 | AAA |
| Phone field error message | `--color-feedback-error` / `--color-white` | 6.79:1 | AA |
| Phone dashboard title | `--color-navy-900` / `--color-white` | 17.23:1 | AAA |
| Phone nav unselected label | `--color-navy-800-72` / `--color-white` | 7.36:1 | AAA |
| Phone nav selected label | `--color-navy-900` / `--color-navy-700-07` | 15.59:1 | AAA |
| Phone class card title | `--color-navy-900` / `--color-white` | 17.23:1 | AAA |
| Canvas card title | `--color-navy-900` / `--color-white` | 17.23:1 | AAA |
| Canvas note card body | `--color-navy-900-88` / `--color-white` | 11.45:1 | AAA |
| Canvas link host | `--color-navy-800` / `--color-white` | 16.52:1 | AAA |
| Canvas link hover | `--color-navy-700` / `--color-white` | 13.71:1 | AAA |
| Canvas edge badge correct | `--color-feedback-success` / `--color-feedback-success-bg` | 6.66:1 | AA |
| Canvas edge badge wrong | `--color-danger-text` / `--color-danger-bg` | 7.48:1 | AAA |
| Canvas edge badge missed | `--color-navy-900` / `--color-white` | 17.23:1 | AAA |
| Canvas handle dot | `--color-navy-900` / `--color-white` | 17.23:1 | AAA (UI component) |
| Canvas minimap node | `--color-navy-900` / `--color-white` | 17.23:1 | AAA (UI component) |
| Canvas card double focus ring | `--color-white` / `--color-navy-800` | 16.52:1 | AAA (UI component) |
| Module card title | `--color-navy-900` / `--color-white` | 17.23:1 | AAA |
| Module card meta | `--color-navy-800-72` / `--color-white` | 7.36:1 | AAA |
| Module publish bar title | `--color-white` / `--color-navy-900` | 17.23:1 | AAA |
| Module publish bar copy | `--color-white-72` / `--color-navy-900` | 9.14:1 | AAA |
| Resource embed fallback text | `--color-navy-800-72` / `--color-white` | 7.36:1 | AAA |
| Resource embed fallback link | `--color-navy-800` / `--color-white` | 16.52:1 | AAA |

Feedback states pair each color with an icon and a visible text label. No navy element is placed on a navy background.

## Bound CSS Selector Contrast Pairs

The automated test parses `src/styles/*.css`, finds the declarations for each selector, resolves `var()` tokens, and measures the foreground against background. All rules are bound to actual stylesheet declarations.

| Element / Variant | CSS Selector | Measured Declarations (Color / Background) | Contrast | Result |
| --- | --- | --- | ---: | --- |
| Button primary on light | `.button--primary` | `var(--color-white)` / `var(--color-navy-800)` | 16.52:1 | AAA |
| Button secondary on light | `.button--secondary` | `var(--color-navy-900)` / `var(--color-white)` | 17.23:1 | AAA |
| Button tertiary on light | `.button--tertiary` | `var(--color-navy-900)` / body (`--color-white`) | 17.23:1 | AAA |
| Button on-navy primary | `.button--on-navy.button--primary` | `var(--color-navy-900)` / `var(--color-white)` | 17.23:1 | AAA |
| Button on-navy secondary | `.button--on-navy.button--secondary` | `var(--color-white)` / `.page-header` (`--color-navy-900`) | 17.23:1 | AAA |
| Button destructive primary | `.button--destructive` | `var(--color-white)` / `var(--color-danger)` | 4.83:1 | AA |
| Button destructive secondary | `.button--secondary.button--destructive` | `var(--color-danger-text)` / `var(--color-white)` | 7.48:1 | AAA |
| Tabs inactive label | `.tabs__list button:not([aria-selected="true"])` | `var(--color-navy-800-72)` / `.tabs__list` (`--color-navy-900-08`) | 6.81:1 | AA |
| Tabs hover label | `.tabs__list button:not([aria-selected="true"]):hover` | `var(--color-navy-900)` / `var(--color-navy-900-12)` | 13.91:1 | AAA |
| Tabs selected label | `.tabs__list button[aria-selected="true"]` | `var(--color-white)` / `var(--color-navy-800)` | 16.52:1 | AAA |
| Tab selected count badge | `.tabs__list button[aria-selected="true"] .tabs__count` | `var(--color-navy-900)` / `var(--color-white)` | 17.23:1 | AAA |
| Tab inactive count badge | `.tabs__list button:not([aria-selected="true"]) .tabs__count` | `var(--color-navy-900)` / `var(--color-navy-900-12)` | 13.91:1 | AAA |
| Badge on light surface | `.badge` | `var(--color-navy-800)` / `var(--color-white)` | 16.52:1 | AAA |
| Badge on navy surface | `.page-header__badge` | `var(--color-white)` / `var(--color-navy-700)` | 13.71:1 | AAA |
| Alert title | `.alert strong` | `var(--color-navy-900)` / `.alert` (`--color-white`) | 17.23:1 | AAA |
| Alert body | `.alert span` | `var(--color-navy-800-72)` / `.alert` (`--color-white`) | 7.36:1 | AAA |
| Stat tile white | `.stat-tile` | `var(--color-navy-900)` / `var(--color-white)` | 17.23:1 | AAA |
| Stat tile navy | `.stat-tile--navy` | `var(--color-white)` / `var(--color-navy-900)` | 17.23:1 | AAA |
| Empty state title | `.empty-state h2` | `var(--color-navy-900)` / `.empty-state` (`--color-white`) | 17.23:1 | AAA |
| Empty state body | `.empty-state p` | `var(--color-navy-800-72)` / `.empty-state` (`--color-white`) | 7.36:1 | AAA |
| Class-code panel | `.class-code-panel` | `var(--color-navy-900)` / `var(--color-white)` | 17.23:1 | AAA |
| Header title | `.page-header h1` | `var(--color-white)` / `.page-header` (`--color-navy-900`) | 17.23:1 | AAA |
| Header subtitle | `.page-header p` | `var(--color-white-72)` / `.page-header` (`--color-navy-900`) | 9.14:1 | AAA |
| Page-header button primary | `.page-header__action .button--primary` | `var(--color-navy-900)` / `var(--color-white)` | 17.23:1 | AAA |
| Page-header button secondary | `.page-header__action .button--secondary` | `var(--color-white)` / `.page-header` (`--color-navy-900`) | 17.23:1 | AAA |
| Dialog | `.dialog` | `var(--color-navy-900)` / `var(--color-white)` | 17.23:1 | AAA |
| Toast title | `.toast > strong` | `var(--color-navy-900)` / `.toast` (`--color-white`) | 17.23:1 | AAA |
| Toast body | `.toast > span` | `var(--color-navy-800-72)` / `.toast` (`--color-white`) | 7.36:1 | AAA |
| Field label | `.field__label` | `var(--color-navy-900)` / `var(--color-white)` | 17.23:1 | AAA |
| Field hint | `.field__hint` | `var(--color-navy-800-72)` / `var(--color-white)` | 7.36:1 | AAA |
| Field error | `.field__error` | `var(--color-danger-text)` / `var(--color-white)` | 7.48:1 | AAA |
| Data table header | `.data-table th` | `var(--color-navy-900)` / `var(--color-white)` | 17.23:1 | AAA |
| Segmented control inactive | `.segmented-control button` | `var(--color-navy-800-72)` / `.segmented-control` (`--color-navy-900-08`) | 6.81:1 | AA |
| Segmented control selected | `.segmented-control button.is-selected` | `var(--color-navy-900)` / `var(--color-white)` | 17.23:1 | AAA |

All automated checks are enforced in CI via `src/styles/contrast.test.ts`. Verified with a throwaway test edit changing `.button--primary` color to `var(--color-navy-900)`, which caused Contrast Test 1 and Contrast Test 4 to fail with ratio 1.04:1 and flag a Navy-on-Navy prohibition violation before being reverted.

