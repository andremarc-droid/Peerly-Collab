# Learning tab rework ("Gizmo-style") — implementation brief

You are implementing a full rework of the **Learning** area of Cool-Lab (Peerly), for **desktop and mobile**. Work autonomously and phase by phase. Read this whole brief first, then read `AGENTS.md` (authoritative for conventions: stack, styling tokens, accessibility, testing, what you must never do) and `package.json` (to learn the real script names for typecheck, lint, test and build). If this brief and `AGENTS.md` conflict, follow `AGENTS.md` and note the conflict in your final report.

## 1. Product goal

Make Learning feel like the study app **Gizmo**: turn a learner's own material into flashcards, quizzes, lessons and practice tests, study them with spaced repetition, and stay motivated with streaks, XP, study groups and live quiz games. Take the *ideas and flow*, not Gizmo's branding, copy or assets. Use this app's existing design tokens and components.

## 2. Decisions already made (do not re-ask)

| Topic | Decision |
|---|---|
| Content types | Flashcard decks, quizzes (multiple choice **and** written answers), AI lesson plans built from a topic, practice tests |
| Ways to add material | PDFs / slides / documents, YouTube links, photos/scans of handwritten notes, Quizlet and Anki imports. Typed or pasted notes are always supported |
| Motivation / social | Streaks and XP, live quiz games, study groups with shared decks |
| **Not wanted** | Hearts/lives, coins, leagues, paywalls, a public deck marketplace, offline mode |
| Existing features | **Keep** canvases, notes and the AI tutor (UI may be redesigned). **Remove the graph view** entirely |
| Classes | Learning is **fully separate from classes**. No class pickers, no enrollments, no class modules or class quizzes inside Learning |
| Navigation | Keep **top tabs** on desktop and mobile (no bottom tab bar). On phones they are a horizontally scrollable strip |
| Roles | Instructors and students get the **same** Learning experience (one shared page, not two) |
| Existing class-linked data | Move nothing, delete nothing. Content the user created themselves (decks, notes, canvases), even if stored under a class id, still appears in their library. Class-owned material (instructor decks, class modules, class quizzes) no longer appears in Learning. All **new** content goes to the user's personal workspace |

## 3. Information architecture

Top tabs (one page, route stays under the existing Learning route; keep old URLs working with redirects where cheap):

1. **Home**: "Continue studying" card, cards due today, streak and XP, quick "Create" actions.
2. **Decks**: the library of flashcard decks. Opening a deck shows study modes: **Flashcards, Quiz, Practice test, Live game**.
3. **Lessons**: AI lesson plans (a topic becomes an ordered set of lessons, each with content, flashcards and a quiz).
4. **Notes**: existing notes, redesigned.
5. **Canvases**: existing study canvases, redesigned.
6. **Groups**: study groups, shared decks, live game lobby / join by code.

The AI tutor stays as the floating dock available on every tab. Keep the existing "join with an invite code" entry (`learningSharing/LearningInviteCodeInput`).

## 4. What already exists (reuse, do not rewrite blindly)

- `src/features/learningCanvas/StudentLearningHubPage.tsx` and `InstructorLearningHubPage.tsx`: the current hubs. The student hub uses a `SegmentedControl` (Canvases, Notes, Flashcards, Graph view), `TutorDock` + `ChatbotTab`, and is wired to enrollments, class modules and class quizzes. The personal workspace id is the user's uid used as a `classId`.
- `src/features/learningCanvas/`: canvas editor, notes (`noteService`, `NotesTabContent`), sharing/collab (`collab/`), `graph/` + `components/LearningGraphView.tsx` + `GraphInvitePage.tsx` (**to remove**).
- `src/features/flashcards/`: deck types (`Flashcard`, `FlashcardDeckRecord` with embedded `cards`), services, sharing (`DeckShareDialog`, `sharing.ts`, `DeckInvitePage`), AI generation (`ai/generateCards.ts`, `ai/moduleSource.ts`, `ai/useClassModules.ts` which is **class-coupled**), `studySession.ts` (only "known / review", no scheduling, no saved progress), `bulkParse.ts` (paste parser), `FlipCard`, `FlashcardStudyDialog`.
- `src/features/documents/`: PDF, DOCX and text extraction (`extractDocument`, `useDocumentImport`, `DocumentPicker`, `DocumentChips`).
- `src/features/chatbot/`: AI tutor, image preparation (`images.ts`), the Groq client/engine. Reuse its AI client; do not add a second one.
- `src/features/quizzes/` and `studentQuizzes/`: **instructor class quizzes**. Do not reuse their data model for personal quizzes; build a personal quiz model (you may reuse UI pieces).
- Shared UI in `src/shared/ui/` (`Tabs`, `SegmentedControl`, `DropdownMenu`, `Dialog`, `ConfirmDialog`, `Button`, `Alert`, `EmptyState`, `Skeleton`, `useToast`, ...). Use these before inventing new ones.
- `functions/` exists (Firebase Cloud Functions). `firestore.rules`, `firestore.indexes.json` and rules tests exist; extend them, never loosen them.

