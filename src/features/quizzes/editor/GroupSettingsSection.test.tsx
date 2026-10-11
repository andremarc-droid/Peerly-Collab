import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Participation, QuizMode } from '../types'
import { GroupSettingsSection } from './GroupSettingsSection'
import { defaultGroupParticipation } from './groupSettingsLogic'

afterEach(cleanup)

function Harness({ initial, mode = 'quiz', spy }: { initial: Participation; mode?: QuizMode; spy?: (next: Participation) => void }) {
  const [value, setValue] = useState<Participation>(initial)
  return <GroupSettingsSection mode={mode} participation={value} onChange={(next) => { spy?.(next); setValue(next) }} />
}

const last = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls[spy.mock.calls.length - 1][0] as Participation

describe('GroupSettingsSection', () => {
  it('shows only the participation choice for an individual quiz', () => {
    render(<Harness initial={{ type: 'individual' }} />)
    expect(screen.getByRole('radio', { name: /Individual/ })).toBeChecked()
    expect(screen.queryByLabelText(/Largest team size/)).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /One representative answers/ })).not.toBeInTheDocument()
  })

  it('switches to a valid default group setup when "Group" is chosen', () => {
    const spy = vi.fn()
    render(<Harness initial={{ type: 'individual' }} spy={spy} />)
    fireEvent.click(screen.getByRole('radio', { name: /Group of 2 or more/ }))
    expect(last(spy)).toEqual(defaultGroupParticipation())
    expect(screen.getByLabelText(/Largest team size/)).toHaveValue(3)
    expect(screen.getByRole('radio', { name: /One representative answers/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /I build the teams/ })).toBeChecked()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('goes back to individual and drops the group settings', () => {
    const spy = vi.fn()
    render(<Harness initial={defaultGroupParticipation()} spy={spy} />)
    fireEvent.click(screen.getByRole('radio', { name: /Individual/ }))
    expect(last(spy)).toEqual({ type: 'individual' })
    expect(screen.queryByLabelText(/Largest team size/)).not.toBeInTheDocument()
  })

  it('updates the team size and flags values outside 2-10, empty and fractional boxes', () => {
    const spy = vi.fn()
    render(<Harness initial={defaultGroupParticipation()} spy={spy} />)
    const size = screen.getByLabelText(/Largest team size/)
    fireEvent.change(size, { target: { value: '4' } })
    expect(last(spy)).toMatchObject({ type: 'group', groupSize: 4 })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    for (const bad of ['1', '11', '', '2.5']) {
      fireEvent.change(size, { target: { value: bad } })
      expect(screen.getByRole('alert')).toHaveTextContent(/whole number from 2 to 10/)
    }
    fireEvent.change(size, { target: { value: '10' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('changes the answer mode and team formation', () => {
    const spy = vi.fn()
    render(<Harness initial={defaultGroupParticipation()} spy={spy} />)
    fireEvent.click(screen.getByRole('radio', { name: /Everyone answers, then one locks it in/ }))
    expect(last(spy)).toMatchObject({ answerMode: 'everyone' })
    fireEvent.click(screen.getByRole('radio', { name: /Students form their own teams/ }))
    expect(last(spy)).toMatchObject({ answerMode: 'everyone', teamFormation: 'self' })
  })

  it('explains what waiting means for the chosen answer mode and timer', () => {
    render(<Harness initial={defaultGroupParticipation()} />)
    const wait = screen.getByRole('checkbox', { name: /Wait for everyone/ })
    expect(wait).not.toBeChecked()
    expect(wait).toHaveAccessibleName(/until the representative has answered/)
    fireEvent.click(screen.getByRole('radio', { name: /Everyone answers, then one locks it in/ }))
    expect(wait).toHaveAccessibleName(/until every teammate has answered/)
    fireEvent.click(screen.getByRole('checkbox', { name: /Set a timer for each question/ }))
    expect(wait).toHaveAccessibleName(/or the timer ends/)
  })

  it('turns the per-question timer on with 30 seconds, validates 10-300 and turns it off', () => {
    const spy = vi.fn()
    render(<Harness initial={defaultGroupParticipation()} spy={spy} />)
    expect(screen.queryByLabelText(/Seconds per question/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /Set a timer for each question/ }))
    expect(last(spy)).toMatchObject({ questionTimeSec: 30 })
    const seconds = screen.getByLabelText(/Seconds per question/)
    expect(seconds).toHaveValue(30)
    fireEvent.change(seconds, { target: { value: '5' } })
    expect(screen.getByRole('alert')).toHaveTextContent(/10 to 300/)
    fireEvent.change(seconds, { target: { value: '301' } })
    expect(screen.getByRole('alert')).toHaveTextContent(/10 to 300/)
    fireEvent.change(seconds, { target: { value: '120' } })
    expect(last(spy)).toMatchObject({ questionTimeSec: 120 })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /Set a timer for each question/ }))
    expect(last(spy)).toMatchObject({ questionTimeSec: null })
    expect(screen.queryByLabelText(/Seconds per question/)).not.toBeInTheDocument()
  })

  it('toggles waiting for everyone', () => {
    const spy = vi.fn()
    render(<Harness initial={defaultGroupParticipation()} spy={spy} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Wait for everyone/ }))
    expect(last(spy)).toMatchObject({ waitForEveryone: true })
  })

  it('keeps the existing choices of a saved group quiz', () => {
    render(<Harness initial={{ type: 'group', groupSize: 5, answerMode: 'everyone', teamFormation: 'self', waitForEveryone: true, questionTimeSec: 45 }} />)
    expect(screen.getByLabelText(/Largest team size/)).toHaveValue(5)
    expect(screen.getByRole('radio', { name: /Everyone answers, then one locks it in/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Students form their own teams/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Wait for everyone/ })).toBeChecked()
    expect(screen.getByLabelText(/Seconds per question/)).toHaveValue(45)
  })

  it.each([['flashcards', /Flashcard sets/], ['canvas', /Canvas quizzes/]] as const)('offers no group choice for %s', (mode, text) => {
    render(<Harness initial={{ type: 'individual' }} mode={mode} />)
    expect(screen.getByText(text)).toHaveTextContent(/always completed individually/)
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })
})
