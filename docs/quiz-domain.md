# Quiz domain v1

## Collections

- `quizzes/{quizId}` stores instructor ownership, title, description, tags, mode, status, question count, timestamps, and settings.
- `quizzes/{quizId}/questions/{questionId}` stores the question prompt, type, order, points, and choice options. It deliberately contains no answers.
- `quizzes/{quizId}/answerKeys/{questionId}` stores accepted answers, explanation, and case-sensitivity independently from the participant-facing question.
- `quizzes/{quizId}/participants/{uid}` marks a student who started and tracks their attempt count and active attempt.
- `quizzes/{quizId}/attempts/{attemptId}` stores the student's submitted answers and question/option order. Submission closes an in-progress attempt.
- `quizzes/{quizId}/results/{attemptId}` stores points and per-question grading independently so score visibility can be enforced by Firestore rules.
- Group quizzes add the team collections described in "Group quizzes" below.

## Settings and grading

Quiz mode supports multiple choice, true/false, identification, fill-in-the-blank, flashcards, and canvas. Flashcards use neutral answer reveal and score defaults and receive no grade. Attempts have either a positive integer limit or `null` for unlimited; time limits similarly accept a positive integer or `null`. Participation is either `{ type: 'individual' }` or a group (see "Group quizzes"). Group quizzes apply to multiple choice, true/false, identification and fill-in-the-blank quizzes; flashcards and canvas quizzes stay individual.

Canvas mode supports interactive concept mapping where instructors place up to 50 cards (note, paragraph, Google Drive image, HTTPS link) and configure correct connections (up to 80) with optional point weights, layout mode ('scattered' or 'fixed'), directionality, and wrong penalty ('none', 'half', or 'full'). Canvas quizzes are restricted to individual participation (`participation: { type: 'individual' }`) with `shuffleQuestions: false` and `shuffleOptions: false`, and require exactly 1 question (`questionCount == 1`) to publish.

Grading is exposed through one `gradeAttempt` pure function. Choice questions compare option IDs; identification accepts normalized alternatives; each fill blank earns an equal fraction of the question points; flashcards are not graded. Canvas grading evaluates student connections up to `min(80, 2 * key.length)`, ignores unknown card IDs and self-connections, deducts penalties based on the chosen wrong penalty policy, and awards net points floored at 0. Typed answers trim and collapse whitespace and compare case-insensitively unless a key opts into case sensitivity. Solo quizzes are graded in the browser with this function; group quizzes are graded on the server with the same logic.

Attempt time integrity uses server-verified timestamps: `startedAt` must equal `request.time` upon creation, and `submittedAt` must equal `request.time` upon submission. Timed quizzes do not block late submissions in Firestore rules; instead, submissions after the time limit (plus 120s network grace) are accepted and flagged as late via pure helper `isLate`, preventing attempts from becoming trapped in `in_progress` and blocking subsequent attempts. Instructors see a "Late" badge, late duration ("Late by M min"), a "Late submissions" summary count, and a Late column in CSV exports, retaining discretion over grade overrides without automatic score deductions.

## Group quizzes

A group quiz is played by a team that answers together, step by step with the server.

### Settings

`settings.participation` for a group quiz is `{ type: 'group', groupSize, answerMode, teamFormation, waitForEveryone, questionTimeSec }`:

