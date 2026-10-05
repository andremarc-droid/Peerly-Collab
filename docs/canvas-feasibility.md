# Canvas Mode Feasibility Study

## 1. Reuse Map

Canvas mode aims to integrate as a third quiz format (`'quiz' | 'flashcards' | 'canvas'`) while keeping the existing attempts, results, timing, score release, overrides, late flags, and CSV infrastructure.

### Reused As-Is
- **`src/features/quizzes/results/resultLogic.ts`**:
  - `computeTimeSpent` & `isLate`: Evaluates server timestamps (`startedAt`, `submittedAt`) against `timeLimitMinutes` with 120s network grace without modification.
  - `buildRosterRows` & `bestAttempts`: Joins class enrollments with student attempts and picks top scores.
  - `summarizeAttempts`: Aggregates submissions, in-progress count, average, high/low, and late submissions.
  - `csvCell` & `resultsCsv`: Generates export rows (`Student`, `User ID`, `Class`, `Attempt`, `Status`, `Score`, `Late`, `Time spent (seconds)`, `Submitted at`) agnostic of question format.
- **`src/features/quizzes/services/resultService.ts`**:
  - `getQuizResult`, `listResults`, `listStudentResults`: Reads result documents directly from `quizzes/{quizId}/results/{attemptId}`.
  - `overrideResult`: Batch updates arbitrary `perQuestion` points and scores for instructor overrides.
- **`src/features/quizzes/services/paths.ts`**:
  - `quizRef`, `questionsRef`, `questionRef`, `answerKeysRef`, `answerKeyRef`, `participantsRef`, `participantRef`, `attemptsRef`, `attemptRef`, `resultsRef`, `resultRef`: All document and subcollection path helpers map identically.
- **`src/features/quizzes/services/quizService.ts`**:
  - `getQuiz`, `updateQuiz`, `deleteQuiz`, `watchQuiz`, `watchInstructorQuizzes`, `watchClassQuizzes`: CRUD operations on quiz documents remain unchanged.
- **`src/features/quizzes/results/QuizResultsPage.tsx`**:
  - Instructor dashboard tiles (`StatRow`, `StatTile`), score release toggle (`updateQuiz({ settings: { scoresReleased } })`), sortable roster `DataTable`, and CSV download require no changes.
- **`src/features/studentQuizzes/StudentQuizCatalogPage.tsx` & `QuizIntroPage.tsx`**:
  - Card listing, attempt counting, resume vs start buttons, and enrollment checks work as-is.

### Small Changes Needed
- **`src/features/quizzes/types/index.ts`**:
  - Extend `QuizMode` union: `'quiz' | 'flashcards' | 'canvas'`.
  - Add `layoutMode?: 'scattered' | 'fixed'` to settings or canvas definition.
  - Extend `SubmittedAnswer`: currently `string | string[]`. For canvas, drawn connections can be represented as an array of edge strings (e.g. `["cardA->cardB", "cardC->cardD"]`) or a connection map.
  - Add canvas question and answer key interfaces (`CanvasQuestion`, `CanvasAnswerKey`).
- **`src/features/quizzes/schemas/index.ts`**:
  - `parseQuiz`: Accept `'canvas'` in `mode` validation.
  - `parseQuizSettings`: Enforce `participation.type === 'individual'` for canvas quizzes.
  - `parseQuizAttempt`: Validate that canvas connection lists do not exceed the 80-connection limit.
  - `parseQuizResult`: Validate canvas question result entries.
- **`src/features/quizzes/schemas/settings.ts`**:
  - `defaultQuizSettings`: Return default settings for `'canvas'` (`answerReveal: 'after_submit'`, `scoreVisibility: 'immediate'`).
- **`src/features/quizzes/editor/validation.ts` & `QuizEditorPage.tsx`**:
  - Add `'canvas'` option to `QuizEditorPage.tsx` format picker.
  - Tab router: Route canvas quizzes to a canvas workspace rather than the standard question list tab.
- **`src/features/quizzes/authoring/QuickCreateQuiz.tsx`**:
  - Add `'Canvas'` button to quiz creation type selector.
