# Inventory: Removal of Canvas Quiz Activities

This document records the inventory of every place the "canvas activity" (Canvas quiz mode, `mode: 'canvas'`) touched in Peerly Collab, and the disposition of each file.

## 1. What is being removed
The Canvas quiz mode on a quiz (`mode: 'canvas'`, with `boardKind` `'prebuilt'` or `'blank'`), including:
- Quiz authoring & creation (QuickCreateQuiz Canvas type card, Canvas type picker, `mode=canvas` URL parameter)
- Class pages Canvas tab for instructors and students, "Create canvas" buttons, counts, and deep links (`?tab=canvas`)
- Quiz editor canvas builder (`CanvasBuilderPage`, `BlankCanvasBuilder`), "Submission review" settings, and preview tab canvas rendering
- Group canvas participation, play, and server-side grading
- Canvas question taking (`CanvasPlayPage`, `BlankCanvasPlayPage`), review, manual grading of blank canvas boards, and CSV exports
- Cloud Functions canvas handling and grading in `functions/src/`
- Quiz canvas subcollections: `quizzes/{quizId}/images`, `questions/board`, `teamBoards`

## 2. Shared Code in `src/features/canvas` - Analysis & Disposition
A separate feature, "Learning Canvas" (`src/features/learningCanvas`), provides open spatial study boards for classes and personal workspaces. We inspected every file in `src/features/canvas` for imports outside the quiz canvas feature:

| File | Status | Reason |
| --- | --- | --- |
| `canvas.css` | **KEPT** | Imported by `src/features/learningCanvas/components/LearningCanvas.tsx` for `.canvas-handle` (44px touch hit area). |
| `constants.ts` | **KEPT** | Imported by `src/features/learningCanvas/components/LearningCanvas.tsx` for card sizing and zoom limits. |
| `imageProcessing.ts` & `.test.ts` | **KEPT** | Imported by `src/features/learningCanvas/components/LearningCanvas.tsx` and `ImageCard.tsx` (`processImageFile`). |
| `mapping.ts` & `.test.ts` | **KEPT** | Imported by `src/features/learningCanvas/components/LearningCanvas.tsx` for `getOptimalHandles`. |
| `components/CardHandles.tsx` | **KEPT** | Imported by `TextCard`, `ReferenceCard`, `LinkCard`, and `ImageCard` in `src/features/learningCanvas`. |
| `components/CanvasControls.tsx` | **KEPT** | Imported by `src/features/learningCanvas/components/LearningCanvas.tsx`. |
| `components/ExpandableCanvasContainer.tsx` & `.test.tsx` | **KEPT** | Imported by `src/features/learningCanvas/components/LearningCanvas.tsx` for fullscreen container layout. |
| `safeUrl.ts` & `.test.ts` | **KEPT** | Shared utility function for sanitizing and validating HTTPS URLs. |
| `placement.ts` & `.test.ts` | **DELETED** | Only used by `CanvasBuilderPage` and `BlankCanvasPlayPage` (0 external users). |
| `imageService.ts` | **DELETED** | Only used for `quizzes/{quizId}/images` subcollection (0 external users). |
| `schemas.ts` & `canvas.test.ts` | **DELETED** | Quiz canvas card and connection schemas (0 external users). |
| `types.ts` | **DELETED** | Quiz canvas types: `CanvasQuestion`, `CanvasAnswerKey`, etc. (0 external users). |
| `components/CanvasBoard.tsx` & tests | **DELETED** | Quiz board component (0 external users). |
| `components/CanvasReviewView.tsx` & tests | **DELETED** | Quiz canvas result review (0 external users). |
| `components/CanvasTextOutline.tsx` & tests | **DELETED** | Quiz canvas plain text outline (0 external users). |
| `components/CardEditorPanel.tsx` | **DELETED** | Quiz canvas card editor (0 external users). |
| `components/CanvasImagesContext.tsx` | **DELETED** | Quiz canvas images context (0 external users). |
| `components/edges/*` | **DELETED** | Quiz edge rendering (0 external users; Learning Canvas has `LearningCanvasEdge.tsx`). |
| `components/nodes/*` | **DELETED** | Quiz card components (0 external users; Learning Canvas has its own card components). |
| `index.ts` | **UPDATED** | Cleaned up to re-export only remaining shared canvas utilities and components. |

## 3. Files Deleted
### `src/features/quizzes/builder/`
- `CanvasBuilderPage.tsx`
- `CanvasBuilderPage.test.tsx`
- `BlankCanvasBuilder.tsx`
- `BlankCanvasBuilder.test.tsx`

### `src/features/classes/`
- `ClassCanvasTab.tsx`
- `ClassCanvasTab.test.tsx`

### `src/features/studentQuizzes/`
- `CanvasPlayPage.tsx`
- `CanvasPlayPage.test.tsx`
- `BlankCanvasPlayPage.tsx`
- `BlankCanvasPlayPage.test.tsx`
- `group/TeamCanvasPlay.tsx`
- `group/TeamCanvasPlay.test.tsx`

### `src/features/canvas/`
- `placement.ts`, `placement.test.ts`
- `imageService.ts`
- `schemas.ts`, `canvas.test.ts`
- `types.ts`
- `components/CanvasBoard.tsx`, `CanvasBoard.test.tsx`, `CanvasBoardMutations.test.tsx`
- `components/CanvasReviewView.tsx`, `CanvasReviewView.test.tsx`
- `components/CanvasTextOutline.tsx`, `CanvasTextOutline.test.tsx`
- `components/CardEditorPanel.tsx`
- `components/CanvasImagesContext.tsx`
- `components/CanvasLinkSafety.test.tsx`
- `components/edges/CanvasEdge.tsx`, `CanvasEdge.test.tsx`, `edgeTypes.ts`
- `components/nodes/ImageCard.tsx`, `LinkCard.tsx`, `NoteCard.tsx`, `ParagraphCard.tsx`, `CardHandles.tsx`, `nodeTypes.ts`, `nodes.test.tsx`

