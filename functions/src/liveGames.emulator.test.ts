// @vitest-environment node
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { advanceQuestion, cleanupGames, createGame, deleteGame, endGame, joinGame, kickPlayer, startGame, submitAnswer, syncGame } from './liveGames'

// Written, NOT run here: needs the Firestore emulator (see AGENTS.md). Skipped when no emulator is configured.
const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const as = (uid: string, data: unknown) => ({ auth: { uid, token: { firebase: { sign_in_provider: 'google.com' } } }, data }) as never
const deckCards = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, front: `Front ${i}`, back: `Back ${i}` }))

describe.skipIf(!hasEmulator)('live games (emulator)', () => {
  let db: FirebaseFirestore.Firestore
  beforeAll(() => { initializeApp({ projectId: 'demo-peerly-collab' }); db = getFirestore() })
  beforeEach(async () => {
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-peerly-collab/databases/(default)/documents`, { method: 'DELETE' })
    await db.doc('classes/c1/flashcardDecks/d1').set({ ownerId: 'host', kind: 'personal', cards: deckCards, cardCount: 8 })
  })
  const make = async () => createGame(as('host', { source: { kind: 'deck', classId: 'c1', deckId: 'd1' }, timeLimitSec: 20 })) as Promise<{ gameId: string; code: string }>

  it('plays a full game and never exposes the answer key in public documents', async () => {
    const { gameId, code } = await make()
    await joinGame(as('p1', { code, displayName: 'Ana' }))
    await joinGame(as('p2', { code, displayName: 'Ben' }))
    await startGame(as('host', { gameId }))
    const current = (await db.doc(`games/${gameId}/state/current`).get()).data()!
    expect(JSON.stringify(current)).not.toContain('correct')
    const key = (await db.doc(`games/${gameId}/private/key`).get()).data()!.correct as number[]
    expect((await submitAnswer(as('p1', { gameId, questionIndex: 0, optionIndex: key[0]! })) as { accepted: boolean }).accepted).toBe(true)
    expect((await submitAnswer(as('p1', { gameId, questionIndex: 0, optionIndex: 0 })) as { accepted: boolean }).accepted).toBe(false)
    const second = await submitAnswer(as('p2', { gameId, questionIndex: 0, optionIndex: (key[0]! + 1) % current.options.length })) as { revealed: boolean }
    expect(second.revealed).toBe(true)
    const reveal = (await db.doc(`games/${gameId}/state/reveal`).get()).data()!
    expect(reveal.perPlayerPoints.p1).toBeGreaterThanOrEqual(1000)
    expect(reveal.perPlayerPoints.p2).toBe(0)
    await advanceQuestion(as('host', { gameId }))
    expect((await db.doc(`games/${gameId}/state/reveal`).get()).exists).toBe(false)
    expect((await db.doc(`games/${gameId}`).get()).get('questionIndex')).toBe(1)
  })

  it('enforces host-only actions, one hosted game, caps and late joins', async () => {
    const { gameId, code } = await make()
    await expect(make()).rejects.toMatchObject({ code: 'failed-precondition' })
    await joinGame(as('p1', { code, displayName: 'Ana' }))
    await expect(startGame(as('p1', { gameId }))).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(advanceQuestion(as('p1', { gameId }))).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(endGame(as('p1', { gameId }))).rejects.toMatchObject({ code: 'permission-denied' })
    await startGame(as('host', { gameId }))
    await expect(joinGame(as('late', { code, displayName: 'Late' }))).rejects.toMatchObject({ code: 'failed-precondition' })
    await expect(joinGame(as('p1', { code, displayName: 'Ana' }))).resolves.toBeDefined()
  })

  it('rejects answers after the server deadline and reveals on sync', async () => {
    const { gameId, code } = await make()
    await joinGame(as('p1', { code, displayName: 'Ana' }))
    await startGame(as('host', { gameId }))
    await db.doc(`games/${gameId}`).update({ questionEndsAt: new Date(Date.now() - 5000) })
    await expect(submitAnswer(as('p1', { gameId, questionIndex: 0, optionIndex: 0 }))).rejects.toMatchObject({ code: 'failed-precondition' })
    expect(((await syncGame(as('p1', { gameId }))) as { status: string }).status).toBe('reveal')
  })

  it('kicks players for good, rate limits joins and cleans up on account deletion', async () => {
    const { gameId, code } = await make()
    await joinGame(as('p1', { code, displayName: 'Ana' }))
    await kickPlayer(as('host', { gameId, playerUid: 'p1' }))
    expect((await db.doc(`games/${gameId}/players/p1`).get()).exists).toBe(false)
    await expect(joinGame(as('p1', { code, displayName: 'Ana' }))).rejects.toMatchObject({ code: 'permission-denied' })
    for (let i = 0; i < 20; i += 1) await joinGame(as('spam', { code: 'ZZZZZZ', displayName: 'S' })).catch(() => undefined)
    await expect(joinGame(as('spam', { code, displayName: 'S' }))).rejects.toMatchObject({ code: 'resource-exhausted' })
    await cleanupGames(as('host', {}))
    expect((await db.doc(`games/${gameId}`).get()).exists).toBe(false)
    expect((await db.doc(`gameCodes/${code}`).get()).exists).toBe(false)
    await expect(deleteGame(as('host', { gameId }))).resolves.toEqual({ success: true })
  })

  it('loads real-shaped quiz questions and maps option ids and choice answer keys', async () => {
    await db.doc('quizzes/realquiz').set({
      ownerId: 'host',
      classId: 'c1',
      mode: 'quiz',
      title: 'Real Quiz',
      status: 'published',
    })
    for (let i = 0; i < 6; i += 1) {
      const qId = `q${i}`
      const type = i % 2 === 0 ? 'multiple_choice' : 'true_false'
      const options = type === 'multiple_choice'
        ? [
            { id: `opt_${i}_a`, text: `Option A for Q${i}` },
            { id: `opt_${i}_b`, text: `Option B for Q${i}` },
            { id: `opt_${i}_c`, text: `Option C for Q${i}` },
          ]
        : [
            { id: `opt_${i}_true`, text: 'True' },
            { id: `opt_${i}_false`, text: 'False' },
          ]
      const correctOptionId = type === 'multiple_choice' ? `opt_${i}_b` : `opt_${i}_true`
      await db.doc(`quizzes/realquiz/questions/${qId}`).set({
        prompt: `Question prompt ${i}`,
        type,
        options,
        order: i,
        points: 10,
      })
      await db.doc(`quizzes/realquiz/answerKeys/${qId}`).set({
        type: 'choice',
        correctOptionId,
        explanation: 'Explanation',
        caseSensitive: false,
      })
    }
    // Also seed a question with non-choice key to ensure it is skipped
    await db.doc('quizzes/realquiz/questions/q_invalid').set({
      prompt: 'Invalid question',
      type: 'multiple_choice',
      options: [{ id: 'opt_x', text: 'X' }, { id: 'opt_y', text: 'Y' }],
      order: 99,
      points: 10,
    })
    await db.doc(`quizzes/realquiz/answerKeys/q_invalid`).set({
      type: 'identification',
      answer: 'X',
    })

    const { gameId } = await createGame(as('host', { source: { kind: 'quiz', classId: 'c1', quizId: 'realquiz' }, timeLimitSec: 20 })) as { gameId: string }
    const keyDoc = (await db.doc(`games/${gameId}/private/key`).get()).data()!
    const correctIndices = keyDoc.correct as number[]
    expect(correctIndices).toHaveLength(6)
    // For multiple choice (even index), correct option is opt_i_b which is index 1
    // For true_false (odd index), correct option is opt_i_true which is index 0
    expect(correctIndices).toEqual([1, 0, 1, 0, 1, 0])

    const questionsDoc = (await db.doc(`games/${gameId}/private/questions`).get()).data()!
    const loadedQuestions = questionsDoc.questions as Array<{ prompt: string; options: string[] }>
    expect(loadedQuestions).toHaveLength(6)
    expect(loadedQuestions[0].options).toEqual(['Option A for Q0', 'Option B for Q0', 'Option C for Q0'])
  })
})
