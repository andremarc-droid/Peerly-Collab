import { describe, expect, it } from 'vitest'
import { joinLookupErrorMessage, joinOutcomeMessage } from './joinMessages'
import type { JoinOutcome } from './types'

describe('student join feedback', () => {
  it.each([
    ['joined', 'You’re in'],
    ['pending_approval', 'Request sent'],
    ['request_already_pending', 'Waiting for approval'],
    ['already_member', 'Already a member'],
    ['blocked', 'Contact your instructor'],
    ['joining_paused', 'Joining is paused'],
    ['class_archived', 'Class archived'],
    ['instructor_cannot_join', 'Use a student account'],
    ['not_found', 'Code not found'],
  ] as const satisfies ReadonlyArray<[JoinOutcome['outcome'], string]>)('maps %s to specific accessible feedback', (outcome, label) => {
    expect(joinOutcomeMessage(outcome)).toMatchObject({ label })
    expect(joinOutcomeMessage(outcome).message.length).toBeGreaterThan(8)
  })

  it('explains the wrong-code cooldown and network errors', () => {
    expect(joinLookupErrorMessage({ name: 'JoinLookupCooldownError' }).message).toMatch(/too many unsuccessful/i)
    expect(joinLookupErrorMessage({ code: 'unavailable' }).message).toMatch(/connection/i)
    expect(joinLookupErrorMessage(new Error('internal'))).toMatchObject({ label: 'Class lookup failed' })
  })
})
