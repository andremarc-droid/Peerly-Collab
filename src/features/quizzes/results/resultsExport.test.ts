import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import type { QuizAttempt, QuizResult } from '../types'
import { quizTypeLabel, resultsCsv, resultsFileName, type AttemptResult } from './resultLogic'

const time = Timestamp.fromMillis(10_000)
const base: QuizAttempt = { userId: 'u1', userName: 'Ana', attemptNumber: 1, status: 'submitted', answers: {}, questionOrder: [], optionOrder: {}, startedAt: time, submittedAt: Timestamp.fromMillis(70_000), timeSpentSeconds: 60 }
const result = (userId: string): QuizResult => ({ userId, score: 8, maxScore: 10, perQuestion: {}, gradedAt: time })
const row = (id: string, userId: string, userName: string, extra: Partial<QuizAttempt> = {}): AttemptResult => ({ ...base, ...extra, id, userId, userName, result: result(userId) })

describe('results export names the quiz', () => {
  it('adds Quiz and Quiz type columns right after Class on every row', () => {
    const csv = resultsCsv([row('a', 'u1', 'Ana'), row('b', 'u2', 'Ben')], false, 'Science', null, { title: 'Photosynthesis Check', type: 'Quiz' })
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('"Student","User ID","Class","Quiz","Quiz type","Attempt","Status","Score","Late","Time spent (seconds)","Submitted at"')
    expect(lines[1].startsWith('"Ana","u1","Science","Photosynthesis Check","Quiz","1"')).toBe(true)
    expect(lines[2].startsWith('"Ben","u2","Science","Photosynthesis Check","Quiz","1"')).toBe(true)
  })

  it('keeps the Team column right after Student when the quiz columns are present', () => {
    const csv = resultsCsv([row('a', 'u1', 'Ana', { teamId: 't1', teamName: 'Red Team' })], false, 'Science', null, { title: 'Teamwork', type: 'Quiz' })
    const lines = csv.split('\r\n')
    expect(lines[0].startsWith('"Student","Team","User ID","Class","Quiz","Quiz type","Attempt"')).toBe(true)
    expect(lines[1].startsWith('"Ana","Red Team","u1","Science","Teamwork","Quiz","1"')).toBe(true)
  })

  it('leaves the export unchanged when no quiz info is given', () => {
    const lines = resultsCsv([row('a', 'u1', 'Ana')], false, 'Science').split('\r\n')
    expect(lines[0]).toBe('"Student","User ID","Class","Attempt","Status","Score","Late","Time spent (seconds)","Submitted at"')
  })

  it('escapes quotes and protects a title that looks like a spreadsheet formula', () => {
    const quoted = resultsCsv([row('a', 'u1', 'Ana')], false, 'Science', null, { title: 'Chapter "3", part 1', type: 'Quiz' })
    expect(quoted).toContain('"Chapter ""3"", part 1"')
    const formula = resultsCsv([row('a', 'u1', 'Ana')], false, 'Science', null, { title: '=HYPERLINK("x")', type: 'Quiz' })
    expect(formula).toContain(`"'=HYPERLINK(""x"")"`)
  })

  it('labels quiz types and builds a safe download name from the title', () => {
    expect(quizTypeLabel('quiz')).toBe('Quiz')
    expect(quizTypeLabel('flashcards')).toBe('Flashcards')
    expect(resultsFileName('Midterm: Units 1/2')).toBe('Midterm- Units 1-2-results.csv')
    expect(resultsFileName('   ')).toBe('quiz-results.csv')
    expect(resultsFileName('')).toBe('quiz-results.csv')
  })
})
