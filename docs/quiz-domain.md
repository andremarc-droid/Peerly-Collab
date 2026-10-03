# Quiz domain v1

## Collections

- `quizzes/{quizId}` stores instructor ownership, title, description, tags, mode, status, question count, timestamps, and settings.
- `quizzes/{quizId}/questions/{questionId}` stores the question prompt, type, order, points, and choice options. It deliberately contains no answers.
- `quizzes/{quizId}/answerKeys/{questionId}` stores accepted answers, explanation, and case-sensitivity independently from the participant-facing question.
- `quizzes/{quizId}/participants/{uid}` marks a student who started and tracks their attempt count and active attempt.
- `quizzes/{quizId}/attempts/{attemptId}` stores the student's submitted answers and question/option order. Submission closes an in-progress attempt.
- `quizzes/{quizId}/results/{attemptId}` stores points and per-question grading independently so score visibility can be enforced by Firestore rules.

## Settings and grading

Quiz mode supports multiple choice, true/false, identification, fill-in-the-blank, and flashcards. Flashcards use neutral answer reveal and score defaults and receive no grade. Attempts have either a positive integer limit or `null` for unlimited; time limits similarly accept a positive integer or `null`. Group participation is modeled for group sizes 2–10, though the initial instructor UI can keep it disabled until collaboration is available.

Grading is exposed through one `gradeAttempt` pure function. Choice questions compare option IDs; identification accepts normalized alternatives; each fill blank earns an equal fraction of the question points; flashcards are not graded. Typed answers trim and collapse whitespace and compare case-insensitively unless a key opts into case sensitivity. The service boundary is designed so later server-side grading can replace browser grading.

## Firestore access

The existing collab-notes rules remain in place for their collections. Quiz reads allow the owner or signed-in users for published quiz/question documents. Only users whose `/users/{uid}` profile role is `instructor` may create an owned draft. Owners manage quiz content, answer keys, lifecycle, and overrides. Students create their own participant and in-progress attempt records for published quizzes, then can only submit their own attempt. Submitted attempts cannot be changed. Result reads are owner-only unless the quiz setting exposes them immediately or after release. Unmatched document paths remain denied.

## V1 limitation

Grading currently happens in the browser. A participant who can read an answer key can inspect it and potentially reveal correct answers before answering. Separating keys from questions and limiting reads to quiz participants reduces casual exposure, but it is not a security boundary against a determined client. Move grading and answer-key access behind a trusted Cloud Function before relying on high-stakes assessments.

## Indexes

`firestore.indexes.json` defines the owner quiz list (`ownerId` with descending `updatedAt`), published catalog (`status` with descending `publishedAt`), and per-quiz attempts by `userId` and descending `startedAt`.

Review the added `quizzes` rule match and deploy it only after reviewing the access model and v1 client-grading limitation. No deploy is performed by this project workflow.
