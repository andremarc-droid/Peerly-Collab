import { describe, expect, it } from 'vitest'
import { answerQuestion, nextQuestion, quizSessionComplete, resolveSelfGrade, retryMissed, startQuizSession } from './quizSession'

describe('resolveSelfGrade', () => {
  it('records an unsure answer that the learner grades correct', () => {
    const initial = startQuizSession([{ id: 'a' }])
    const unsure = answerQuestion(initial, 'close', 'unsure')
    expect(resolveSelfGrade(unsure, 'correct')).toMatchObject({ verdict: 'correct', correct: 1, missed: [] })
  })

  it('records an unsure answer that the learner grades incorrect', () => {
    const unsure = answerQuestion(startQuizSession([{ id: 'a' }]), 'wrong', 'unsure')
    expect(resolveSelfGrade(unsure, 'incorrect')).toMatchObject({ verdict: 'incorrect', correct: 0, missed: [{ id: 'a' }] })
  })

  it('ignores a second self-grade', () => {
    const unsure = answerQuestion(startQuizSession([{ id: 'a' }]), 'close', 'unsure')
    const resolved = resolveSelfGrade(unsure, 'correct')
    expect(resolveSelfGrade(resolved, 'incorrect')).toBe(resolved)
  })
})

describe('quiz session transitions', () => {
  it('ignores a second answer for the same question', () => {
    const answered = answerQuestion(startQuizSession([{ id: 'a' }]), 'x', 'incorrect')
    expect(answerQuestion(answered, 'y', 'correct')).toBe(answered)
  })

  it('retries missed questions as a new round', () => {
    let session = startQuizSession([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    session = answerQuestion(session, 'x', 'incorrect')
    session = nextQuestion(session)
    session = answerQuestion(session, 'b', 'correct')
    session = nextQuestion(session)
    session = answerQuestion(session, 'z', 'incorrect')
    expect(quizSessionComplete(session)).toBe(true)
    const retry = retryMissed(session)
    expect(retry.questions.map(question => question.id)).toEqual(['a', 'c'])
    expect(retry.round).toBe(2)
  })
})
