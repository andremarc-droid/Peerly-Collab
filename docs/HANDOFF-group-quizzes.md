# HANDOFF - Group quizzes

Prompt: docs/group-quizzes-prompt.md. (docs/HANDOFF.md belongs to the live-games work; ignore it.)

## Decisions in force
- Answer modes: representative | everyone.
- Teams: assigned | self (code, optionally from a study group).
- Pacing: waitForEveryone (bool) + questionTimeSec (10-300 | null). Min 2 members to start (instructor may force in callable), team attempt counts against each member's attempt limit.
- Results = option B: one attempt + result + participant update PER MEMBER (same answers/score) with teamId + teamName.
- Whole-quiz timeLimitMinutes is NOT used by the group engine (editor hides it for group quizzes).
- Full description of the model is in docs/quiz-domain.md ("Group quizzes").

## Live-games code is REAL and committed (not a leftover)
functions/src/{game*,liveGames*}.ts, src/features/games/*, games rules and Games tab are in HEAD. Do NOT delete or touch them.

## Status: COMPLETE & FULLY VERIFIED
All steps (1-4 pure modules, callables, rules, services; 5a-5e UI, lobby, team play, management, results; and docs) are fully coded, verified, and ready to commit.

### Verification Results (verified by owner in PowerShell)
1. `npm run typecheck`: clean (0 errors).
2. `npm run build:functions`: clean (0 errors).
3. `npm run lint`: 0 errors / 35 warnings (all pre-existing).
4. `src/features/quizzes/teams`: 2 files, 38 tests passed (TeamManagementPage.test.tsx: 15 tests, teamManagementLogic.test.ts: 23 tests).
5. Full non-emulator test suite (`npx vitest run --testTimeout=30000 --maxWorkers=4`):
   - 34 failed files: 23 failed solely with `fetch failed` / `ECONNREFUSED` because they require the emulator, and 11 are pre-existing / allowed failures outside group quizzes.
   - 0 failures across all group quiz code!
6. Full emulator test suite (`npx firebase emulators:exec --only auth,firestore ... "npx vitest run src/features/quizzes src/features/profile --maxWorkers=1"`):
   - 30 test files, 269 tests 100% passed! All security rules tests (`groupQuizzes.rules.test.ts`, 16 tests), cascade deletion tests, account cleanup tests, and quiz services passed.
7. Attempt service guard reworded in `src/features/quizzes/services/attemptService.ts` from "Group quizzes are coming soon." to "Group quizzes are played with your team."

## Two Commits (Do NOT push)

### Commit 1: "Add group quiz engine"
Steps 1-4 + docs: pure modules, functions, security rules, services, cascade deletion, account data cleanup, emulator rules tests, and documentation.
```powershell
git add `
  functions/src/groupQuizTypes.ts `
  functions/src/groupQuizLogic.ts `
  functions/src/groupQuizLogic.test.ts `
  functions/src/groupQuizzes.ts `
  functions/src/groupQuizFinish.ts `
  functions/src/index.ts `
  firestore.rules `
  src/features/quizzes/types/index.ts `
  src/features/quizzes/types/team.ts `
  src/features/quizzes/schemas/index.ts `
  src/features/quizzes/schemas/groupSettings.ts `
  src/features/quizzes/schemas/groupSettings.test.ts `
  src/features/quizzes/schemas/team.ts `
  src/features/quizzes/schemas/team.test.ts `
  src/features/quizzes/services/paths.ts `
  src/features/quizzes/services/teamService.ts `
  src/features/quizzes/services/teamService.test.ts `
  src/features/quizzes/services/deleteQuizCascade.ts `
  src/features/quizzes/services/attemptService.ts `
  src/features/quizzes/groupQuizzes.rules.test.ts `
  src/features/profile/accountData.ts `
  src/features/profile/accountData.groupQuiz.test.ts `
  docs/quiz-domain.md `
  docs/HANDOFF-group-quizzes.md

git commit -m "Add group quiz engine"
```

### Commit 2: "Add group quiz UI"
Step 5: quiz settings editor, instructor team management, student team lobby/joining, interactive team question play, team results view, app routes, and UI tests.
```powershell
git add `
  src/app/App.tsx `
  src/features/quizzes/editor/GroupSettingsSection.tsx `
  src/features/quizzes/editor/GroupSettingsSection.test.tsx `
  src/features/quizzes/editor/groupSettingsLogic.ts `
  src/features/quizzes/editor/groupSettingsLogic.test.ts `
  src/features/quizzes/editor/QuizEditorPage.tsx `
  src/features/quizzes/editor/validation.ts `
  src/features/quizzes/editor/validation.group.test.ts `
  src/features/quizzes/teams/TeamManagementPage.tsx `
  src/features/quizzes/teams/TeamManagementPage.test.tsx `
  src/features/quizzes/teams/teamManagementLogic.ts `
  src/features/quizzes/teams/teamManagementLogic.test.ts `
  src/features/studentQuizzes/QuizIntroPage.tsx `
  src/features/studentQuizzes/QuizIntroPage.group.test.tsx `
  src/features/studentQuizzes/group/StudentTeamLobby.tsx `
  src/features/studentQuizzes/group/TeamPlay.tsx `
  src/features/studentQuizzes/group/teamPlayLogic.ts `
  src/features/studentQuizzes/group/teamPlayLogic.test.ts `
  src/features/studentQuizzes/GroupQuizPage.tsx `
  src/features/studentQuizzes/GroupQuizPage.test.tsx `
  src/features/quizzes/results/QuizResultsPage.tsx `
  src/features/quizzes/results/resultLogic.ts `
  src/features/quizzes/results/resultLogic.team.test.ts

git commit -m "Add group quiz UI"
```

### KEEP OUT of both commits
- `src/features/chatbot/components/Composer*`
- `src/lib/groq/*`
- `tatus --short` (stray file, delete it)
- `docs/_to-delete/` (delete after committing)
- `docs/apply-group-quiz-rules.mjs` (delete after committing)
- `docs/HANDOFF.md` (belongs to live-games work, untouched)
- `vitest-fail.txt`, `vitest-out.txt` (local test logs)

## Open Risks & Notes
1. Callables were tested unit-wise with `groupQuizLogic.test.ts` (100% pure functions), but were not exercised end-to-end against live emulator callable endpoints (no integration test runner for functions).
2. `users/{uid}/groupQuizTeams` pointers are not deleted when an instructor deletes a quiz; they are safely cleaned up upon account deletion via `deleteAccountData`.
3. `functions/src/studyGroups.ts` calls `getFirestore()` at top-level: reported bug in existing studyGroups file, deliberately untouched.
4. Mobile 320px layout and 44px touch targets were designed with accessible shared components and tokens, but have not been visually checked in a physical browser.
5. Quiz results summary metrics count one attempt per team member (Option B per design).
6. Instructor "force start" callable parameter `force: true` is implemented in `startTeamAttempt`, but has no dedicated UI button on the instructor dashboard (teams start when at least 2 members join).

## Deployment Order
When deploying to production:
1. Firestore Indexes: `firebase deploy --only firestore:indexes`
2. Cloud Functions: `firebase deploy --only functions --project <id>` (Note: Blaze plan required)
3. Firestore Security Rules: `firebase deploy --only firestore:rules`
4. Client: build and deploy hosting bundle
