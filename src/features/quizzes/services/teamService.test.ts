import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'

const h = vi.hoisted(() => ({
  callable: vi.fn(),
  names: [] as string[],
  listeners: [] as Array<{ path: string; next: (snap: unknown) => void; error: (cause: Error) => void }>,
}))

vi.mock('firebase/functions', () => ({
  httpsCallable: (_functions: unknown, name: string) => (data: unknown) => { h.names.push(name); return h.callable(name, data) },
}))
vi.mock('../../../lib/firebase/functions', () => ({ functions: {} }))
vi.mock('../../../lib/firebase/firestore', () => ({ firestore: {} }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  onSnapshot: (ref: { path: string }, next: (snap: unknown) => void, error: (cause: Error) => void) => {
    h.listeners.push({ path: ref.path, next, error })
    return () => undefined
  },
}))

import {
  addTeamMember, advanceTeam, cleanupGroupQuizData, createSelfTeam, createTeam, deleteTeam, describeTeamError, joinTeam, leaveTeam, lockTeamAnswer, overrideTeamQuestion, removeTeamMember,
  setRepresentative, startTeamAttempt, submitTeamAnswer, submitTeamAttempt, watchMyTeamId, watchQuizTeams, watchReveals, watchTeam, watchTeamSession,
} from './teamService'

const db = {} as Firestore
const teamData = { name: 'Owls', memberIds: ['a', 'b'], memberNames: { a: 'Ada', b: 'Bo' }, representativeId: 'a', status: 'forming' }
const lastListener = () => h.listeners[h.listeners.length - 1]
const snapshot = (data: unknown, id = 'doc1') => ({ exists: () => data !== undefined, data: () => data, id })

beforeEach(() => {
  h.callable.mockReset().mockResolvedValue({ data: { ok: true } })
  h.names.length = 0
  h.listeners.length = 0
})

describe('callable wrappers', () => {
  it('send exactly the documented payload and return the function result', async () => {
    h.callable.mockResolvedValueOnce({ data: { teamId: 't1' } })
    await expect(createTeam('q', 'Owls', ['a', 'b'], 'a')).resolves.toEqual({ teamId: 't1' })
    expect(h.callable).toHaveBeenLastCalledWith('createTeam', { quizId: 'q', name: 'Owls', memberIds: ['a', 'b'], representativeId: 'a' })

    await addTeamMember('q', 't', 'm')
    expect(h.callable).toHaveBeenLastCalledWith('addTeamMember', { quizId: 'q', teamId: 't', memberId: 'm' })
    await removeTeamMember('q', 't', 'm')
    expect(h.callable).toHaveBeenLastCalledWith('removeTeamMember', { quizId: 'q', teamId: 't', memberId: 'm' })
    await setRepresentative('q', 't', 'm')
    expect(h.callable).toHaveBeenLastCalledWith('setRepresentative', { quizId: 'q', teamId: 't', memberId: 'm' })
    await deleteTeam('q', 't')
    expect(h.callable).toHaveBeenLastCalledWith('deleteTeam', { quizId: 'q', teamId: 't' })
    await joinTeam('q', 'ABC234')
    expect(h.callable).toHaveBeenLastCalledWith('joinTeam', { quizId: 'q', code: 'ABC234' })
    await leaveTeam('q', 't')
    expect(h.callable).toHaveBeenLastCalledWith('leaveTeam', { quizId: 'q', teamId: 't' })
  })

  it('createSelfTeam only sends studyGroupId when one is chosen', async () => {
    await createSelfTeam('q', 'Owls')
    expect(h.callable).toHaveBeenLastCalledWith('createSelfTeam', { quizId: 'q', name: 'Owls' })
    await createSelfTeam('q', 'Owls', null)
    expect(h.callable).toHaveBeenLastCalledWith('createSelfTeam', { quizId: 'q', name: 'Owls' })
    await createSelfTeam('q', 'Owls', 'g1')
    expect(h.callable).toHaveBeenLastCalledWith('createSelfTeam', { quizId: 'q', name: 'Owls', studyGroupId: 'g1' })
  })

  it('startTeamAttempt only sends force when it is requested', async () => {
    await startTeamAttempt('q', 't')
    expect(h.callable).toHaveBeenLastCalledWith('startTeamAttempt', { quizId: 'q', teamId: 't' })
    await startTeamAttempt('q', 't', true)
    expect(h.callable).toHaveBeenLastCalledWith('startTeamAttempt', { quizId: 'q', teamId: 't', force: true })
  })

  it('play calls carry the question index and answer unchanged', async () => {
    await submitTeamAnswer('q', 't', 2, 'optB')
    expect(h.callable).toHaveBeenLastCalledWith('submitTeamAnswer', { quizId: 'q', teamId: 't', questionIndex: 2, answer: 'optB' })
    await lockTeamAnswer('q', 't', 2, ['x', 'y'])
    expect(h.callable).toHaveBeenLastCalledWith('lockTeamAnswer', { quizId: 'q', teamId: 't', questionIndex: 2, answer: ['x', 'y'] })
    await advanceTeam('q', 't', 2)
    expect(h.callable).toHaveBeenLastCalledWith('advanceTeam', { quizId: 'q', teamId: 't', questionIndex: 2 })
    await overrideTeamQuestion('q', 't', 2, 'answering')
    expect(h.callable).toHaveBeenLastCalledWith('overrideTeamQuestion', { quizId: 'q', teamId: 't', questionIndex: 2, expectedPhase: 'answering' })
    await submitTeamAttempt('q', 't')
    expect(h.callable).toHaveBeenLastCalledWith('submitTeamAttempt', { quizId: 'q', teamId: 't' })
    await cleanupGroupQuizData()
    expect(h.callable).toHaveBeenLastCalledWith('cleanupGroupQuizData', {})
  })

  it('lets a failed call reject so account deletion can stop and be retried', async () => {
    h.callable.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'functions/internal' }))
    await expect(cleanupGroupQuizData()).rejects.toThrow('boom')
  })
})

