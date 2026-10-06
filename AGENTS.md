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
- Balance rules (light-first balance):
  - Canvas and content areas are white or a very light navy tint (3–5%). Navy is reserved for the top nav bar, a compact `PageHeader` band (max about 160px on desktop, 120px mobile), primary buttons, selected states, icon tiles, and text. Target proportions: ~70% light, ~25% navy, ~5% stripes.
  - Stripes only inside the `PageHeader` band and hero areas: at most the right 40% of the band, fading out with a mask, thinner and more widely spaced, never behind text, buttons, tabs, forms, tables, cards, stat tiles, or the class-code panel.
  - Never place a navy element on a navy background. Text pairs require >= 4.5:1 contrast; borders, icons, and focus rings require >= 3:1.
  - Buttons: On navy, primary = white fill with navy text; secondary = transparent with 1px white outline and white text. On light, primary = navy fill with white text; secondary = white fill with navy text and visible 1px navy-at-30% border; tertiary = navy text link. No dark-on-dark variant exists.
  - Tabs on light: inactive = navy at 72% (>= 4.5:1) with a visible hover state; selected = navy fill with white text (or navy text with 3px underline). Count badges use a navy-tinted fill with navy text.
  - Stat tiles: white cards with 1px border and soft shadow. The first tile may be navy-filled, without stripes (no navy stripe variant).
  - Class-code panel: a light card where the code is the hero (32–40px monospace, wide letter-spacing) with a primary "Copy code" button; Copy link, Share invite, and Regenerate are secondary; the Joining switch has a visible label and state text ("Open" or "Paused").
  - Empty states: flat white card, centered, NO gradient, crisp illustration, headline, one sentence, one primary button.
  - Alerts: neutral white card, left accent bar, icon, bold title, dark-ink body (>= 4.5:1), action button; errors, warnings, and info share one layout.
  - Error and empty states never appear together (enforced via shared `resolveListStatus` helper).
  - Comfort: body copy 16px minimum, metadata 14px (labels, hints, errors, captions, badges, toasts, card meta, stat labels and hints, switch captions, account menu text), line-height 1.5–1.6, 8px grid, no large saturated area bigger than the header band, soft shadows. Keep 12px only for decorative uppercase letter-spaced eyebrows.
- Typography: Outfit headings with Inter body. Opacity tints are never used for small text. Check layouts at 360px, 768px, 1280px, and 1920px; ensure nothing horizontally overflows at 360px.
- Geometry: 8px spatial grid with 16–24px rounded corners and soft multi-layer shadows.
- Contrast pairs live in `docs/contrast-report.md`. Text pairs require >= 4.5:1 contrast; UI borders, icons, and focus rings require >= 3:1.
- Use only white and navy as brand colors, with named Tailwind v4 theme tokens. Functional success, error, and warning colors may appear only in answer/status feedback and must include both an icon and text label.
- Buttons must have 44px minimum touch targets, clear hover/pressed states, and visible focus rings. Respect reduced-motion preferences and prefer small CSS/IntersectionObserver motion effects.
- Use lucide-react for icons. Do not hard-code colors in components; use theme tokens.
- In signed-in areas, use the navy `AppShell` header with the white logo and the account dropdown. Keep its identity, role badge, profile link, and sign-out action visible and keyboard operable.
- Compose in-app pages with `PageHeader`: a compact navy band (content-driven height, target min-height ~110px desktop, ~96px mobile) with restrained right-masked stripes, eyebrow, title, subtitle, and optional action. Follow it with the centered white content panel overlapping the band by about 32px.
- Use `PageSection` with an icon badge, title, subtitle, and optional action to structure major dashboard and workspace regions.
- Use `StatTile`/`StatRow` for concise, honest counts and hints; `EmptyState` to explain what belongs in a new area; `SectionCard` to group related content; and `DataCard` for list rows. Empty-state actions must work or be visibly disabled and labelled as coming soon.
- Use `DropdownMenu`, `Dialog`, `ConfirmDialog`, `ToastProvider`, and `Tooltip` for shared interactions. Menus and dialogs support keyboard use; dialogs label their purpose, contain focus, close on Escape, and lock background scroll. Toasts have an icon, visible status label, live announcement, dismiss button, and timeout.
- Shared form controls (`Input`, `Textarea`, `Select`, `Switch`, `Checkbox`, `RadioGroup`, `SegmentedControl`, `Tabs`) must keep labels, hints, and errors programmatically associated with their controls. Prefer native controls where they provide equivalent accessible behavior.
- Use `DataTable` for sortable rosters/results; keep row headers visible on desktop and provide labelled mobile cards without horizontal page overflow.
- Dialogs use the shared icon header, focus trap, Escape handling, and a consistent footer; destructive actions include a warning icon and clear text label.