- **`src/features/quizzes/services/attemptService.ts`**:
  - `startAttempt`: Verify card count > 0 rather than `questionSnapshot.docs.length > 0` (or treat the board as 1 question). Bypass question/option order shuffling; initialize layout positions if scattered.
  - `submitAttempt`: Pass canvas questions and answer keys into `gradeAttempt`.
- **`src/features/quizzes/services/resultService.ts`**:
  - `setQuestionGradeOverride`: Line 65 currently checks `if (question.type !== 'identification' && question.type !== 'fill_blank') throw new Error(...)`. Allow overrides for canvas question types.
- **`src/features/quizzes/results/AttemptDetail.tsx`**:
  - Add canvas connection list / visual graph review section alongside choice/identification renderers.
- **`src/features/studentQuizzes/QuizResultPage.tsx`**:
  - Render student drawn connections vs correct and key connections when `showAnswers` is true.

### New Code Needed
- **`src/features/canvas/types.ts` & `schemas.ts`**: Card types (Note, Paragraph, Drive Image, Link), board limits (50 cards, 80 connections, 1,000 chars), connection definitions (`isKey`, `points`).
- **`src/features/canvas/authoring/CanvasEditor.tsx`**: Visual card builder, placement canvas, connection wiring tool, Drive thumbnail/embed validator, and scatter preview.
- **`src/features/canvas/taking/CanvasTakingView.tsx`**: Student board component providing visual connection drawing, card drag/view, and scatter initialization.
- **`src/features/canvas/components/AccessibleConnectionDialog.tsx`**: Non-drag, keyboard and tap accessible connection manager.
- **`src/features/canvas/components/CanvasDiffView.tsx`**: Visual overlay for results showing correct (green), key (accent/badge), missed (dashed grey), and wrong (red) connections.

*(Note: `docs/architecture.md` was referenced in the prompt but does not exist in the repository; architectural standards were verified in `AGENTS.md` and `docs/quiz-domain.md`.)*

---

## 2. Data Model Proposal

### Where Cards, Connections, and Layout Live
Per the architectural principles in `AGENTS.md` and `docs/quiz-domain.md`, participant-facing questions and instructor answer keys must remain strictly separated. Storing correct connections on the top-level quiz document would expose answers to any enrolled student reading `quizzes/{quizId}`.

Therefore, the recommended storage model fits directly into the existing subcollections:

1. **Board Content (Cards & Instructor Layout)**:
   - Stored in `quizzes/{quizId}/questions/board` as a single question record with `type: 'canvas'`.
   - Payload:
     ```ts
     {
       order: 0,
       type: 'canvas',
       prompt: 'Connect related concepts, terms, and evidence.',
       points: 100, // Total points for the board
       layoutMode: 'scattered', // or 'fixed'
       cards: [
         {
           id: 'card_1',
           type: 'note' | 'paragraph' | 'image' | 'link',
           title?: string,
           content: string, // max 1,000 chars
           url?: string,    // Google Drive or HTTPS URL
           position: { x: number, y: number } // instructor default coordinates
         }
       ]
     }
     ```
2. **Answer Key (Correct & Key Connections)**:
   - Stored in `quizzes/{quizId}/answerKeys/board` with `type: 'canvas'`.
   - Payload:
     ```ts
     {
       type: 'canvas',
       explanation: 'Overview of correct relationships...',
       caseSensitive: false,
       connections: [
         {
           id: 'conn_1',
           from: 'card_1',
           to: 'card_2',
           isKey: boolean,
           points: number,
           directed: boolean // or global setting
         }
       ]
     }
     ```

### Firestore 1 MiB Document Limit Check
- **Cards limit (50 cards, 1,000 chars each)**:
  - 50 cards × (1,000 chars text + ~200 bytes metadata/keys/position) ≈ 60 KB.
  - 60 KB is **5.7%** of the 1,048,576 bytes (1 MiB) limit for `questions/board`.
- **Connections limit (80 connections)**:
  - 80 connections × (~150 bytes per connection entry) ≈ 12 KB.
  - 12 KB is **1.1%** of the 1,048,576 bytes limit for `answerKeys/board`.
- Both documents easily fit within Firestore document limits with substantial headroom. Storing cards as a single question document avoids creating 50 separate Firestore documents and queries per quiz.

