import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import type { QuizAttempt, QuizResult } from '../types'
import { resultsCsv, type AttemptResult } from './resultLogic'

const time = Timestamp.fromMillis(10_000)
const base: QuizAttempt = { userId: 'u1', userName: 'Ana', attemptNumber: 1, status: 'submitted', answers: {}, questionOrder: [], optionOrder: {}, startedAt: time, submittedAt: Timestamp.fromMillis(70_000), timeSpentSeconds: 60 }
const result = (userId: string): QuizResult => ({ userId, score: 8, maxScore: 10, perQuestion: {}, gradedAt: time })
const row = (id: string, userId: string, userName: string, extra: Partial<QuizAttempt> = {}): AttemptResult => ({ ...base, ...extra, id, userId, userName, result: result(userId) })

describe('results CSV for team attempts', () => {
  it('keeps the solo export unchanged: no Team column', () => {
    const lines = resultsCsv([row('a', 'u1', 'Ana')]).split('\r\n')
    expect(lines[0]).not.toContain('Team')
    expect(lines[0].split(',')).toHaveLength(9)
    expect(lines[1].split(',')).toHaveLength(9)
  })

  it('adds a Team column after Student when any attempt belongs to a team', () => {
    const csv = resultsCsv([
      row('a', 'u1', 'Ana', { teamId: 't1', teamName: 'Red Team' }),
      row('b', 'u2', 'Ben', { teamId: 't1', teamName: 'Red Team' }),
      row('c', 'u3', 'Cy'),
    ])
    const lines = csv.split('\r\n')
    expect(lines).toHaveLength(4)
    expect(lines[0].startsWith('"Student","Team","User ID"')).toBe(true)
    expect(lines[1].startsWith('"Ana","Red Team","u1"')).toBe(true)
    expect(lines[2].startsWith('"Ben","Red Team","u2"')).toBe(true)
    // A solo attempt in the same export gets an empty team cell.
    expect(lines[3].startsWith('"Cy","","u3"')).toBe(true)
    for (const line of lines) expect(line.split('","').length).toBeGreaterThanOrEqual(10)
  })

  it('protects team names that look like spreadsheet formulas and escapes quotes', () => {
    const csv = resultsCsv([row('a', 'u1', 'Ana', { teamId: 't1', teamName: '=HYPERLINK("x")' })])
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
  })
})
