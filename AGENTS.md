# Peerly Collab

## Product
Peerly Collab is a quiz platform for effective, collaborative learning. Instructors create and configure quizzes; students answer individually or in groups of two or more as configured by the instructor. Question types include multiple choice, fill in the blank, identification, and flashcards, with more to come. Pacing options are self-paced, timed, or waiting until all students have answered before moving on. Learning principles: retrieval before reveal, immediate feedback with explanations, missed questions return in mastery mode, and reward practice rather than speed.

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
- In signed-in areas, use the navy `AppShell` header with the white logo, a quiet pinstripe fade, and the account dropdown. Keep its identity, role badge, profile link, and sign-out action visible and keyboard operable.
- Compose in-app pages with `PageHeader`: a navy stripe band, eyebrow, title, subtitle, and optional action. Follow it with the centered white content panel that overlaps the band by about 32px. Keep content near 1120px wide, with 16px mobile and 32px desktop gutters.
- Use `StatTile`/`StatRow` for concise, honest counts and hints; `EmptyState` to explain what belongs in a new area; `SectionCard` to group related content; and `DataCard` for list rows. Empty-state actions must work or be visibly disabled and labelled as coming soon.
- Use `DropdownMenu`, `Dialog`, `ConfirmDialog`, `ToastProvider`, and `Tooltip` for shared interactions. Menus and dialogs support keyboard use; dialogs label their purpose, contain focus, close on Escape, and lock background scroll. Toasts have an icon, visible status label, live announcement, dismiss button, and timeout.
- Shared form controls (`Input`, `Textarea`, `Select`, `Switch`, `Checkbox`, `RadioGroup`, `SegmentedControl`, `Tabs`) must keep labels, hints, and errors programmatically associated with their controls. Prefer native controls where they provide equivalent accessible behavior.
- Keep page rhythm on the 8px scale, favor a clear page heading and semantic sections, and check widths at 360px, 768px, 1280px, and 1920px. Use white/navy contrast pairs listed in `docs/contrast-report.md`; opacity tints are for surfaces and dividers, not small text.
- Use `PageSection` for titled groups on tinted content panels; use icon-led `SectionCard` for raised forms and settings, and keep one clear primary action in each group.
- Use `DataTable` for sortable rosters/results; keep row headers visible on desktop and provide labelled mobile cards without horizontal page overflow.
- `Tabs` use a strong selected state, optional count badges, keyboard arrows, and a horizontally scrollable mobile tab rail. `StatTile` supports white and navy stripe variants.
- Dialogs use the shared icon header, focus trap, Escape handling, and a consistent footer; destructive actions include a warning icon and clear text label.

## USER FLOW
- The public landing page is `/`. “Get started” opens `/role?mode=signup`; “Sign in” opens `/role?mode=signin`.
- `/role` supports `signup`, `signin`, and `continue` modes. Let the user choose Student or Instructor with an accessible radio group; Continue is unavailable until a role is selected.
- Save a typed role intent in sessionStorage under `peerly:roleIntent`, then continue to `/signup` or `/signin` with its mode. Those routes return users without a saved role to `/role` in the corresponding mode.
- Signup, signin, and unknown routes remain clear, accessible placeholders until their forms and route behavior are implemented. Keep auth and Firebase wiring out of the role-choice flow until explicitly requested.

## QUIZ DOMAIN
- Quizzes live at `quizzes/{quizId}` with owner identity, title/description/tags, mode (`quiz` or `flashcards`), status (`draft`, `published`, `archived`), question count, timestamps, and settings for answer reveal, participation, score visibility/release, time limit, attempts, and shuffling.
- Questions live at `quizzes/{quizId}/questions/{questionId}` and contain prompt, type, order, points, and options where applicable. Never store correct answers in question documents.
- Answer keys live separately at `quizzes/{quizId}/answerKeys/{questionId}`. Participants may read them only under the access rules in `firestore.rules`; v1 browser grading means participants can inspect those keys.
- Participants, attempts, and results are separate subcollections. Attempts store responses and ordering but no score; results store grades separately so rules enforce score visibility.
- Support multiple choice, true/false, identification, fill-in-the-blank, and flashcards. Flashcard quizzes use neutral reveal/score defaults and flashcards are not graded.
- Validate untrusted domain payloads at runtime. Grade with pure functions and expose the service boundary as `gradeAttempt` so grading can move to a Cloud Function later.

## WORKING RULES
- UI work uses shared components and theme tokens in `src/shared/ui`; no hard-coded colors. Unfinished features render visibly disabled with a “Coming soon” label.
- Keep interfaces accessible and mobile-first. Keep code feature-based and modules small and focused.
- Write tests for logic. Automated Firebase tests and scripts use only the demo emulator project; never deploy rules or touch the real Firebase project.
- Never print secrets or read `.env.local`. Make one commit per prompt.

## CLASSROOMS
- Classes live at `classes/{classId}` and are owned by instructors. Students only see published quizzes for classes where their enrollment is active.
- `classCodes/{CODE}` is a lookup preview index, never an authority; use the class document and Firestore rules for authoritative join checks. Codes are six characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, generated with Web Crypto and normalized by uppercasing and removing spaces and hyphens.
- `enrollments/{classId}_{uid}` is the canonical membership record. Status is `active`, `pending`, or `blocked`; pending membership needs instructor approval and blocked students cannot recreate their enrollment.
- New quizzes require a `classId`. Legacy quizzes without one remain visible to their owner as unassigned and cannot be published. Quiz assignment changes are allowed only while draft and to an active class owned by the same instructor.
- Never keep client-updated class member counters. Use Firestore count queries for enrollments, pending approvals, and class quizzes.
- Join lookup throttling is a client-side deterrent only; security is enforced by rules. Quiz grading remains browser-side in v1, so answer keys are not protected from a determined participant.

## QUIZ AUTHORING UX
- Start with sensible defaults and let instructors create a draft with only the information needed to begin.
- Use progressive disclosure: question content comes before advanced settings.
- Save valid edits automatically and show a clear save state; routine authoring should not depend on a Save button.
- Keep incomplete work clearly identified and exclude it from publishing.
- Prefer undo over confirmation for low-risk actions such as deleting a question.
- Keep navigation clear with Questions, Settings, and Preview tabs, a reliable back action, and class breadcrumbs.

