import type { RevealResult, SessionPhase, Team, TeamAnswer, TeamQuestion, TeamReveal, TeamSession, TeamStatus } from '../types/team'

/** Runtime checks for team documents. Display names, prompts and answers are untrusted text: they are returned as data, never as markup. */

export class TeamDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TeamDataError'
  }
}

const STATUSES: readonly TeamStatus[] = ['forming', 'ready', 'in_progress', 'submitted']
const PHASES: readonly SessionPhase[] = ['answering', 'review', 'finished']

const fail = (what: string): never => { throw new TeamDataError(`The team data is damaged (${what}).`) }
const record = (value: unknown, what: string): Record<string, unknown> => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : fail(what))
const text = (value: unknown, what: string): string => (typeof value === 'string' ? value : fail(what))
const int = (value: unknown, what: string): number => (typeof value === 'number' && Number.isInteger(value) ? value : fail(what))
const nullableNumber = (value: unknown, what: string): number | null => (value === null || value === undefined ? null : typeof value === 'number' ? value : fail(what))
const stringList = (value: unknown, what: string): string[] => (Array.isArray(value) && value.every(item => typeof item === 'string') ? (value as string[]) : fail(what))

function answer(value: unknown, what: string): TeamAnswer {
  if (typeof value === 'string') return value
  return stringList(value, what)
}

function flags(value: unknown, what: string): Record<string, true> {
  const source = record(value ?? {}, what)
  return Object.fromEntries(Object.entries(source).filter(([, flag]) => flag === true).map(([key]) => [key, true as const]))
}

function picks(value: unknown, what: string): Record<string, TeamAnswer> {
  const source = record(value ?? {}, what)
  return Object.fromEntries(Object.entries(source).map(([uid, item]) => [uid, answer(item, what)]))
}

function options(value: unknown, what: string): Array<{ id: string; text: string }> {
  if (!Array.isArray(value)) return fail(what)
  return value.map(item => {
    const option = record(item, what)
    return { id: text(option.id, what), text: text(option.text, what) }
  })
}

export function parseTeam(data: unknown, id: string): Team {
  const d = record(data, 'team')
  const status = d.status
  if (!STATUSES.includes(status as TeamStatus)) fail('team status')
  const names = record(d.memberNames ?? {}, 'member names')
  return {
    id,
    name: text(d.name, 'team name'),
    memberIds: stringList(d.memberIds, 'members'),
    memberNames: Object.fromEntries(Object.entries(names).map(([uid, name]) => [uid, typeof name === 'string' ? name : 'Student'])),
    representativeId: text(d.representativeId, 'representative'),
    code: typeof d.code === 'string' ? d.code : null,
    studyGroupId: typeof d.studyGroupId === 'string' ? d.studyGroupId : null,
    status: status as TeamStatus,
    score: nullableNumber(d.score, 'score'),
    maxScore: nullableNumber(d.maxScore, 'max score'),
  }
}

function question(value: unknown): TeamQuestion {
  const q = record(value, 'question')
  return { id: text(q.id, 'question id'), index: int(q.index, 'question index'), type: text(q.type, 'question type'), prompt: text(q.prompt, 'prompt'), points: int(q.points, 'points'), options: options(q.options ?? [], 'options') }
}

export function parseSession(data: unknown): TeamSession {
  const d = record(data, 'session')
  if (!PHASES.includes(d.phase as SessionPhase)) fail('session phase')
  return {
    phase: d.phase as SessionPhase,
    currentIndex: int(d.currentIndex, 'current question'),
    total: int(d.total, 'question count'),
    questionStartedAt: nullableNumber(d.questionStartedAt, 'start time'),
    questionEndsAt: nullableNumber(d.questionEndsAt, 'end time'),
    reviewStartedAt: nullableNumber(d.reviewStartedAt, 'review time'),
    question: d.question === null || d.question === undefined ? null : question(d.question),
    answered: flags(d.answered, 'answered'),
    picks: d.picks === null || d.picks === undefined ? null : picks(d.picks, 'picks'),
    locked: d.locked === true,
    ready: flags(d.ready, 'ready'),
  }
}

function result(value: unknown): RevealResult | null {
  if (value === null || value === undefined) return null
  const r = record(value, 'result')
  if (typeof r.correct !== 'boolean') fail('result')
  return { correct: r.correct as boolean, pointsAwarded: typeof r.pointsAwarded === 'number' ? r.pointsAwarded : 0, correctAnswer: answer(r.correctAnswer, 'correct answer'), explanation: typeof r.explanation === 'string' ? r.explanation : '' }
}

export function parseReveal(data: unknown): TeamReveal {
  const d = record(data, 'reveal')
  const q = record(d.question, 'reveal question')
  return {
    index: int(d.index, 'reveal index'),
    questionId: text(d.questionId, 'question id'),
    question: { type: text(q.type, 'question type'), prompt: text(q.prompt, 'prompt'), points: int(q.points, 'points'), options: options(q.options ?? [], 'options') },
    finalAnswer: d.finalAnswer === null || d.finalAnswer === undefined ? null : answer(d.finalAnswer, 'final answer'),
    picks: picks(d.picks, 'picks'),
    lockedBy: typeof d.lockedBy === 'string' ? d.lockedBy : null,
    auto: d.auto === true,
    result: result(d.result),
  }
}