### `functions/src/`
- `groupQuizCanvasValidation.ts`
- `groupQuizCanvasValidation.test.ts`
- `groupQuizGradingParity.test.ts`

## 4. Files Modified
- `src/features/quizzes/types/index.ts`: Narrow `QuizMode` to `'quiz' | 'flashcards'`. Remove `BoardKind`, `CanvasQuestion`, `CanvasAnswerKey`, `BlankCanvasAnswerCard`, `BlankCanvasAnswer`, `ReviewStatus`, `reviewStatus`, `feedback`, `gradedBy`. `SubmittedAnswer = string | string[]`.
- `src/features/quizzes/schemas/index.ts`: Remove canvas mode, question and key validation, blank canvas answer and reviewStatus parsing.
- `src/features/quizzes/schemas/settings.ts`: Set default `answerReveal` for quiz to `'after_each'`.
- `src/features/quizzes/authoring/QuickCreateQuiz.tsx`: Remove Canvas type option, remove Canvas type picker, remove `isCanvasFromClass`, default unknown `?mode=` to `'quiz'`.
- `src/features/quizzes/editor/QuizEditorPage.tsx`: Remove canvas builder branch, remove submission review card, remove canvas labels.
- `src/features/quizzes/editor/QuizPublishTab.tsx`: Remove canvas preview, `ExpandableCanvasContainer`, `CanvasBoard`, and canvas image loading.
- `src/features/quizzes/editor/quizExperience.ts`: Remove canvas participation and experience description.
- `src/features/quizzes/editor/GroupSettingsSection.tsx`: Remove canvas branches.
- `src/features/quizzes/editor/validation.ts`: Remove `boardKind`.
- `src/features/quizzes/results/QuizResultsPage.tsx`: Remove `isBlankCanvas`, `reviewFilter`, and canvas table cells.
- `src/features/quizzes/results/AttemptDetail.tsx`: Remove canvas review, manual blank board grading form, and canvas image fetching.
- `src/features/quizzes/results/resultLogic.ts`: Remove blank canvas special handling in `summarizeAttempts` and reviewStatus in CSV export.
- `src/features/quizzes/services/quizService.ts`: Filter out legacy canvas documents in central safe record parser `asRecord` so they never crash or appear in any list; remove canvas legacy image validation in `setStatus`.
- `src/features/quizzes/services/questionService.ts`: Remove canvas question type matching and options.
- `src/features/quizzes/services/duplicateQuiz.ts`: Remove canvas board and image duplication.
- `src/features/quizzes/services/attemptService.ts`: Remove blank canvas branch on submit.
- `src/features/quizzes/services/resultService.ts`: Remove `gradeBlankCanvasAttempt`.
- `src/features/quizzes/services/teamService.ts`: Remove `TeamBoardData`, `saveTeamBoard`, `watchTeamBoard`, `getTeamBoard`.
- `src/features/quizzes/QuizTypeBadge.tsx` & `.css`: Remove canvas mode chip.
- `src/features/quizzes/dashboard/quizList.ts` & `InstructorQuizzesPage.tsx`: Remove canvas filter and labels.
- `src/features/classes/ClassPage.tsx`: Remove Canvas tab, remove canvas count from StatTile, update `tabNames` so `?tab=canvas` lands on default Modules tab.
- `src/features/classes/ClassQuizzesTab.tsx`: Remove link to Canvas tab.
- `src/features/classes/classActivities.ts`: Remove canvas filter and `canvasBoardStatus`.
- `src/features/classes/services/quizService.ts`: Filter out legacy canvas documents so class pages and dashboards remain unaffected.
- `src/features/classes/StudentClassPage.tsx`: Remove canvas badge.
- `src/features/studentQuizzes/QuizTakingPage.tsx`: Remove canvas taking branches.
- `src/features/studentQuizzes/QuizResultPage.tsx`: Remove canvas result preview.
- `src/features/studentQuizzes/QuizIntroPage.tsx`: Remove canvas intro branches.
- `src/features/studentQuizzes/StudentQuizCatalogPage.tsx`: Remove canvas filter and labels.
- `src/features/studentQuizzes/group/GroupQuizPage.tsx`: Remove `TeamCanvasPlay`.
- `src/features/studentQuizzes/group/TeamResults.tsx`: Remove canvas checks.
- `functions/src/groupQuizData.ts`: Revert `mode` to `'quiz'`, remove `boardKind`.
- `functions/src/groupQuizFinish.ts`: Remove canvas group quiz finish branch.
- `functions/src/groupQuizGrading.ts`: Remove canvas grading function and types.
- `functions/src/groupQuizPlay.ts`: Remove canvas group quiz play branch.
- `firestore.rules`: Lock down legacy canvas quizzes (deny create/update, allow owner delete).
- `src/styles/contrast.test.ts`: Remove deleted `CanvasEdge.tsx` from allowed inline styles.
- `AGENTS.md` & `docs/quiz-domain.md`: Remove canvas quiz descriptions.

## 5. Cleanup Script
- Created `scripts/remove-canvas-quizzes.ts`: Idempotent script that lists canvas quizzes and cascades deletion of all subcollections and the quiz document only when `--apply` is passed. Requires emulator or `--i-understand-this-is-production`.
