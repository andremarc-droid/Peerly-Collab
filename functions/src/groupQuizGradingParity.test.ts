import { describe, expect, it } from 'vitest'
import { normalizeAnswer as clientNormalize } from '../../src/features/quizzes/grading/normalize'
import { gradeCanvasQuestion as clientGradeCanvas } from '../../src/features/quizzes/grading/grade'
import type { CanvasAnswerKey, CanvasQuestion } from '../../src/features/canvas/types'
import {
  gradeCanvasQuestion as serverGradeCanvas,
  normalizeAnswer as serverNormalize,
  type CanvasAnswerKeyInput,
  type CanvasQuestionInput,
} from './groupQuizGrading'

describe('normalizeAnswer parity between client and server', () => {
  const testCases: Array<{
    input: string
    caseSensitive: boolean
    options?: { ignoreDiacritics?: boolean; ignorePunctuation?: boolean }
  }> = [
    { input: '   Hello    World   ', caseSensitive: false },
    { input: '   Hello    World   ', caseSensitive: true },
    { input: 'Syntax\u200B error', caseSensitive: false },
    { input: 'Syntax\u00A0error', caseSensitive: false },
    { input: '\uFEFFSyntax error\u200D', caseSensitive: true },
    { input: 'Word\u2060Joiner\u00ADSoftHyphen', caseSensitive: false },
    { input: 'Café', caseSensitive: false },
    { input: 'Café', caseSensitive: true },
    { input: 'Crème brûlée!', caseSensitive: false, options: { ignoreDiacritics: true, ignorePunctuation: true } },
    { input: 'Hello, World!', caseSensitive: false, options: { ignorePunctuation: true } },
    { input: 'ＡＢＣ １２３', caseSensitive: false }, // Full-width characters folded by NFKC
    { input: '\u200B\u200C\u200D\u2060\uFEFF\u00AD', caseSensitive: false },
  ]

  for (const { input, caseSensitive, options } of testCases) {
    it(`normalizes "${input}" (case: ${caseSensitive}, opts: ${JSON.stringify(options)}) identically`, () => {
      const clientResult = clientNormalize(input, caseSensitive, options)
      const serverResult = serverNormalize(input, caseSensitive, options)
      expect(serverResult).toBe(clientResult)
    })
  }
})

describe('gradeCanvasQuestion parity between client and server', () => {
  const cards = [{ id: 'card1' }, { id: 'card2' }, { id: 'card3' }, { id: 'card4' }]
  const keyConnections = [
    { from: 'card1', to: 'card2', points: 2 },
    { from: 'card2', to: 'card3', points: 3 },
  ]

  const questionDirected: CanvasQuestionInput & CanvasQuestion = {
    id: 'board',
    type: 'canvas',
    prompt: 'Connect the cards',
    points: 10,
    directed: true,
    wrongPenalty: 'half',
    cards: cards as any,
    layoutMode: 'free',
  }

  const questionUndirected: CanvasQuestionInput & CanvasQuestion = {
    ...questionDirected,
    directed: false,
    wrongPenalty: 'full',
  }

  const keyDirected: CanvasAnswerKeyInput & CanvasAnswerKey = {
    type: 'canvas',
    explanation: 'Expected flow',
    connections: keyConnections as any,
  }

  const studentAnswers = [
    undefined,
    [],
    ['card1->card2', 'card2->card3'], // Perfect
    ['card1->card2'], // Partial
    ['card2->card1', 'card2->card3'], // Wrong direction on first
    ['card1->card2', 'card2->card3', 'card1->card3'], // Extra wrong edge with penalty
    ['card1->card1', 'card1->card2', 'card2->card3'], // Self-connection ignored
    ['card1->unknown', 'card1->card2', 'card2->card3'], // Unknown card ignored
    ['card1->card2', 'card1->card2', 'card2->card3'], // Duplicate edge ignored
    ['card3<->card2', 'card1<->card2'], // Undirected matching
    ['card2<->card3', 'card2<->card1', 'card3<->card4'], // Undirected with wrong edge
    new Array(100).fill('card1->card2'), // Exceeding cap
  ]

  for (const [idx, answer] of studentAnswers.entries()) {
    it(`grades answer variant #${idx} identically on directed board`, () => {
      const clientResult = clientGradeCanvas(questionDirected, keyDirected, answer)
      const serverResult = serverGradeCanvas(questionDirected, keyDirected, answer)
      expect(serverResult).toEqual(clientResult)
    })

    it(`grades answer variant #${idx} identically on undirected board`, () => {
      const clientResult = clientGradeCanvas(questionUndirected, keyDirected, answer)
      const serverResult = serverGradeCanvas(questionUndirected, keyDirected, answer)
      expect(serverResult).toEqual(clientResult)
    })
  }

  it('grades penalty variations (none, half, full) identically', () => {
    for (const penalty of ['none', 'half', 'full'] as const) {
      const q = { ...questionDirected, wrongPenalty: penalty }
      const ans = ['card1->card2', 'card1->card3']
      const clientResult = clientGradeCanvas(q, keyDirected, ans)
      const serverResult = serverGradeCanvas(q, keyDirected, ans)
      expect(serverResult).toEqual(clientResult)
    }
  })
})