### Student Attempt Shape
Stored inside `quizzes/{quizId}/attempts/{attemptId}` in the existing `answers` map (`Record<string, SubmittedAnswer>`):
```ts
answers: {
  board: [
    "card_1->card_2",
    "card_3->card_7",
    "card_2->card_5"
  ]
}
```
- For 80 drawn connections, the string array requires ~3.2 KB.
- Fits within `validAttempt` in `firestore.rules` (which limits `data.answers` to 200 keys) and satisfies the 1 MiB attempt document limit.
- If student-dragged card coordinates are preserved across autosaves, a separate map (e.g. `cardPositions: Record<string, { x: number, y: number }>`) can be stored in the attempt document or local session storage.

---

## 3. Grading via `gradeAttempt`

The single pure grading function `gradeAttempt` (`src/features/quizzes/grading/grade.ts`) processes all quiz submissions. Canvas mode integrates by treating the canvas board as a question item (`question.type === 'canvas'`).

### How It Fits
In `gradeAttempt`:
1. Looks up `key = answerKeys[question.id]` where `key.type === 'canvas'`.
2. Normalizes student connections from `answers[question.id]` (e.g. sorting node IDs if undirected: `min(A,B) + '<->' + max(A,B)`).
3. Compares submitted connections against `key.connections`:
   - Matches earn designated connection points.
   - Key connections are tallied and flagged.
4. Generates `perQuestion[question.id]`:
   ```ts
   perQuestion['board'] = {
     correct: pointsAwarded === question.points,
     pointsAwarded: Math.max(0, pointsAwarded),
     overridden: false
   }
   ```

### Open Grading Decisions (Not Decided)
1. **Connection Directionality**: Are connections directed (`A -> B` distinct from `B -> A`), undirected (`A <-> B`), or configurable per connection or board?
2. **Wrong and Extraneous Connections Policy**:
   - Option A: Flat penalty per incorrect connection (e.g. -1 pt), capped at a floor of 0.
   - Option B: Precision-recall / F1 score formula (penalizes guessing without arbitrary point subtraction).
   - Option C: Zero penalty (only correct connections earn points), which may allow students to draw all possible connections unless connection counts are strictly capped.
3. **Key Connections Mechanics**:
   - Option A: Key connections simply carry higher point values (e.g. 5 points vs 1 point).
   - Option B: Key connections act as mandatory gatekeepers (missing a key connection caps the total score or nullifies dependent sub-graph points).
4. **Attempt Connection Cap for Students**: Can a student draw up to the system limit (80 connections), or is the student limited to the exact number of instructor connections (or instructor count + buffer)?
5. **Score Granularity in Results**: Should `perQuestion` report only the aggregate board score, or should individual key connections be listed as sub-items for granular instructor overrides in `AttemptDetail.tsx`?

---

## 4. Security Rules Impact (`firestore.rules`)

The following sections of `firestore.rules` would need adjustments (descriptions only; no edits performed):

1. **`validQuiz` (Line 500)**:
   - Change `data.mode in ['quiz', 'flashcards']` to `data.mode in ['quiz', 'flashcards', 'canvas']`.
2. **`validQuizSettings` (Lines 470–492)**:
   - Add validation for canvas mode: must require `settings.participation.type == 'individual'` (group canvases disallowed in v1).
   - May require `settings.shuffleQuestions == false` and `settings.shuffleOptions == false` when `mode == 'canvas'`.
3. **`validQuestion` (Lines 527–538)**:
   - Extend `data.type in [...]` to allow `'canvas'`.
   - Add schema checks for `canvas`:
     - `data.cards` is list, `data.cards.size() <= 50`.
     - Each card must have `id`, `type in ['note', 'paragraph', 'image', 'link']`, `content` size <= 1,000 chars.
     - Host regex checks on card URLs:
       - For `'image'` (Google Drive): enforce `^https://(drive|docs)\.google\.com/.*` (matching existing module resource regex in line 45).
       - For `'link'`: enforce `^https://[^ ]+$` (matching line 47).
