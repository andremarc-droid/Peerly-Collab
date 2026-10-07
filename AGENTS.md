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
- Images for canvas image cards live in `quizzes/{quizId}/images/{imageId}`: `{ data, mimeType, width, height, bytes, createdAt }` (data stored without `data:` prefix, mimeType in `image/jpeg` or `image/webp`). Enforced hard cap of <= 700,000 characters of data per image document in Firestore rules.
- Validate untrusted domain payloads at runtime. Grade with pure functions and expose the service boundary as `gradeAttempt` so grading can move to a Cloud Function later.

## CANVAS
- Modes: `quiz`, `flashcards`, and `canvas`. Mode is permanently locked upon quiz creation.
- Canvas kinds (`boardKind`): `'prebuilt'` (default) and `'blank'`. `boardKind` is locked permanently upon quiz creation.
  - Prebuilt canvas: instructor builds a target board with cards (concept, fact, note, paragraph, link, image) and answer key connections; graded automatically browser-side against the answer key.
  - Blank canvas: open-ended student concept mapping. The board question has `cards: []`, an optional rubric (max 1000 chars), `showRubricToStudents`, configurable limits (`maxCards` 1–30, default 20; `maxConnections` 0–80, default 40), and `allowedCardTypes` (`note`, `paragraph`, `link`). No answer key document exists for blank canvas (`validateQuestionAnswerPair` returns `{ question, answerKey: null }`).
- Hard limits: prebuilt boards support up to 50 cards, 80 connections, and at most 12 uploaded images. Blank boards support up to 30 student cards, 80 connections, and notes/paragraphs/links.
- Blank canvas student attempts: student answers are saved in `answers.board` as `{ cards: BlankCanvasAnswerCard[], connections: string[] }`. Debounced autosave preserves the student's card layout and connections.
- Blank canvas grading lifecycle: student submit creates a result with `reviewStatus: 'pending'`, `score: 0`, and `maxScore: question.points`. Instructors review student boards with an interactive read-only board canvas, previous/next ungraded navigation, and a manual grading form (`score`, optional `feedback` max 1000 chars) which updates `reviewStatus: 'graded'`.
- Results & CSV export: quiz results table features a "Needs grading" filter, count badge, status column, and CSV export with Review status and Feedback.
- Image storage and processing: uploaded images are processed client-side (JPEG, PNG, WebP only up to 10 MB; SVG/GIF rejected), canvas filled with white prior to drawing so transparent PNGs do not turn black in JPEG, resized to at most 1024px on the longest side, and re-encoded to JPEG/WebP with quality stepping down until base64 data length is <= 350,000 characters (stripping EXIF metadata). Images live at `quizzes/{quizId}/images/{imageId}` with a 700,000-character hard limit and disabled single-field indexing in `firestore.indexes.json`.
- Legacy image cards: boards with existing Google Drive image cards load safely without crashing, show a "Re-upload required" warning badge in the builder, and block saving or publishing until replaced with an uploaded image.
- Connection ID formats: directed connections use `fromId->toId`; undirected connections use `fromId<->toId` (with endpoint IDs normalized alphabetically).
- QuickCreateQuiz supports `mode` and `boardKind` parameters. When opened from the Canvas tab (`?classId=<id>&mode=canvas`), the picker allows choosing between Prebuilt Canvas and Blank Canvas, and routes directly to the respective builder (`CanvasBuilderPage` or `BlankCanvasBuilder`).
- Canvas geometry & sizing: `src/features/canvas/constants.ts` is the single source of truth for 240x140 cards, 40px padding, 44px handles with 28px dot, 2.5px edges, 22px arrowheads, 3px selection outline, 200x140 minimap, 44px control buttons, zoom bounds (0.2–2.5), and fitView options (padding: 0.2). Wired into `mapping.ts`, `canvas.css`, `CanvasBoard.tsx`, `placement.ts`, and `schemas.ts` (`scatterCards`).
- Non-overlapping card placement & tidy layout: `findNonOverlappingPosition` ensures newly added cards do not overlap existing cards. `tidyLayout` arranges cards into a clean non-overlapping grid.
- Responsive board containers & full screen expansion: all canvas boards use `ExpandableCanvasContainer` (`h-[max(70dvh,480px)] lg:h-[max(560px,calc(100dvh-220px))]`) supporting Fullscreen API with fixed `inset-0` fallback, Escape key handling, body scroll lock, and collapsible 360px side panels (`lg:w-[360px] lg:min-w-[360px]`).
- Text outline companion: `CanvasTextOutline` provides a searchable, copyable plain-text outline with shared selection synchronized with `CanvasBoard`.
- Blank canvas directed setting: supports optional `directed?: boolean` in `BlankCanvasQuestion`, schema, and Firestore rules. Honors directed arrows (`from->to`) or undirected edges (`from<->to`) in student taking mode.
- Student link card validation: link cards require valid `https://` URLs on quiz submit; empty URLs are tolerated during draft autosaves.
- Hidden/unreleased scores: `QuizResultPage` handles unreleased/hidden scores gracefully when student read is denied, rendering "Submitted. Your instructor will check your board." and the read-only submitted board without crashing.

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

