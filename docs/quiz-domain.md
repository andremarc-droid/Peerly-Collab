# Quiz domain v1

## Collections

- `quizzes/{quizId}` stores instructor ownership, title, description, tags, mode, status, question count, timestamps, and settings.
- `quizzes/{quizId}/questions/{questionId}` stores the question prompt, type, order, points, and choice options. It deliberately contains no answers.
- `quizzes/{quizId}/answerKeys/{questionId}` stores accepted answers, explanation, and case-sensitivity independently from the participant-facing question.
- `quizzes/{quizId}/participants/{uid}` marks a student who started and tracks their attempt count and active attempt.
- `quizzes/{quizId}/attempts/{attemptId}` stores the student's submitted answers and question/option order. Submission closes an in-progress attempt.
- `quizzes/{quizId}/results/{attemptId}` stores points and per-question grading independently so score visibility can be enforced by Firestore rules.

## Settings and grading

Quiz mode supports multiple choice, true/false, identification, fill-in-the-blank, flashcards, and canvas. Flashcards use neutral answer reveal and score defaults and receive no grade. Attempts have either a positive integer limit or `null` for unlimited; time limits similarly accept a positive integer or `null`. Group participation is modeled for group sizes 2–10, though the initial instructor UI can keep it disabled until collaboration is available.

Canvas mode supports interactive concept mapping where instructors place up to 50 cards (note, paragraph, Google Drive image, HTTPS link) and configure correct connections (up to 80) with optional point weights, layout mode ('scattered' or 'fixed'), directionality, and wrong penalty ('none', 'half', or 'full'). Canvas quizzes are restricted to individual participation (`participation: { type: 'individual' }`) with `shuffleQuestions: false` and `shuffleOptions: false`, and require exactly 1 question (`questionCount == 1`) to publish.

Grading is exposed through one `gradeAttempt` pure function. Choice questions compare option IDs; identification accepts normalized alternatives; each fill blank earns an equal fraction of the question points; flashcards are not graded. Canvas grading evaluates student connections up to `min(80, 2 * key.length)`, ignores unknown card IDs and self-connections, deducts penalties based on the chosen wrong penalty policy, and awards net points floored at 0. Typed answers trim and collapse whitespace and compare case-insensitively unless a key opts into case sensitivity. The service boundary is designed so later server-side grading can replace browser grading.

Attempt time integrity uses server-verified timestamps: `startedAt` must equal `request.time` upon creation, and `submittedAt` must equal `request.time` upon submission. Timed quizzes do not block late submissions in Firestore rules; instead, submissions after the time limit (plus 120s network grace) are accepted and flagged as late via pure helper `isLate`, preventing attempts from becoming trapped in `in_progress` and blocking subsequent attempts. Instructors see a "Late" badge, late duration ("Late by M min"), a "Late submissions" summary count, and a Late column in CSV exports, retaining discretion over grade overrides without automatic score deductions.

## Firestore access

The existing collab-notes rules remain in place for their collections. Quiz reads allow the owner or signed-in users for published quiz/question documents. Only users whose `/users/{uid}` profile role is `instructor` may create an owned draft. Owners manage quiz content, answer keys, lifecycle, and overrides. Students create their own participant and in-progress attempt records for published quizzes, then can only submit their own attempt with a server-stamped `submittedAt`. Submitted attempts cannot be changed. Result reads are owner-only unless the quiz setting exposes them immediately or after release. Unmatched document paths remain denied.

For canvas quizzes:
- The question board must use document id `board` at `quizzes/{quizId}/questions/board` and its answer key at `quizzes/{quizId}/answerKeys/board`.
- Firestore security rules cannot loop over lists. Consequently, rules enforce list-level caps (`cards.size() <= 50`, `connections.size() <= 80`, `answers.board.size() <= 80`, `answers.layout.size() <= 50`) and top-level fields. Individual card contents, Drive IDs, URL formats, and connection endpoints are validated client-side by domain schemas (`validateCanvasDefinition`, `validateCanvasKey`), and card URLs are checked against domain allowlists when rendered.

## V1 limitation

Grading currently happens in the browser. A participant who can read an answer key can inspect it and potentially reveal correct answers before answering. In canvas mode, once an attempt has started and the student participant document exists, the canvas answer key (`answerKeys/board`) is readable by the student under Firestore rules. This is intended for practice and formative learning in v1. Separating keys from questions and limiting reads to quiz participants reduces casual exposure, but it is not a security boundary against a determined client. Move grading and answer-key access behind a trusted Cloud Function before relying on high-stakes assessments.

## Indexes

`firestore.indexes.json` defines the owner quiz list (`ownerId` with descending `updatedAt`), published catalog (`status` with descending `publishedAt`), and per-quiz attempts by `userId` and descending `startedAt`.

Review the added `quizzes` rule match and deploy it only after reviewing the access model and v1 client-grading limitation. No deploy is performed by this project workflow.