4. **`matchingAnswerKey` & `validAnswerKey` (Lines 540–558)**:
   - In `matchingAnswerKey`: add `(questionType == 'canvas' && data.type == 'canvas')`.
   - In `validAnswerKey`: add validation for `data.type == 'canvas'`:
     - `data.connections` is list, `data.connections.size() <= 80`.
     - Each connection contains `from` (string), `to` (string), `isKey` (bool), `points` (number >= 0).
5. **`validAttempt` (Lines 560–570)**:
   - Currently requires `data.answers is map && data.answers.size() <= 200`.
   - When `data.answers` contains a canvas board answer, ensure the connection array size does not exceed 80 items (`data.answers.board.size() <= 80`).
   - The time-integrity checks (`startedAt == request.time` and `submittedAt == request.time`, lines 668 & 679) remain unchanged and protect canvas attempts identically.
6. **`validResult` (Lines 572–578)**:
   - No schema changes needed. Result documents require `userId`, `score`, `maxScore`, `perQuestion`, and `gradedAt`, which accommodate canvas scoring directly.

---

## 5. Library Check: `@xyflow/react`

- **Package**: `@xyflow/react` (React Flow v12, latest version 12.12.0).
- **License**: **MIT** (verified on npm registry and GitHub repository). Permissive open source.
- **Bundle Size**:
  - Unpacked size: **1.22 MB** (verified via npm registry: `dist.unpackedSize = 1,216,196`).
  - Minified + gzipped size: approximately **150 KB – 200 KB gzipped** (source: Bundlephobia / npm community benchmarks).
  - Also requires `@xyflow/react/dist/style.css` (approx. 15 KB unminified).
- **React 19 Compatibility**:
  - Peer dependencies: `react: '>=17'`, `react-dom: '>=17'`, `@types/react: '>=17'` (verified via `npm view @xyflow/react peerDependencies`).
  - Compatible with `package.json` dependencies: `react: "^19.2.8"`, `react-dom: "^19.2.8"`.
- **Vite 8 & Strict TypeScript**:
  - Native ESM bundle compatible with Vite 8.
  - Fully typed under strict TypeScript; exposes standard `Node<T>`, `Edge<T>`, `Connection`, and `OnConnect` types.
- **Tailwind v4 & Theme Compliance**:
  - Compatible with `@tailwindcss/vite` and Tailwind v4.
  - Custom nodes render standard JSX using project theme tokens (`bg-navy-900`, `text-navy-700`, `border-navy/15`).
  - Default React Flow node typography is small (~12px); custom card components must explicitly apply project font classes (`font-sans`, `text-sm`, `text-base`) and contrast pairs from `docs/contrast-report.md`.
- **Recommendation**: Because the library adds ~150–200 KB gzipped, canvas taking and authoring routes must be code-split using `React.lazy()` (following the pattern in `src/features/quizzes/editor/QuizEditorPage.tsx:22`) to avoid impacting loading performance for standard quizzes.

---

## 6. Accessibility & Non-Drag Alternative

Node canvases relying solely on pointer drag-and-drop fail multiple WCAG standards without an accessible alternative.

### Applicable WCAG 2.1 & 2.2 Standards
- **SC 2.1.1 Keyboard (Level A)**: All canvas functionality must be operable via keyboard.
- **SC 2.1.2 No Keyboard Trap (Level A)**: Navigating inside the canvas must not trap focus.
- **SC 2.5.7 Dragging Movements (WCAG 2.2 Level AA)**: All functionality that uses dragging (moving cards, drawing connections) must be achievable through a single-pointer alternative without dragging.
- **SC 1.4.1 Use of Color (Level A)**: Connection types (e.g. key vs normal connections) cannot rely solely on color; line styles (dashed vs solid) and badges must be present.
- **SC 4.1.3 Status Messages (Level AA)**: Additions and deletions of connections must be announced to assistive technology.

### Proposed Dual-Mode Interface

1. **Visual Canvas Mode (Mouse & Touch)**:
   - Drag to connect card handles.
   - Click card to select, then click another card handle to connect.