- `groupSize`: 2 to 10 members per team.
- `answerMode`: `representative` (one teammate submits the team's answer for each question; the others watch) or `everyone` (every member submits their own pick, then any one member locks in the final team answer, which may match a teammate or differ).
- `teamFormation`: `assigned` (the instructor builds teams from the class roster) or `self` (students form teams with a 6-character team code, optionally using one of their study groups as the team).
- `waitForEveryone`: the team does not move on until everyone has answered (everyone mode) or the representative has submitted (representative mode). After each question there is a review step and, with this setting on, the team waits until every member is ready before the next question.
- `questionTimeSec`: `null` (no timer) or 10 to 300 seconds per question. Combined with waiting, the team advances when everyone is done or the timer ends, whichever comes first.
- Old documents that only had `groupSize` still parse and receive defaults. The whole-quiz `timeLimitMinutes` is not used by the group engine; the editor hides it and sets it to `null` for group quizzes.

### Teams and play

- The representative is chosen once per team for the whole quiz; the instructor can change it (and members of a self-formed team can before the quiz starts).
- A team needs at least 2 members to start unless the instructor forces it. One team per student per quiz, one active attempt per team, at most 100 teams per quiz, team names 1 to 40 characters.
- In everyone mode, teammates see each other's picks only after everyone answered or the timer ended. If the timer ends before anyone locks, the most common pick becomes the team answer (ties go to the earliest member). In representative mode a missing answer at timer end is graded as wrong.
- Each team attempt counts against the attempt limit of every member.

### Data model

All of these documents are written only by Cloud Functions (firebase-admin) in `functions/src/groupQuiz*.ts`; clients only read.

- `quizzes/{quizId}/teams/{teamId}`: name, members and names, representative, code (self-formed teams), study group, status (`forming`, `ready`, `in_progress`, `submitted`), score.
- `quizzes/{quizId}/teamSessions/{teamId}`: server-written session state (phase, current index, server deadlines, the current question only, who answered, locked flag). Readable by team members and the quiz owner.
- `quizzes/{quizId}/teamSessions/{teamId}/reveals/{index}`: what a team may see after a question closes (final answer, picks, and the graded result when the quiz's answer-reveal setting allows it; for `after_submit` quizzes the graded result is added when the team submits).
- `quizzes/{quizId}/teamPrivate/{teamId}`, `teamCodes/{code}`, `teamMeta/summary`: server-only (never readable by clients).
- `users/{uid}/groupQuizTeams/{quizId}`: pointer to the student's team for a quiz (readable by that student).
- `groupQuizRateLimits/{uid}`: server-only rate limit counters.

When a team submits, the function writes one attempt, one result and one participant update for each member, with the same answers and score plus `teamId` and `teamName`. Existing results pages and the CSV export keep working; the instructor results page shows a team badge, and the CSV gets a Team column only when the quiz has team attempts.

### Security model

Waiting, timers and "only the representative may submit" are real only because a trusted server enforces them.

- Group play runs in callable Cloud Functions: creating and joining teams, setting the representative, starting, submitting and locking answers, advancing, submitting the attempt, plus the instructor's team management calls. Requests are strictly validated (extra fields rejected), rate limited per user, and use transactions where counts or status change.
- Firestore rules give students no access to the `questions` and `answerKeys` of a group quiz, and no direct solo participant or attempt writes in a group quiz. Teams read only their own team, their own session (the current question, never later ones, never an answer) and their own reveals.
- Scores are computed by the function; clients never write scores. All timing uses server timestamps. The browser shows a countdown from a server-corrected clock but only asks the server to advance; the server decides whether the deadline (plus a small grace for network delay) has passed.
- Display names are rendered as text, never as HTML.

### Limits and known limitations

- Teammates can share answers verbally or in another app; there is no anti-cheat beyond server-side enforcement of who may answer and when.
- A signed-in student with a team code can join that team if there is room; team codes are only as private as the people who share them.
- Rate limits: creating and adding team members share 30 changes per 10 minutes per instructor (auto-assign creates at most 25 teams per run); other management actions allow 60 per minute.
- `users/{uid}/groupQuizTeams` pointers are not removed when an instructor deletes a quiz; they are cleaned up when the account is deleted.
- Results summaries (submission counts, averages) count one attempt per team member, not one per team.
- Mobile layout (320px width, 44px targets) of the group screens has not been checked in a browser.

## Firestore access

The existing collab-notes rules remain in place for their collections. Quiz reads allow the owner or signed-in users for published quiz/question documents (group quizzes excepted, see above). Only users whose `/users/{uid}` profile role is `instructor` may create an owned draft. Owners manage quiz content, answer keys, lifecycle, and overrides. Students create their own participant and in-progress attempt records for published solo quizzes, then can only submit their own attempt with a server-stamped `submittedAt`. Submitted attempts cannot be changed. Result reads are owner-only unless the quiz setting exposes them immediately or after release. Unmatched document paths remain denied.

For canvas quizzes:
- The question board must use document id `board` at `quizzes/{quizId}/questions/board` and its answer key at `quizzes/{quizId}/answerKeys/board`.
- Firestore security rules cannot loop over lists. Consequently, rules enforce list-level caps (`cards.size() <= 50`, `connections.size() <= 80`, `answers.board.size() <= 80`, `answers.layout.size() <= 50`) and top-level fields. Individual card contents, Drive IDs, URL formats, and connection endpoints are validated client-side by domain schemas (`validateCanvasDefinition`, `validateCanvasKey`), and card URLs are checked against domain allowlists when rendered.

## V1 limitation (solo quizzes)

Grading of solo quizzes currently happens in the browser. A participant who can read an answer key can inspect it and potentially reveal correct answers before answering. In canvas mode, once an attempt has started and the student participant document exists, the canvas answer key (`answerKeys/board`) is readable by the student under Firestore rules. This is intended for practice and formative learning in v1. Separating keys from questions and limiting reads to quiz participants reduces casual exposure, but it is not a security boundary against a determined client. Move grading and answer-key access behind a trusted Cloud Function before relying on high-stakes assessments. Group quizzes already work this way: their answer keys are never readable by students.

## Indexes

`firestore.indexes.json` defines the owner quiz list (`ownerId` with descending `updatedAt`), published catalog (`status` with descending `publishedAt`), and per-quiz attempts by `userId` and descending `startedAt`.

Review the added `quizzes` rule match and deploy it only after reviewing the access model and the solo-quiz client-grading limitation. No deploy is performed by this project workflow. Group quizzes need Cloud Functions, which need the Blaze plan. Deploy in this order: indexes, functions (`firebase deploy --only functions --project <id>`), rules, then the client.
