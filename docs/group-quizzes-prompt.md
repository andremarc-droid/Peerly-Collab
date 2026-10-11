# Group quizzes: build prompt

You are continuing the project at C:\Users\andre\Cool-Lab (React + Firebase study app "peerly-collab").
Goal: make the landing page promises "Solo or group", "Wait for everyone" and "Group of 3 answering together" TRUE for quizzes.
Do NOT deploy, do NOT push, do NOT add dependencies. Do not touch the solo quiz flow except where a step below says so.

## What exists today (verified by reading code, do not re-derive)
- `src/features/quizzes/types/index.ts`: `Participation = { type: 'individual' } | { type: 'group'; groupSize }` exists as scaffolding only.
- `src/features/quizzes/schemas/index.ts` (`parseQuizSettings`): accepts group with size 2-10; rejects group for canvas quizzes; `exactKeys` is strict, so any new setting must be added there.
- `src/features/quizzes/editor/QuizEditorPage.tsx`: "Group of 2 or more" is a DISABLED radio labelled "Coming soon"; the group size input is disabled.
- `src/features/quizzes/services/attemptService.ts`: `startAttempt` throws "Group quizzes are coming soon." for non-individual quizzes. `QuizAttempt` has a single `userId`; grading runs in the browser (`gradeAttempt`).
- docs/quiz-domain.md documents the quiz model and its v1 limitation: students can read answer keys (client grading).
- Phase 6A study groups exist (functions/src/studyGroups.ts, src/features/groups/*, groups/{id}/members/{uid}).
- NOT part of this task: the earlier "Phase 6B live games" work. It was discarded and replaced by another AI's version. `docs/HANDOFF.md` belongs to that discarded work. Do not reuse or delete it; use `docs/HANDOFF-group-quizzes.md` for this task.

## Product decisions (from the owner, final)
1. ANSWER MODE (instructor chooses per quiz):
   - `representative`: one teammate (the representative) submits the team's answer for each question. Others can watch.
   - `everyone`: after each question every member submits their own answer; then ANY one member locks in the team's final answer (it may match a teammate or differ). The locked answer is the one graded.
2. TEAM FORMATION (instructor chooses; both must be supported):
   - `assigned`: the instructor builds teams from the class roster.
   - `self`: students form teams with a team code, optionally by picking one of their Phase 6A study groups as the team.
3. PACING (independent of answer mode):
   - `waitForEveryone: boolean`: the team does not advance until all members have answered (everyone mode) or the representative has submitted (representative mode).
   - `questionTimeSec: number | null` (10-300): per-question timer. With a timer, the question closes when time runs out even if someone did not answer. With no timer and no waiting = free pace.
   - Combining wait + timer is allowed: advance when everyone finished OR the timer ends.
Defaults I chose (confirm with the owner only if they cause a problem):
- Representative is picked once per team for the whole quiz; the instructor can change it.
- Group mode applies to multiple choice, true/false, identification and fill-in-the-blank. Flashcards and canvas quizzes stay individual.
- One shared score/result per team attempt. Team size 2-10.
- In `everyone` mode teammates see each other's picks only after all members answered or the timer ended (not before).

## HOW TO WORK
- If you can run commands (git, npm, vitest), run them. If you can only read/edit files, edit files and give me the exact PowerShell commands, then wait for pasted output. Never claim something passes unless you saw the output.
- TOKEN SAFETY: create `docs/HANDOFF-group-quizzes.md` first and update it after every finished step: done and verified, in progress, exact next steps, open risks, commands I still need to run. If a chat starts without context, first read `docs/HANDOFF-group-quizzes.md`, this file, AGENTS.md and docs/quiz-domain.md. Read only the files you need.
- Order: (0) audit, (1) pure modules + tests, (2) functions, (3) rules + rules tests, (4) services, (5) UI, (6) docs + landing page. Update the handoff after each.
- Known pre-existing failing tests (do not fix; compare by name): 14 tests in 6 files: chatbot/images.test.ts, ClassCanvasTab.test.tsx, mobile.test.tsx, ModuleWorkspacePage.test.tsx, ResourceEditorDialog.test.tsx, LearningCanvasToolbar.test.tsx. Emulator rules/function tests cannot run here: write them and list them as "written, NOT run".
- Commands: `npm run typecheck`, `npm run lint`, `npm run build:functions`, `npx vitest run <files> --testTimeout=30000`.
- RULES LESSON: in firestore.rules, exists()/get() see the state BEFORE a batch; use existsAfter()/getAfter() when a rule depends on a document written in the same batch. Keep document-access calls low (20 per batch, 10 per single request).
- FUNCTIONS LESSON: in functions/src, never call `getFirestore()` at module top level (index.ts calls `initializeApp()` AFTER its imports, so it throws at load). Use a lazy getter. Note: functions/src/studyGroups.ts has exactly this bug; do NOT fix it here, just report it.
- Use `.js` extensions in functions/src imports (NodeNext). Test files are excluded from the functions build.

## STEP 0: audit (read-only, report before editing)
- Run `git log --oneline -8` and `git status --short`. Report any leftovers of the discarded live-games work (functions/src/game*.ts, liveGames.ts, src/features/games/*, games rules in firestore.rules, a "Games" tab in LearningHubPage.tsx). Do not delete anything; list them and ask me.
- Read: student quiz-taking pages and services (find them under src/features/quizzes and src/features/classes), results pages (`QuizResultsPage`, `resultLogic`, CSV export), the quizzes part of firestore.rules, firestore.indexes.json, `deleteQuizCascade.ts`, and `src/features/profile/accountData.ts`.
- Report: what can be reused, which rules currently let students read `answerKeys`, how results/CSV assume one `userId` per attempt, and your concrete data-model proposal. Wait for my OK before Step 1.

## SECURITY MODEL (non-negotiable)
Waiting, timers and "only the representative may submit" are only real if a trusted server enforces them. Group quiz play therefore runs in callable Cloud Functions (firebase-admin). Clients only read; clients never write team sessions, team answers or results.
- Answer keys of a GROUP quiz must NOT be readable by students at all (tighten the answerKeys rule using get() on the quiz's participation type). Solo quizzes keep today's behaviour.
- Questions shown to a team are served progressively: a team may read only the current question, never later ones, and never any answer.
- Grading happens in the function; clients never write scores.
- Server timestamps only, never client time. A timer is enforced against the SERVER deadline (plus a small grace for network).
- Display names are data, never HTML.

## DATA MODEL (adjust in Step 0 if the audit finds a better fit, but keep these properties)
- `quizzes/{quizId}.settings.participation` for group: `{ type: 'group', groupSize: 2-10, answerMode: 'representative'|'everyone', teamFormation: 'assigned'|'self', waitForEveryone: boolean, questionTimeSec: number|null }`. Old documents with only `groupSize` must still parse (apply defaults). Update `parseQuizSettings` strictly; reject unknown keys and out-of-range values; keep canvas/flashcards individual-only.
- `quizzes/{quizId}/teams/{teamId}`: name, memberIds (<= groupSize), representativeId, code (6 chars, unambiguous alphabet) for self-formed teams, studyGroupId|null, status ('forming'|'ready'|'in_progress'|'submitted'), createdBy. Written only by functions.
- `quizzes/{quizId}/teamSessions/{teamId}` (server-written, readable by team members and the quiz owner): phase, currentIndex, questionStartedAt, questionEndsAt, the current question only, which members answered (not what they chose until reveal), locked flag.
- Private per-member picks and the final answer: server-only until reveal (a reveal document readable by the team).
- Final result: one team attempt/result written by the function. Extend `QuizAttempt` minimally (optional `teamId`, `memberIds`) and make results pages and CSV show team name + members. Solo attempts must behave exactly as before.

## CALLABLES (functions/src/groupQuizzes.ts, exported from index.ts)
createTeam / assignTeams (instructor, `assigned`), createSelfTeam(code flow), joinTeam(code), leaveTeam, setRepresentative (instructor, or the team in `self` mode before start), startTeamAttempt (waits until the team is full enough per instructor setting; documents the minimum), submitTeamAnswer (representative mode: representative only; everyone mode: any member for their own pick), lockTeamAnswer (everyone mode: any member), advanceTeam (server decides when advancing is legal: wait rules, timer rules; one transition per question), submitTeamAttempt, deleteTeam, cleanupGroupQuizData (called from account deletion). All use transactions where counts or status change, strict request validation (extra fields rejected), per-user rate limits, caps, and map pure-logic errors to HttpsError.

## LIMITS
Team size 2-10; max teams per quiz 100; team name 1-40 chars; per-question timer 10-300 s; one active team attempt per team; one team per student per quiz.

## STEP 1: pure modules (no Firebase imports) with unit tests
Settings schema extension; team-state transitions (forming -> ready -> in_progress -> submitted); pacing rules (when may the team advance: free / wait / timer / wait+timer); representative authorization; everyone-mode lock rules; grading of a team answer reusing `gradeAttempt`; team code generation; team name validation. Tests: every transition, legal and illegal; wait + timer combinations; late/duplicate answers; non-representative submit rejected; caps; malformed input; old settings documents still parse.

## STEP 2: functions
Implement the callables with transactions. `npm run build:functions`. Emulator function tests: written, NOT run.

## STEP 3: rules + indexes + rules tests
Rules for the new collections (read-only for members/owner, no client writes), tightened answerKeys for group quizzes. Add indexes only if a query needs one. Rules tests (written, NOT run): signed-out denied; non-member cannot read a team or session; member cannot read later questions or answer keys; student cannot write teams/sessions/results; removed member loses access; solo quizzes unchanged.

## STEP 4: services
`src/features/quizzes/services/teamService.ts`: callable wrappers + realtime listeners returning unsubscribe functions. Extend account deletion to call the cleanup callable; if it fails show a retryable error and do NOT delete the Auth account (same pattern as group cleanup). Add a test. Also make `deleteQuizCascade` remove teams/sessions.

## STEP 5: UI (shared UI components, theme tokens, no inline styles, no new deps)
- Instructor: replace the disabled "Coming soon" block in QuizEditorPage with real settings (answer mode, team formation, wait for everyone, per-question timer, group size) with validation and hints; team management screen (assign teams, change representative, see forming/ready status); results show team name and members.
- Student: join/create team (code or study group), team lobby (members, representative, ready), question screen (representative badge; in everyone mode each member's pick state, then lock-in; wait/timer indicator), reveal, submitted/results. Handle refresh/rejoin, network loss, a teammate leaving, timer expiry, and the quiz being unpublished.
- Mobile first, 44px+ touch targets, keyboard accessible, right/wrong shown with text and icon not colour alone, no overflow at 320px (state "NOT verified" unless you checked), prefers-reduced-motion respected.
- Remove the "Group quizzes are coming soon." guard in `startAttempt` only for the new group path; solo path unchanged.
- Component tests with mocked services for every flow above, plus error and empty states.

## STEP 6: docs + landing page
Update docs/quiz-domain.md (group model, security model, pacing rules, limits, known limitations such as teammates can share answers verbally and no anti-cheat beyond server-side enforcement). Then make the landing page copy match what shipped (src/features/landing/LandingPage.tsx and its test): keep "Solo or group" and "Wait for everyone" only if they are now true; fix any line that still overpromises.

## FINISH
- Verify: `npm run typecheck`, `npm run build:functions`, `npm run lint`, then the non-emulator vitest run with a 30s timeout. Only the 14 known failures allowed; prove by name.
- Commit exactly two commits, in this order: "Add group quiz engine" (steps 1-4 + docs) and "Add group quiz UI" (step 5 + landing copy). Do not push.
- Final report: what shipped, what was deferred, new dependencies (expect none), tests written but NOT run, the emulator command from AGENTS.md, and deploy steps in this ORDER: indexes, functions (`firebase deploy --only functions --project <id>`), rules, client; plus a note that the Blaze plan is needed for functions. Then stop.
