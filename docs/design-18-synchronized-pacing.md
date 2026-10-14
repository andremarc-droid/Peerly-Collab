# Design Note: Synchronized Class-Wide Quiz Pacing (Item 18)

## 1. Problem & Goal
AGENTS.md defines the learning principle: "Pacing options are self-paced, timed, or waiting until all students have answered before moving on." Currently, live game sessions are restricted to flashcard decks or lesson plans, and synchronous waiting is only partially supported in team quizzes.
This design adds a class-wide synchronized live session for instructor-authored quizzes, server-enforced through the `liveGames` Cloud Functions backend, with configurable pacing:
- `'timed'` (default countdown per question)
- `'wait_for_everyone'` (advances or reveals automatically once all enrolled/joined participants submit their answers)
- `'self_paced'` (questions are served as the student progresses, or host-controlled unlock)

## 2. Architecture & File Changes
1. **`functions/src/gameLogic.ts`**:
   - Add `PacingMode = 'timed' | 'wait_for_everyone' | 'self_paced'`.
   - Update `GameDoc` / `GameProgress` / `GameQuestion` to include `pacing: PacingMode`.
   - Extend `actionForAdvance` and `everyoneAnswered` handling for wait-for-everyone mode.
2. **`functions/src/gameRequests.ts`**:
   - Extend `GameSourceRequest` with `{ kind: 'quiz', classId: string, quizId: string }`.
   - Add `pacing?: PacingMode` to `CreateGameRequest` (validates `'timed' | 'wait_for_everyone' | 'self_paced'`, defaults to `'timed'`).
3. **`functions/src/gameData.ts`**:
   - In `loadQuestions`, add support for `source.kind === 'quiz'`:
     - Verifies caller is instructor or owner of `classes/{classId}`.
     - Loads questions from `quizzes/{quizId}/questions` and verifies options against `quizzes/{quizId}/answerKeys`.
     - Parses questions into standard `GameQuestion[]` (min 5, max 20).
4. **`functions/src/liveGames.ts`**:
   - In `submitAnswer`: if `game.pacing === 'wait_for_everyone'`, check `everyoneAnswered(playerCount, answers.size)`. When all players have answered, automatically trigger reveal state write in the transaction so the group advances together immediately.
5. **UI (`src/features/games/` & `src/features/quizzes/`)**:
   - Add "Live class session" button on quiz pages with pacing selector (`Timed`, `Wait for everyone`, `Self-paced`).
6. **Tests**:
   - `functions/src/gameLogic.test.ts`: verify pacing actions and `everyoneAnswered` logic.
   - `functions/src/gameRequests.test.ts`: test `parseCreateGameRequest` with `quiz` source and `pacing` options.
