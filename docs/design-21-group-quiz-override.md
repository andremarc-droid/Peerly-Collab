# Design: Instructor Override for Stuck Group Quiz Team

## Requirement
Instructor override for a stuck team in group quizzes: add a callable and UI so the quiz owner can force-close the current question or advance a team, with rate limiting and tests in groupQuizPlay-related test files.

## Architecture

1. **Callable: `overrideTeamQuestion`**:
   - Implemented in `functions/src/groupQuizPlay.ts`.
   - Exported from `functions/src/groupQuizzes.ts` and registered in `functions/src/index.ts` with `wrapGroupQuizHandler`.
   - Dispatched in `api/groupQuizzes.ts` via dynamic handler lookup.
   - Input: `{ quizId: string, teamId: string }`, validated using `parseTeamRef`.
   - Rate limiting: enforced on instructor uid with `enforceRate(uid, 'manage', RATE.manage)`.
   - Security:
     - Must be signed in.
     - Reads quiz and verifies `quiz.ownerId === uid`. Only the quiz instructor can invoke the override.
   - Logic in transaction:
     - Loads `PlayContext` via `loadPlay(tx, request.quizId, request.teamId)`.
     - If `session.phase === 'answering'`:
       - Force-closes the question:
         `const picks = priv.picks[question.id] ?? {}`
         `const final = quiz.settings.answerMode === 'representative' ? (picks[team.representativeId] ?? null) : autoAnswer(picks, team.memberIds)`
         `closeQuestion(tx, ctx, { final, lockedBy: uid, auto: false }, now)`
         Returns `{ advanced: true, phase: 'review', currentIndex: session.currentIndex }`
     - If `session.phase === 'review'`:
       - Advances to next question:
         `const nextIndex = session.currentIndex + 1`
         If `nextIndex >= session.total` or next question missing:
           Marks session finished via `finishedSessionFields(session.total)`.
           Returns `{ advanced: true, phase: 'finished', currentIndex: nextIndex }`
         Else:
           Opens next question via `openSessionFields(next, session.total, quiz, now)`.
           Returns `{ advanced: true, phase: 'answering', currentIndex: nextIndex }`
     - If `session.phase === 'finished'`:
       - Returns `{ advanced: false, phase: 'finished', currentIndex: session.currentIndex }`

2. **Frontend Service & UI**:
   - `src/features/quizzes/services/teamService.ts`:
     `export const overrideTeamQuestion = (quizId: string, teamId: string) => call<{ quizId: string; teamId: string }, { advanced: boolean; phase: string }>('overrideTeamQuestion', { quizId, teamId })`
   - `src/features/quizzes/teams/TeamManagementPage.tsx`:
     In `TeamCard`:
     When `team.status === 'in_progress'`:
     Add button: `<Button type="button" variant="secondary" disabled={working} onClick={() => onForceAdvance()} aria-label={`Advance stuck team ${team.name}`}><FastForward size={16} aria-hidden="true" /> Advance team</Button>`
     Wire in `TeamManagementPage`:
     `onForceAdvance={() => run(`override-${team.id}`, () => overrideTeamQuestion(quiz.id, team.id), `${team.name} was advanced.`)}`

3. **Testing**:
   - Unit test for `overrideTeamQuestion` logic in `functions/src/groupQuizPlay.test.ts`.
   - Component test for `TeamManagementPage.test.tsx` verifying the Advance team button renders for in_progress teams and calls `overrideTeamQuestion`.
