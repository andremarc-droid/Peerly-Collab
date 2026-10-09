# Mobile port progress

Porting the phone redesign from `Cool-Lab-Mobile` (read only) into `Cool-Lab`.
If a new session resumes this work, read this file first and continue from the first unchecked phase.

Environment note: the agent working on this has file read/write access only (no shell). The owner runs every
command. "Written" below means the files exist and were reviewed by reading; it does NOT mean tests passed.

## Findings from the comparison

- `src/main.tsx` -> `src/App.tsx` -> `AppRoutes` in `src/app/App.tsx`. Routes are edited in `src/app/App.tsx`.
- Reference adds: `src/features/mobile/*`, `src/shared/ui/m3/*`, `src/styles/m3.css`, `src/lib/platform/*`,
  five auth hooks (+ `useRoleSelection.test.ts`), `src/features/landing/roleChoices.ts`.
- Reference leftovers NOT ported: `LandingHero.tsx`, `RoleSheet.tsx`, `RoleTile.tsx`.
- Reference changes: `src/app/App.tsx`, `src/index.css`, the five auth pages, `AGENTS.md`.
- `@capacitor/core` is already a dependency of Cool-Lab.

## Phases

- [x] Phase 1: primitives (`isMobileView`, `m3.css` + import, M3Button, M3AppBar, M3TextField, M3PasswordField, tests, contrast pairs) - written; owner still has to run tests
  - Changed vs reference: focus rings moved into m3.css (Tailwind focus utilities were dead), field outline navy-900-30 (~2:1) -> navy-800-72 (7.4:1), px conflicts removed in M3Button/M3TextField, `.m3-title` no-ring rule, reduced-motion hides ripple, 5 new contrast pairs in contrast.test.ts + contrast-report.md
- [x] Phase 2: welcome and start (WelcomeScreen, WelcomeIllustration, StartScreen, MobileRoutes, App routes, mobile.test.tsx) - written; owner still has to run tests
  - Changed vs reference: StartScreen h1 moved inside `<main>` and now takes focus (`focusTitle` was missing), WelcomeScreen title takes focus, dead Tailwind focus classes dropped, 44px Logo target via `.m3-logo-row`, more tests
- [x] Phase 3: extract auth hooks, desktop pages use them with identical markup - written WITHOUT any phone branch; owner should run `npx vitest run src/features/auth` before Phase 4 matters
  - Behavior compared line by line against the old pages: identical. `invalidCount` is the only new state (no effect on desktop). Desktop role options now derive from `roleChoices` so arrow-key order has one source.
- [x] Phase 4: phone screens (Role, Signin, Signup, ForgotPassword, VerifyEmail, MobileAuthParts, useFocusFirstInvalid) and page branching - written; owner still has to run tests
  - Changed vs reference: layout wraps app bar + content in one `<main>` (h1 was outside main), dead focus classes removed from role cards, unselected radio ring 3:1, `autoCapitalize`/`spellCheck` on email and name fields, verify button copy is verb-first ("Check verification")
- [x] Phase 5: `authScreens.test.tsx` - written; owner still has to run it
  - Changes vs reference: `view.mobile` flag instead of a constant, title-focus assertion on every screen, verify button renamed, extra tests (Google sign-in args, continue->signin redirect, aria-invalid clears, form state survives breakpoint switch). The file is ~390 lines; it is a test file with shared mocks, so it was not split.
- [x] Phase 6: signed-in phone dashboard (MobileAppShell, M3NavBar, M3PageHeader, MobileClassTile, AppShell/PageHeader/ClassTile branching, m3.css chrome) - written; owner still has to run tests
  - Phone home tabs (Classes / Quizzes / Learning / Profile) get a white top bar, large title, and bottom navigation. Nested screens drop the bar and show a Back control. Desktop navy header and class tiles are unchanged above the `md` breakpoint.
- [ ] Phase 7: AGENTS.md theme note for phone chrome, final review

## Commands the owner must run (nothing below has been run)

```
npm run typecheck
npm run lint
npx vitest run src/features/mobile src/shared/ui/m3 src/lib/platform src/features/auth src/app src/features/landing src/styles src/features/classes/ClassTile.test.tsx src/shared/ui/variants.test.tsx
npm run build
npm run dev   (check 360px, 768px, 1280px)
```

Then the emulator suite from the end of AGENTS.md.