## LEARNING CANVAS
- Learning canvases are non-graded spatial study materials that do not touch quizzes, attempts, or answer keys.
- Canvas documents live at `classes/{classId}/learningCanvases/{canvasId}` with metadata: `ownerId`, `classId`, `kind` (`'class'` | `'personal'`), `title` (1–120), `description` (max 300), `status` (`'draft'` | `'published'` for class kind, `'private'` for personal kind), `nodeCount` (0–80), `edgeCount` (0–120), `refs` (max 80 `{ type: 'module' | 'quiz' | 'learning', id }`, ids only, never titles), `sourceCanvasId` (for copies), `createdAt`, `updatedAt`.
- Canvas content lives at `classes/{classId}/learningCanvases/{canvasId}/content/main` with `version: 1`, `nodes` (max 80, max 10 groups), `edges` (max 120), `viewport` (`{ x, y, zoom }`).
- Node types: `text` (max 2000 chars), `link` (`https://` only, title max 120, note max 300), `reference` (`refType: 'module' | 'quiz' | 'learning'`, `refId`), and `group` (`label` max 80). Coords within `+-20000`, dimensions 80–1200. Colors use tokens `'none' | 'navy' | 'tint' | 'c1'..'c6'`, mapped to theme tokens via pure function `mapLearningCanvasColor`.
- Edges: `id`, `from`, `to`, `fromSide?`, `toSide?` (`'top' | 'right' | 'bottom' | 'left'`), `label?` (max 80), `arrow` (`'none' | 'to' | 'both'`). No self-edges, no duplicates, endpoints must reference existing nodes.
- Rules & security:
  - Class kind: instructor (class owner) creates, updates, and deletes; active members read only when `status == 'published'`; drafts hidden. `kind`, `ownerId`, `classId` immutable.
  - Personal kind: student owner creates (requires active enrollment), reads, updates, and deletes; status must be `'private'`; class owner may delete (for cascades) but can never read personal canvas metadata or content.
  - Content document inherits access from parent canvas document through `get()` / `getAfter()`. List sizes capped (`refs <= 80`, `nodes <= 80`, `edges <= 120`) and keys restricted via `hasOnly`. Per-node fields are enforced by the client domain schema.
  - Cascade deletion: `deleteClassCascade` removes all learning canvases and their content in the class (including students' personal canvases) with safe batch sizes to keep rule lookups bounded.
- JSON Canvas 1.0:
  - Standard JSON Canvas 1.0 import and export via `toJsonCanvas` and `fromJsonCanvas`.
  - Lossy import produces a diagnostic report: file nodes become text cards with file name, unknown types dropped, positions and dimensions clamped, capacity limits enforced, duplicate IDs regenerated, scripts and HTML sanitized.

### Emulator tests in PowerShell
Emulator tests in PowerShell need `JAVA_HOME` set to the JDK 21 path above. Run the full suite with:
```powershell
$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-21.0.2.13-hotspot'; $env:PATH="$env:JAVA_HOME\bin;$env:PATH"; $env:XDG_CONFIG_HOME='node_modules/.cache/firebase-cli-config'; npx firebase emulators:exec --only auth,firestore --project demo-peerly-collab "npx vitest run --maxWorkers=1"
```