## 5. Responsive and UX requirements (apply to every phase)

- Breakpoints used in this codebase: phone < 640px, tablet 640–1023px, desktop ≥ 1024px. **Phone and tablet share the compact layout; desktop is the full layout.**
- Below 1024px, secondary actions go into a three-dot `DropdownMenu` (`iconOnly`), keeping one primary action visible. Destructive items use the `is-danger` menu-item style. Desktop shows the full button row.
- 44px minimum touch targets, no horizontal page overflow at 320px width, visible keyboard focus, `prefers-reduced-motion` respected, 16px+ text in inputs (prevents iOS zoom).
- Tab strip: reuse `shared/ui/Tabs` (it scrolls the active tab into view and has no overlay). Do not reintroduce a fade overlay inside the scroller.
- Study screens are **one card at a time**, large, thumb-friendly. On touch, support swipe (right = I knew it, left = review again) **and** visible buttons and keyboard shortcuts so nothing is gesture-only. Show a progress bar and an end-of-session summary.
- Empty, loading, error and "AI unavailable / rate-limited" states for every new screen.
- Android APK shares this code (Capacitor). Do not use browser-only APIs without a guard, and keep text selectable/legible in the WebView.

## 6. Phases

Work strictly in this order. **At the end of each phase**: run typecheck, lint and the full test suite; fix everything; update docs; make one commit with a clear message; only then continue. If a phase cannot be finished, stop, commit what is green, and explain in the report.

### Phase 1: Foundation (no new data, rules or AI features)
- One shared `LearningHubPage` for both roles with the tabs in section 3. Replace both existing hub pages and update routes/redirects (old `?tab=` values and invite links keep working: canvases, notes, flashcards, tutor, and shared-thread links).
- Decouple from classes: remove enrollment, class, module and quiz subscriptions and the class selector from Learning. Library = everything the user owns or has been shared (decks, notes, canvases), including items stored under a class id.
- New content is created in the personal workspace (uid as the container id, as today).
- Remove the graph view: component, `graph/` helpers, `GraphInvitePage` and its route, toolbar entries, related CSS. Leave Firestore **data and rules** untouched unless clearly dead and covered by tests; list what you left in the report.
- Home tab: continue-studying card (most recent deck/note/canvas), a due-cards placeholder, streak/XP placeholders marked as coming in a later phase (do not fake numbers).
- Redesign Notes, Canvases and Decks list views in the new style, responsive per section 5.
- Keep all existing tests passing; add tests for the new page, routing/redirects and the library aggregation logic.

### Phase 2: Study engine
- **Spaced repetition**: pure, well-tested scheduling module (SM-2 or FSRS-lite; document the choice). Per-user, per-card state (ease/stability, interval, due date, lapses, last result). Store one progress document per (user, deck) holding a map keyed by card id (watch the 1 MiB document limit; cap deck size and handle overflow explicitly). Owner-only security rules plus emulator rules tests.
- Flashcard study mode: due cards first, new cards limit per day, again/hard/good/easy (or know/review) grading after reveal, session summary.
- **Quiz mode** (from a deck or lesson): multiple choice (generate plausible distractors) and **written answers** (AI-assisted grading with a clear fallback to self-grade if AI fails). Immediate feedback, explanation, retry missed.
- **Practice tests**: timed or untimed, mixed question types, no feedback until submit, score and per-question review, history of attempts.
- Personal quiz/test data model with rules and tests. Question generation goes through a single `ai` service wrapper around the existing Groq client so it can later be moved behind a Cloud Function without touching callers.
- Update the Home tab with real "due today" counts.