2. **Accessible "Connect Cards" Alternative (Keyboard, Screen Reader, & Single Tap)**:
   - A persistent, high-contrast action button ("Manage connections" / "Connect cards") accessible in normal tab order outside the canvas element.
   - Opening it displays a dialog or slide-out drawer containing:
     - **Source Card Selector**: `<Select>` or radio list of all cards (e.g., `"Card 1: Cell Wall (Note)"`).
     - **Target Card Selector**: `<Select>` of remaining available cards.
     - **Action**: `"Create connection"` button with minimum 44px touch target.
     - **Active Connections List**: A semantic table or list of existing connections:
       - Displays: `"Card 1 (Cell Wall) → Card 3 (Plant Structure)"`.
       - Each entry provides a clearly labelled `"Disconnect"` button (`aria-label="Disconnect Cell Wall from Plant Structure"`).
   - In-canvas keyboard controls: Focusable card nodes (`tabIndex={0}`), Enter/Space to select origin card, Arrow keys to traverse nodes, Enter to link destination card, Escape to cancel.
   - Screen reader live announcements (`aria-live="polite"`) announcing: `"Connection created between Cell Wall and Plant Structure."`

---

## 7. Risks and Proposed Prompt Split

### Top 5 Risks
1. **Mobile Viewport & Touch Conflict**: Handling 50 cards and 80 connections on 360px mobile viewports risks touch gesture collisions (canvas panning vs page scrolling) and congested touch targets (<44px).
2. **V1 Client-Side Grading Security Boundary**: As noted in `docs/quiz-domain.md` and `docs/security-rules-review.md`, quiz grading in v1 is browser-side. Any enrolled student taking the quiz can inspect network/state to view `quizzes/{quizId}/answerKeys/board` before drawing connections.
3. **Rendering Performance at Limit Scale**: Rendering 50 custom nodes (especially cards with Google Drive thumbnails or paragraphs) and 80 SVG connection lines may cause frame drops on low-powered school devices without node memoization and viewport culling.
4. **Scattered Layout Determinism & Overlap**: Randomly scattering 50 cards across a canvas can generate card overlaps or place cards outside visible bounds, causing frustration unless an automated force-directed / non-overlapping grid distribution algorithm is applied.
5. **Grading Penalty Exploitation vs Over-Penalization**: Without a carefully balanced policy on extra/incorrect connections, students could either game grading by connecting all cards in a clique, or suffer severe score deductions from unintentional misclicks.

### Proposed Prompt Split (6 Small Prompts)

- **Prompt 1: Domain Schemas, Types, and Pure Grading Logic**
  - Update `src/features/quizzes/types/index.ts` and `schemas/index.ts` to include `'canvas'` mode.
  - Implement canvas grading and key connection scoring in `src/features/quizzes/grading/grade.ts` with comprehensive unit tests in `grade.test.ts`.
- **Prompt 2: Firestore Security Rules & Hardening**
  - Update `firestore.rules` for `'canvas'` mode, question/answer key validation, card limits (50 cards, 80 connections, 1,000 chars), and Drive/HTTPS URL regexes.
  - Add security unit tests in `src/lib/firebase/quiz.rules.test.ts`.
- **Prompt 3: Core Canvas Components & Library Setup**
  - Install `@xyflow/react` and configure styles with Tailwind v4 theme tokens.
  - Implement lazy-loaded canvas wrapper, custom card node types (Note, Paragraph, Drive Image, Link), and responsive viewport boundaries.
- **Prompt 4: Accessible Connection Manager (WCAG 2.2 AA)**
  - Build `AccessibleConnectionDialog` (non-drag tap/keyboard connection manager) with live region announcements and 44px touch targets.
  - Add unit and accessibility tests.
- **Prompt 5: Instructor Authoring & Preview Experience**
  - Build the instructor canvas editor tab in `QuizEditorPage.tsx`, card creation forms, connection wiring, scatter toggle, and preview tab.
  - Connect auto-saving and draft state.
- **Prompt 6: Student Taking, Auto-Grading, & Results Review**
  - Build `CanvasTakingView.tsx` integrated with `QuizTakingPage.tsx` (scattered card initialization, autosave via `attemptService.ts`, submission via `submitAttempt`).
  - Update `QuizResultPage.tsx` and `AttemptDetail.tsx` with `CanvasDiffView` to display correct, key, and incorrect connections with instructor override support.
