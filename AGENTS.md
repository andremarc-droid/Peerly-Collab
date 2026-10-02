# Cool-lab

## Product
Cool-lab is a quiz platform for effective, collaborative learning. Instructors create and configure quizzes; students answer individually or in groups of two or more as configured by the instructor. Question types include multiple choice, fill in the blank, identification, and flashcards, with more to come. Pacing options are self-paced, timed, or waiting until all students have answered before moving on. Learning principles: retrieval before reveal, immediate feedback with explanations, missed questions return in mastery mode, and reward practice rather than speed.

## Conventions
- Use strict TypeScript and feature-based folders: `src/app`, `src/features/<feature>`, `src/lib`, `src/shared/ui`, and `src/types`.
- Keep modules small and focused (aim for under 300 lines). Do not create one large service class.
- Use the modular Firebase v10 SDK in small files.
- Use Tailwind only, with no inline styles. Build mobile-first and accessibly: labels, visible focus states, and never rely on color alone.
- Never hard-code secrets or silently fall back to dummy config. Missing environment variables must produce a clear error.
- Write tests for logic you add.
- Use the existing oxlint setup; do not add ESLint.

## THEME
- Use only white and navy as brand colors, with named Tailwind v4 theme tokens. Functional success, error, and warning colors may appear only in answer/status feedback and must include both an icon and text label.
- Use white pinstripes, stripe bands, and fade masks as restrained decorative details on navy. Keep paragraph text on solid panels or clear stripe-free areas; decorative stripes are hidden from assistive technology.
- Build with generous 8px-grid spacing, 16–24px corners, subtle navy-tinted shadows, and fluid Outfit headings with Inter body copy. Use responsive typography and layouts.
- Buttons must have 44px minimum touch targets, clear hover/pressed states, and visible focus rings. Respect reduced-motion preferences and prefer small CSS/IntersectionObserver motion effects.
- Use lucide-react for icons. Do not hard-code colors in components; use theme tokens.

## USER FLOW
- The public landing page is `/`. “Get started” opens `/role?mode=signup`; “Sign in” opens `/role?mode=signin`.
- `/role` supports `signup`, `signin`, and `continue` modes. Let the user choose Student or Instructor with an accessible radio group; Continue is unavailable until a role is selected.
- Save a typed role intent in sessionStorage under `coollab:roleIntent`, then continue to `/signup` or `/signin` with its mode. Those routes return users without a saved role to `/role` in the corresponding mode.
- Signup, signin, and unknown routes remain clear, accessible placeholders until their forms and route behavior are implemented. Keep auth and Firebase wiring out of the role-choice flow until explicitly requested.