### Phase 3: Import pipeline
A single "Create" flow: choose a source, preview the extracted text, choose what to generate (flashcards / quiz / lesson), review and edit the result before saving.
- Documents and slides: reuse `documents/` (PDF, DOCX, text). Add PPTX text extraction if feasible with a small dependency; otherwise state the limitation.
- Photos/scans of handwritten notes: reuse the vision-capable path used for tutor images; show the transcribed text for correction before generating.
- Quizlet and Anki: support text exports first (term/definition with configurable separators, extend `bulkParse`). Anki `.apkg` is a stretch goal: only attempt if it stays small and safe; otherwise document it as deferred.
- YouTube links: browsers cannot read transcripts directly. Implement a callable Cloud Function in `functions/` behind a provider abstraction, validate the URL, rate-limit per user, and return the transcript. Also provide a **"paste the transcript"** fallback so the feature degrades gracefully when the function is not deployed. Never put secrets in client code.
- Large inputs: chunk and cap text sent to the model, show progress, support cancel, and surface partial results.

### Phase 4: AI lesson plans
- "Learn a topic": user enters a topic (optionally pastes material). Generate a structured plan: ordered lessons, each with short content, key points, flashcards and a quiz. Let the user edit, reorder, regenerate one lesson, and track per-lesson completion.
- Lessons tab list + lesson player (read, then practice, then quiz), resumable.
- Validate model JSON strictly (schemas, as the codebase does elsewhere) and handle malformed output with retries and a clear error.

### Phase 5: Streaks and XP
- Per-user stats document (xp, level, current/longest streak, last study day, daily goal). Streak is computed per local calendar day with a defined timezone rule; document edge cases (missed day, timezone change).
- XP for completing sessions, quizzes and tests, with sensible caps. Security rules must bound what a client can write (max delta per write, monotonic day), and you must document that client-written XP is not tamper-proof and must not be used for anything with real stakes.
- Home tab shows streak, XP, level progress and a daily goal. Subtle, accessible celebration (respect reduced motion).

### Phase 6: Study groups and live quiz games
- **Study groups**: create a group, invite by code/link (reuse the existing invite-code patterns), members list, roles (owner/member), share decks into a group by reusing the existing deck-sharing model. Leave/remove flows.
- **Live games** (Kahoot-style, not tied to classes): host starts a game from a deck or quiz, gets a join code; players join from the Groups tab or by code; realtime lobby, question timer, answer speed + correctness scoring, live leaderboard, final results. Host controls (start, next, end). Handle host/player disconnects and game expiry/cleanup. Design Firestore structure and **strict rules** (players can only write their own answers, cannot read future questions' answers, cannot change scores directly if you can avoid it) with emulator rules tests. State clearly any cheating limitation that remains.
- Mobile: join and play must work well one-handed.

## 7. Engineering constraints

- Follow `AGENTS.md` for styling (design tokens, no hard-coded colors, no inline styles, Tailwind layering gotchas), accessibility and testing conventions.
- Type-safe, no `any`; schemas validate everything read from Firestore or returned by AI.
- Keep functions and components small; put logic in pure, tested modules; keep Firestore access in `services` files like the rest of the codebase.
- Respect the existing Firestore size/limits patterns; paginate or cap lists.
- Add or update `firestore.rules`, `firestore.indexes.json` and rules tests whenever you add collections or queries. **Do not deploy anything** (rules, indexes, functions, hosting) and do not touch real Firebase projects. Use emulators only.
- No new secrets in the repo. AI keys stay in env vars as they are today; keep AI calls behind the single `ai` wrapper.
- Prefer small, well-maintained dependencies, justify each in the report, and avoid anything heavy on the main bundle (lazy-load import and live-game code).
- Do not modify unrelated features (classes, class quizzes, auth, Android CI workflow) except where an import breaks.
- Add docs: `docs/learning-domain.md` describing data model, rules, scheduling algorithm, XP/streak rules and known limitations.

## 8. Definition of done (per phase and overall)

- Typecheck, lint and the whole test suite pass; no skipped or deleted tests without explanation.
- Works at 320px, 768px and 1280px widths; no horizontal overflow; keyboard accessible.
- No dead code from removed features (graph view) left importable or routable.
- Every new Firestore path has rules and rules tests.
- A final report listing: what shipped per phase, what was deferred and why, anything left from the graph removal, new dependencies, and **manual steps for me** (deploying rules/indexes/functions, enabling the Blaze plan for YouTube, env vars to set).
