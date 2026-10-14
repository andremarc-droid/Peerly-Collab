# Design: Speed Bonus Host Setting in Live Games

## Requirement
"Reward practice rather than speed": live games currently add up to 500 speed-bonus points (`scoreAnswer` in `functions/src/gameLogic.ts`). Add a host setting to turn the speed bonus off (default off), update tests in `gameLogic.test.ts`, and show the setting in `HostGameButton`/`HostGroupGame`.

## Implementation Details

1. **Backend Scoring Logic (`functions/src/gameLogic.ts`)**:
   - `scoreAnswer(input: { correct: boolean; answeredAtMs: number; startedAtMs: number; endsAtMs: number; speedBonus?: boolean }): number`
   - When `correct === false`: returns 0.
   - When `speedBonus !== true`: returns `GAME_LIMITS.basePoints` (1000) for a correct answer within the window, regardless of elapsed time.
   - When `speedBonus === true`: adds `Math.round(GAME_LIMITS.maxSpeedBonus * (remaining / total))`.

2. **Game Requests & Settings (`functions/src/gameRequests.ts`, `functions/src/liveGames.ts`, `functions/src/gameData.ts`)**:
   - Add `speedBonus?: boolean` to `CreateGameRequest` and `parseCreateGameRequest`. Default to `false`.
   - Store `speedBonus: input.speedBonus ?? false` in `game.settings`.
   - In `functions/src/gameReveal.ts`, accept `speedBonus?: boolean` in `buildReveal` and forward it to `scoreAnswer`.
   - In `functions/src/gameData.ts`, extract `speedBonus` from `game.settings` and pass it to `buildReveal`.

3. **Frontend Types & UI (`src/features/games/types.ts`, `HostGameButton.tsx`, `HostGroupGame.tsx`)**:
   - Update `CreateGameInput` to accept `speedBonus?: boolean`.
   - In `HostGameButton.tsx`, add a checkbox or switch toggle for "Speed bonus points" (default unchecked/off) with hint "Award up to 500 bonus points for faster answers (reward practice by leaving off)".
   - In `HostGroupGame.tsx`, passes options into `HostGameButton`.

4. **Testing**:
   - Update `functions/src/gameLogic.test.ts` to test `scoreAnswer` with `speedBonus: false` (default) vs `speedBonus: true`.
   - Update `functions/src/gameRequests.test.ts` for parsing `speedBonus`.
   - Verify frontend tests and typecheck.
