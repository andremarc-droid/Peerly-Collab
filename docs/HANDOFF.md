# HANDOFF - Phase 6B live quiz games

Last updated: 2026-10-10. Read this first, then AGENTS.md, docs/learning-domain.md, docs/learning-rework-prompt.md.
I (Claude in a file-system-only chat) can edit files but CANNOT run git/npm. Nothing below has been run unless it says "verified".

## Step 0 caveat
Phase 6A commits ("Add study groups data and rules" / "Add study groups UI") were NOT in .git/logs/HEAD. User told me to proceed anyway.
USER MUST CHECK: `git log --oneline -8` and `git status --short`, and commit 6A files separately from 6B files.

## Data model decisions (deviations from the prompt, all deliberate)
- `games/{id}/private/answers/{uid_index}` is not a valid Firestore path (doc/collection alternation). Answers are stored in `games/{id}/answers/{uid_index}`; rules deny all clients.
- Extra server-only docs (no client access): `gameCodes/{code}` (code -> gameId, has expiresAt), `gameHosts/{uid}` (one active hosted game), `gameRateLimits/{uid}`, `games/{id}/private/{questions,key,kicked}`.
- Client-readable by owner only: `gamePlayerSessions/{uid}` ({gameId}, used to resume after refresh).
- `players/{uid}.answeredIndex` = index of the last question answered (NOT the option chosen), so other players cannot learn answers.
- Extra callable `syncGame(gameId)`: any participant can trigger the reveal once the server deadline + 750ms grace has passed or everyone answered (so a missing host does not freeze a game).
- Game doc also has `questionStartedAt` and `playerCount` (set in transactions).

## DONE (written, NOT run)
Step 1 pure modules + tests:
- functions/src/gameLogic.ts (+ gameLogic.test.ts), gameRequests.ts, gameReveal.ts, gameRequests.test.ts
- src/features/games/types.ts, schemas.ts, schemas.test.ts
Step 2 functions:
- functions/src/gameData.ts (lazy firestore getter, refs, reveal helpers), functions/src/liveGames.ts (10 callables), index.ts exports
- functions/src/liveGames.emulator.test.ts (emulator, NOT run, skips without FIRESTORE_EMULATOR_HOST)

## NEXT
Step 3 rules (+ rules test, NOT run), Step 4 services + accountData cleanupGames + test, Step 5 UI, Step 6 docs.

## Commands the user still needs to run
npm run build:functions
npx vitest run functions/src/gameLogic.test.ts functions/src/gameRequests.test.ts src/features/games --testTimeout=30000

## Open risks
- 6A bug (not mine, not fixed): functions/src/studyGroups.ts calls getFirestore() at module load, before initializeApp() in index.ts. Compiled CJS requires it first, so the function bundle may fail to load. liveGames uses a lazy getter. Suggest verifying in the Functions emulator.
- Not typechecked yet: user must run build:functions and fix any compile errors I could not see.