## USER FLOW
- The public landing page is `/`. “Get started” opens `/role?mode=signup`; “Sign in” opens `/role?mode=signin`.
- `/role` supports `signup`, `signin`, and `continue` modes. Let the user choose Student or Instructor with an accessible radio group; Continue is unavailable until a role is selected.
- Save a typed role intent in sessionStorage under `peerly:roleIntent`, then continue to `/signup` or `/signin` with its mode. Those routes return users without a saved role to `/role` in the corresponding mode.
- Signup, signin, and unknown routes remain clear, accessible placeholders until their forms and route behavior are implemented. Keep auth and Firebase wiring out of the role-choice flow until explicitly requested.

## QUIZ DOMAIN
- Quizzes live at `quizzes/{quizId}` with owner identity, title/description/tags, mode (`quiz`, `flashcards`, or `canvas`), status (`draft`, `published`, `archived`), question count, timestamps, and settings for answer reveal, participation, score visibility/release, time limit, attempts, and shuffling.
- Questions live at `quizzes/{quizId}/questions/{questionId}` and contain prompt, type, order, points, and options where applicable. Never store correct answers in question documents.
- Answer keys live separately at `quizzes/{quizId}/answerKeys/{questionId}`. Participants may read them only under the access rules in `firestore.rules`; v1 browser grading means participants can inspect those keys.
- Participants, attempts, and results are separate subcollections. Attempts store responses and ordering but no score; results store grades separately so rules enforce score visibility.
- Support multiple choice, true/false, identification, fill-in-the-blank, flashcards, and concept canvas boards. Flashcard quizzes use neutral reveal/score defaults and flashcards are not graded.
- Validate untrusted domain payloads at runtime. Grade with pure functions and expose the service boundary as `gradeAttempt` so grading can move to a Cloud Function later.

## CANVAS
- Modes: `quiz`, `flashcards`, and `canvas`. Mode is permanently locked upon quiz creation.
- A canvas quiz consists of exactly one 'board' question at `quizzes/{quizId}/questions/board` and its corresponding answer key at `quizzes/{quizId}/answerKeys/board`.
- Hard limits: boards support up to 50 cards and 80 connections.
- Connection ID formats: directed connections use `fromId->toId`; undirected connections use `fromId<->toId` (with endpoint IDs normalized alphabetically).
- Grading: graded by connection weights/points; missing, wrong, or extra connections scored accordingly.
- Student attempt answers are stored as `answers.board` of type `string[]`, strictly capped at 80 connection strings.
- Client-side grading caveat: in v1, grading runs in the browser; answer keys are accessible to participants under Firestore rules.
- QuickCreateQuiz supports a `mode` query parameter (`quiz`, `flashcards`, `canvas`). When opened from the Canvas tab (`?classId=<id>&mode=canvas`), the picker is preselected and locked to Canvas with an explicit notification, and submits directly into the canvas builder (`?tab=questions`).

## WORKING RULES
- UI work uses shared components and theme tokens in `src/shared/ui`; no hard-coded colors. Unfinished features render visibly disabled with a “Coming soon” label.
- Keep interfaces accessible and mobile-first. Keep code feature-based and modules small and focused.
- Write tests for logic. Automated Firebase tests and scripts use only the demo emulator project; never deploy rules or touch the real Firebase project.
- Never print secrets or read `.env.local`. Make one commit per prompt.

## CLASSROOMS
- Classes live at `classes/{classId}` and are owned by instructors. Students only see published quizzes for classes where their enrollment is active.
- Class page tabs order: Modules, Quizzes, Canvas, People, Settings (`?tab=canvas` supported; unknown values fall back to Modules). Quizzes tab lists quiz and flashcards modes; Canvas tab lists canvas mode with board readiness summary. Tab count badges and the Activities stat tile derive honest per-mode counts from watched quizzes.
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

## MODULES
- Modules are study materials inside a class: a title, description, up to 10 ordered resources, and up to 10 optional quizzes from the same class. Students read; class owners write.
- Resources are Drive previews, YouTube embeds, generic HTTPS links, or plain text. Files remain in Google Drive; there are no uploads. Modules have no progress or completion tracking.
- Module documents live at `classes/{classId}/modules/{moduleId}` with child resources. Validate inputs at runtime and enforce the 10-resource limit in services and rules where possible.
- Drive access follows the file's own sharing settings. Generic links open in a new tab and are never embedded. Allow embeds only for Drive, Docs, Sheets, Slides, and privacy-enhanced YouTube hosts.

### Emulator tests in PowerShell
Emulator tests in PowerShell need `JAVA_HOME` set to the JDK 21 path above. Run the full suite with:
```powershell
$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-21.0.2.13-hotspot'; $env:PATH="$env:JAVA_HOME\bin;$env:PATH"; $env:XDG_CONFIG_HOME='node_modules/.cache/firebase-cli-config'; npx firebase emulators:exec --only auth,firestore --project demo-peerly-collab "npx vitest run --maxWorkers=1"
```

