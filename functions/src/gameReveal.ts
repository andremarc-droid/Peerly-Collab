import { scoreAnswer } from './gameLogic.js'

export interface PlayerAnswer { optionIndex: number; answeredAtMs: number }

/**
 * Pure reveal maths. Only people currently in the game score; a missing answer scores 0.
 * Game scores are fun-only inside one game and never feed XP, streaks, leaderboards or profile data.
 */
export function buildReveal(input: {
  correctIndex: number
  startedAtMs: number
  endsAtMs: number | null
  players: ReadonlyArray<{ uid: string; score: number }>
  answers: ReadonlyMap<string, PlayerAnswer>
  speedBonus?: boolean
}): { perPlayerPoints: Record<string, number>; scores: Record<string, number> } {
  const perPlayerPoints: Record<string, number> = {}
  const scores: Record<string, number> = {}
  for (const player of input.players) {
    const answer = input.answers.get(player.uid)
    const points = answer
      ? scoreAnswer({
          correct: answer.optionIndex === input.correctIndex,
          answeredAtMs: answer.answeredAtMs,
          startedAtMs: input.startedAtMs,
          endsAtMs: input.endsAtMs,
          speedBonus: input.speedBonus,
        })
      : 0
    perPlayerPoints[player.uid] = points
    scores[player.uid] = player.score + points
  }
  return { perPlayerPoints, scores }
}
