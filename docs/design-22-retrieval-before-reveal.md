# Design Note: Server-Side Retrieval-Before-Reveal & Answer Key Protection

## 1. Problem Statement & Threat Model
In the current Peerly Collab implementation, individual quiz grading and the "after_each" immediate feedback loop occur entirely browser-side.

In `firestore.rules`:
```cel
match /answerKeys/{questionId} {
  allow read: if quizOwner(quizId)
    || (isStudent() && quizPublished(quizId) && !quizIsGroup(quizId) && quizHasParticipant(quizId, request.auth.uid));
  allow create, update: if quizOwner(quizId) ...;
  allow delete: if quizOwner(quizId);
}
```

Because `isStudent() && quizPublished(quizId) && quizHasParticipant(quizId, request.auth.uid)` grants direct read access to all answer key documents in `quizzes/{quizId}/answerKeys/{questionId}` as soon as the student registers as a participant, any participant can inspect network requests or query Firestore directly via devtools to read correct answers, explanations, and rubric guides before submitting any question.

This violates the core learning principle: **Retrieval before reveal** (students must commit to an answer before seeing whether it was correct or what the answer was).

---

## 2. Target Architecture

```
                  ┌────────────────────────────────────────┐
                  │          QuizTakingPage (Client)       │
                  └──────────────────┬─────────────────────┘
                                     │
           1. Locks question response│ 
           2. Calls checkQuestionAnswer({ quizId, attemptId, questionId, response })
                                     │
                                     ▼
                  ┌────────────────────────────────────────┐
                  │    POST /api/quizCheckQuestion         │
                  │    or onCall checkQuestionAnswer       │
                  └──────────────────┬─────────────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │                                 │
     Validates auth token (admin)        Loads question & answerKey
     Verifies attempt.status == 'in_progress' (Server-side Admin SDK)
     Verifies attempt.userId == auth.uid              │
                    │                                 ▼
                    │                     Runs gradeQuestionAnswer()
                    │                                 │
                    ▼                                 ▼
         Records locked response in       Returns sanitized result:
         attempt.answers[questionId]      { isCorrect, pointsAwarded,
                                            explanation, correctAnswer }
```

---

## 3. Specifications & Changes Required

### A. Firestore Security Rules
Change `quizzes/{quizId}/answerKeys/{questionId}` to allow read only for the quiz owner:

```cel
match /answerKeys/{questionId} {
  allow read: if quizOwner(quizId);
  allow create, update: if quizOwner(quizId)
    && validAnswerKey(request.resource.data)
    && matchingAnswerKey(quizId, questionId, request.resource.data);
  allow delete: if quizOwner(quizId);
}
```
*Result:* Participants can never query or read answer keys directly from client Firestore SDK.

### B. Server-Side Endpoints
Implement two callable functions / API routes:

1. `checkQuestionAnswer({ quizId, attemptId, questionId, response })`:
   - **Preconditions**:
     - Caller is authenticated with a non-anonymous Firebase ID token.
     - `quizzes/{quizId}` exists and is published (`status === 'published'`).
     - `quizzes/{quizId}/settings.answerReveal === 'after_each'`.
     - `quizzes/{quizId}/attempts/{attemptId}` exists, has `userId === auth.uid`, and `status === 'in_progress'`.
     - Question `questionId` has not already been permanently locked/evaluated in `attempt.answers` (prevents replay/tampering).
   - **Execution**:
     - Read question: `quizzes/{quizId}/questions/{questionId}`.
     - Read answer key: `quizzes/{quizId}/answerKeys/{questionId}`.
     - Grade using pure `gradeSingleQuestion(question, answerKey, response)` from `src/features/quizzes/grading/grade.ts`.
     - Persist `answers[questionId] = { response, graded: { pointsAwarded, isCorrect, timestamp: now } }` in `attempts/{attemptId}`.
   - **Response**:
     ```typescript
     interface CheckQuestionResult {
       questionId: string;
       isCorrect: boolean;
       pointsAwarded: number;
       maxPoints: number;
       explanation: string;
       correctAnswer: AnswerKeyData; // revealed only after locking
     }
     ```

2. `submitQuizAttempt({ quizId, attemptId, answers })`:
   - Grades the complete attempt server-side on submit (for both `after_each` and `after_submit` modes).
   - Calculates score from server-verified answer keys.
   - Writes `results/{attemptId}` with calculated score, timestamps, and review status.
   - Updates `attempts/{attemptId}.status = 'submitted'`.

### C. Client Layer (`src/features/studentQuizzes`)
1. In `QuizTakingPage.tsx`:
   - Replace direct loading of answer keys (`watchQuestionPairs` or `getQuestionWithKey`).
   - Only load question prompts and options from `quizzes/{quizId}/questions`.
   - In `after_each` mode:
     - "Check answer" calls `checkQuestionAnswer`.
     - Displays returned `isCorrect`, `explanation`, and `correctAnswer`.
   - In `after_submit` mode:
     - No answer keys are loaded during quiz taking.
     - Upon submit, calls `submitQuizAttempt`.

---

## 4. Edge Cases & Resilience
- **Network Glitches during `checkQuestionAnswer`**: If the network drops while checking an answer, the client retries with an idempotency key or checks if `attempt.answers[questionId]` already has the evaluated verdict.
- **Timed Quizzes (Auto-Submit)**: Auto-submit on timer expiry submits all entered answers immediately to `submitQuizAttempt` without checking each individually.
- **Mastery Practice Mode**: Offline or client-only practice sessions can use generated or previously revealed answers without touching production answer key security.

---

## 5. Phased Rollout Plan
1. **Phase 1 (Preparation)**:
   - Extract `gradeSingleQuestion` into shared isomorphic module usable by functions.
   - Build `checkQuestionAnswer` callable and unit test in `functions/src/`.
2. **Phase 2 (Client Migration)**:
   - Update `QuizTakingPage.tsx` to conditionally call `checkQuestionAnswer` when running with server grading.
3. **Phase 3 (Rules Lockdown)**:
   - Update `firestore.rules` to remove `isStudent()` read access on `/answerKeys/{questionId}`.
   - Run full emulator test suite to verify no student flows break.