describe('describeTeamError', () => {
  it('shows the server message for expected function errors with and without prefix', () => {
    expect(describeTeamError({ code: 'functions/failed-precondition', message: 'This team is full.' })).toBe('This team is full.')
    expect(describeTeamError({ code: 'failed-precondition', message: 'This team is full.' })).toBe('This team is full.')
    expect(describeTeamError({ code: 'already-exists', message: 'Team name is already taken.' })).toBe('Team name is already taken.')
  })
  it('hides internal errors and unknown shapes behind a safe default', () => {
    const safe = 'Something went wrong. Please try again.'
    expect(describeTeamError({ code: 'functions/internal', message: 'stack trace here' })).toBe(safe)
    expect(describeTeamError({ code: 'internal', message: 'stack trace here' })).toBe(safe)
    expect(describeTeamError(new Error('raw'))).toBe(safe)
    expect(describeTeamError(null)).toBe(safe)
    expect(describeTeamError({ code: 'functions/not-found', message: '' })).toBe(safe)
    expect(describeTeamError({ code: 'not-found', message: '' })).toBe(safe)
  })
  it('explains a lost connection', () => {
    expect(describeTeamError({ code: 'functions/unavailable', message: 'x' })).toMatch(/offline/i)
    expect(describeTeamError({ code: 'unavailable', message: 'x' })).toMatch(/offline/i)
  })
})

describe('live data', () => {
  it('watchMyTeamId reports the pointer, or null when it is missing or malformed', () => {
    const seen: Array<string | null> = []
    const stop = watchMyTeamId('u1', 'q', value => seen.push(value), () => undefined, db)
    expect(lastListener().path).toBe('users/u1/groupQuizTeams/q')
    lastListener().next(snapshot({ teamId: 't9' }))
    lastListener().next(snapshot(undefined))
    lastListener().next(snapshot({ teamId: 42 }))
    expect(seen).toEqual(['t9', null, null])
    expect(typeof stop).toBe('function')
  })

  it('watchTeam parses a team, reports a missing one as null and reports damaged data as an error', () => {
    const teams: Array<unknown> = []
    const errors: Error[] = []
    watchTeam('q', 't', value => teams.push(value), cause => errors.push(cause), db)
    expect(lastListener().path).toBe('quizzes/q/teams/t')
    lastListener().next(snapshot(teamData, 't'))
    lastListener().next(snapshot(undefined))
    lastListener().next(snapshot({ ...teamData, status: 'bogus' }, 't'))
    expect(teams[0]).toMatchObject({ id: 't', name: 'Owls', memberIds: ['a', 'b'], status: 'forming', code: null, score: null })
    expect(teams[1]).toBeNull()
    expect(teams).toHaveLength(2)
    expect(errors).toHaveLength(1)
  })

  it('passes listener errors (for example a removed member losing access) to the caller', () => {
    const errors: Error[] = []
    watchTeamSession('q', 't', () => undefined, cause => errors.push(cause), db)
    expect(lastListener().path).toBe('quizzes/q/teamSessions/t')
    lastListener().error(new Error('permission-denied'))
    expect(errors.map(error => error.message)).toEqual(['permission-denied'])
  })

  it('watchReveals returns reveals in question order', () => {
    const seen: number[][] = []
    const reveal = (index: number) => ({ index, questionId: `q${index}`, question: { type: 'multiple_choice', prompt: 'P', points: 1, options: [] }, picks: {} })
    watchReveals('q', 't', list => seen.push(list.map(item => item.index)), () => undefined, db)
    expect(lastListener().path).toBe('quizzes/q/teamSessions/t/reveals')
    lastListener().next({ docs: [{ data: () => reveal(2) }, { data: () => reveal(0) }, { data: () => reveal(1) }] })
    expect(seen).toEqual([[0, 1, 2]])
  })

  it('watchQuizTeams sorts teams by name', () => {
    const seen: string[][] = []
    watchQuizTeams('q', teams => seen.push(teams.map(team => team.name)), () => undefined, db)
    expect(lastListener().path).toBe('quizzes/q/teams')
    lastListener().next({ docs: [{ id: 'b', data: () => ({ ...teamData, name: 'Wolves' }) }, { id: 'a', data: () => ({ ...teamData, name: 'Bears' }) }] })
    expect(seen).toEqual([['Bears', 'Wolves']])
  })
})
