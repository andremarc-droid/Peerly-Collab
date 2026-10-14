# Design: Practice Missed Questions (Mastery Mode) for Instructor Quizzes

## Requirement
"Missed questions return in mastery mode" exists in `src/features/studyEngine/quizSession.ts` (`retryMissed`) but not for instructor quizzes. Add an optional "Practice missed questions" mastery round after submitting an instructor quiz, using the existing session logic. It must not change the graded result or create new graded attempts.

## Architecture
1. **Source of Missed Questions**:
   - On `QuizResultPage`, once the result and question review are loaded, inspect `result.perQuestion`.
   - Identify questions where `result.perQuestion[q.id]?.correct === false` (or points awarded < points).
   - If one or more missed questions exist and answer keys are visible (`visibility.showAnswers`), offer a prominent action: "Practice missed questions (<count>)".

2. **Session Engine**:
   - Use the pure state helpers from `src/features/studyEngine/quizSession.ts`:
     - `startQuizSession(questions)`
     - `answerQuestion(session, answer, verdict)`
     - `nextQuestion(session)`
     - `retryMissed(session)`
     - `quizSessionComplete(session)`
     - `quizSummary(session)`
   - Pure in-memory session. Never writes to Firestore `attempts` or `results`. The graded result is completely immutable.

3. **User Flow**:
   - On `QuizResultPage`, a "Practice missed questions" button appears in the score/summary card when missed questions exist.
   - Clicking it toggles into Mastery Mode:
     - Shows current round (Round 1, Round 2, etc.) and progress (`Question X of Y`).
     - Shows prompt, and options for choice / input for identification / text for fill_blank.
     - Upon answering, immediately shows verdict ("Correct!" / "Incorrect, the answer is: ..."), explanation, and "Next question".
     - At end of round:
       - If some were missed: summarizes missed count and offers "Retry missed questions" (`retryMissed`), which loops missed questions into Round N+1.
       - If all answered correctly: shows celebration banner "Mastery achieved! You got all previously missed questions right."
     - "Back to result review" exits mastery mode back to the standard result review.

4. **Component Structure**:
   - New component: `src/features/studentQuizzes/components/MasteryPractice.tsx`.
   - Integration: Rendered within `QuizResultPage.tsx` when user chooses to enter mastery mode.
   - Tests: `src/features/studentQuizzes/components/MasteryPractice.test.tsx`.
