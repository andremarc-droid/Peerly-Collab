import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { DomainValidationError, parseQuiz, parseQuizAttempt, parseQuizSettings } from './index'
import { defaultQuizSettings } from './settings'

const time = Timestamp.fromMillis(1000)
const settingsWith = (participation: unknown) => ({ ...defaultQuizSettings('quiz'), participation })
const quizWith = (participation: unknown, mode: 'quiz' | 'flashcards' | 'canvas' = 'quiz') => ({
  ownerId: 'teacher', ownerName: 'Teacher', title: 't', description: '', tags: [], mode,
  status: 'draft', questionCount: 0, createdAt: time, updatedAt: time, publishedAt: null,
  settings: { ...defaultQuizSettings(mode), participation },
})

describe('group participation settings', () => {
  it('still parses older group documents that only had groupSize, applying defaults', () => {
    expect(parseQuizSettings(settingsWith({ type: 'group', groupSize: 3 }), 'quiz').participation).toEqual({
      type: 'group', groupSize: 3, answerMode: 'representative', teamFormation: 'assigned', waitForEveryone: false, questionTimeSec: null,
    })
  })

  it('parses every new field', () => {
    const full = { type: 'group', groupSize: 4, answerMode: 'everyone', teamFormation: 'self', waitForEveryone: true, questionTimeSec: 60 }
    expect(parseQuizSettings(settingsWith(full), 'quiz').participation).toEqual(full)
    expect(parseQuiz(quizWith(full)).settings.participation).toEqual(full)
  })

  it('treats an explicit null timer as no timer and accepts the timer bounds', () => {
    const timer = (questionTimeSec: unknown) => (parseQuizSettings(settingsWith({ type: 'group', groupSize: 2, questionTimeSec }), 'quiz').participation as { questionTimeSec: number | null }).questionTimeSec
    expect(timer(null)).toBeNull()
    expect(timer(10)).toBe(10)
    expect(timer(300)).toBe(300)
  })

  it('rejects out-of-range and malformed values', () => {
    const bad: unknown[] = [
      { type: 'group', groupSize: 1 },
      { type: 'group', groupSize: 11 },
      { type: 'group', groupSize: 2.5 },
      { type: 'group' },
      { type: 'group', groupSize: 3, answerMode: 'solo' },
      { type: 'group', groupSize: 3, teamFormation: 'random' },
      { type: 'group', groupSize: 3, waitForEveryone: 'yes' },
      { type: 'group', groupSize: 3, questionTimeSec: 9 },
      { type: 'group', groupSize: 3, questionTimeSec: 301 },
      { type: 'group', groupSize: 3, questionTimeSec: 20.5 },
    ]
    for (const participation of bad) expect(() => parseQuizSettings(settingsWith(participation), 'quiz')).toThrow(DomainValidationError)
  })

  it('rejects unknown keys on group and individual participation', () => {
    expect(() => parseQuizSettings(settingsWith({ type: 'group', groupSize: 3, extra: true }), 'quiz')).toThrow('unsupported fields')
    expect(() => parseQuizSettings(settingsWith({ type: 'individual', groupSize: 3 }), 'quiz')).toThrow('unsupported fields')
    expect(() => parseQuizSettings(settingsWith({ type: 'individual', answerMode: 'everyone' }), 'quiz')).toThrow('unsupported fields')
  })

  it('keeps flashcards and canvas quizzes individual-only', () => {
    const group = { type: 'group', groupSize: 3 }
    expect(() => parseQuiz(quizWith(group, 'canvas'))).toThrow(DomainValidationError)
    expect(() => parseQuiz(quizWith(group, 'flashcards'))).toThrow(DomainValidationError)
    expect(() => parseQuizSettings({ ...defaultQuizSettings('flashcards'), participation: group }, 'flashcards')).toThrow('Only quizzes can be taken as a group')
  })

  it('leaves individual quizzes exactly as before', () => {
    expect(parseQuiz(quizWith({ type: 'individual' })).settings.participation).toEqual({ type: 'individual' })
  })
})

describe('team attempts', () => {
  const attempt = {
    userId: 'u1', userName: 'Ana', attemptNumber: 1, status: 'submitted', answers: { q1: 'a' }, questionOrder: ['q1'], optionOrder: { q1: ['a', 'b'] },
    startedAt: time, submittedAt: time, timeSpentSeconds: 12,
  }
  it('keeps solo attempts free of team fields', () => {
    const parsed = parseQuizAttempt(attempt)
    expect('teamId' in parsed).toBe(false)
    expect('teamName' in parsed).toBe(false)
  })
  it('carries teamId and teamName when present', () => {
    expect(parseQuizAttempt({ ...attempt, teamId: 't1', teamName: 'Red' })).toMatchObject({ teamId: 't1', teamName: 'Red' })
  })
  it('still rejects unknown fields', () => {
    expect(() => parseQuizAttempt({ ...attempt, teamScore: 99 })).toThrow('unsupported fields')
  })
})
