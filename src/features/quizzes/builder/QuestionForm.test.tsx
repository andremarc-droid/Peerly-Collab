import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isCorrect } from '../grading/grade'
import { QuestionForm } from './QuestionForm'
import { createQuestionDraft, toQuestionPair, type QuestionDraft } from './questionDraft'

afterEach(cleanup)

function Harness({ initial, onDraft, onSubmit }: { initial?: Partial<QuestionDraft>; onDraft?: (draft: QuestionDraft) => void; onSubmit?: () => void }) {
  const [draft, setDraft] = useState<QuestionDraft>({ ...createQuestionDraft('identification'), prompt: 'Name the error', ...initial })
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit?.() }}>
    <QuestionForm draft={draft} mode="quiz" errors={{}} onChange={(next) => { setDraft(next); onDraft?.(next) }} />
  </form>
}

describe('QuestionForm identification answers', () => {
  it('shows saved answers as tags and only adds a new one when Enter is pressed', async () => {
    const user = userEvent.setup()
    const onDraft = vi.fn()
    render(<Harness initial={{ acceptedAnswers: 'Syntax error' }} onDraft={onDraft} />)
    expect(screen.getByRole('button', { name: 'Remove answer Syntax error' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Accepted answers'), 'Parse error')
    expect(onDraft).not.toHaveBeenCalled()
    await user.keyboard('{Enter}')
    expect(onDraft).toHaveBeenLastCalledWith(expect.objectContaining({ acceptedAnswers: 'Syntax error\nParse error' }))
  })

  it('does not submit the surrounding form when Enter adds a tag', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)
    await user.type(screen.getByLabelText('Accepted answers'), 'Syntax error{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Remove answer Syntax error' })).toBeInTheDocument()
  })

  it('removes a tag from the saved answers', async () => {
    const user = userEvent.setup()
    const onDraft = vi.fn()
    render(<Harness initial={{ acceptedAnswers: 'One\nTwo' }} onDraft={onDraft} />)
    await user.click(screen.getByRole('button', { name: 'Remove answer One' }))
    expect(onDraft).toHaveBeenLastCalledWith(expect.objectContaining({ acceptedAnswers: 'Two' }))
  })

  it('merges variants that only differ by capitalization once case-sensitivity is turned off', async () => {
    const user = userEvent.setup()
    const onDraft = vi.fn()
    render(<Harness initial={{ caseSensitive: true, acceptedAnswers: 'Syntax error\nsyntax error' }} onDraft={onDraft} />)
    expect(screen.getAllByRole('button', { name: /Remove answer/ })).toHaveLength(2)
    await user.click(screen.getByRole('checkbox', { name: /case-sensitive/i }))
    expect(onDraft).toHaveBeenLastCalledWith(expect.objectContaining({ caseSensitive: false, acceptedAnswers: 'Syntax error' }))
    expect(screen.getAllByRole('button', { name: /Remove answer/ })).toHaveLength(1)
  })

  it('keeps every spelling when case-sensitivity is turned on', async () => {
    const user = userEvent.setup()
    const onDraft = vi.fn()
    render(<Harness initial={{ caseSensitive: false, acceptedAnswers: 'Syntax error' }} onDraft={onDraft} />)
    await user.click(screen.getByRole('checkbox', { name: /case-sensitive/i }))
    expect(onDraft).toHaveBeenLastCalledWith(expect.objectContaining({ caseSensitive: true, acceptedAnswers: 'Syntax error' }))
    await user.type(screen.getByLabelText('Accepted answers'), 'syntax error{Enter}')
    expect(onDraft).toHaveBeenLastCalledWith(expect.objectContaining({ acceptedAnswers: 'Syntax error\nsyntax error' }))
  })

  it('saves exactly what was entered and grades a student answer against it', async () => {
    const user = userEvent.setup()
    let latest: QuestionDraft | undefined
    render(<Harness initial={{ points: '2' }} onDraft={(draft) => { latest = draft }} />)
    await user.type(screen.getByLabelText('Accepted answers'), 'Syntax error{Enter}')
    const { question, answerKey } = toQuestionPair(latest!, 0)
    expect(answerKey.type === 'identification' && answerKey.acceptedAnswers).toEqual(['Syntax error'])
    expect(isCorrect(question, answerKey, 'Syntax error')).toBe(true)
    expect(isCorrect(question, answerKey, '  syntax   ERROR ')).toBe(true)
    expect(isCorrect(question, answerKey, 'Runtime error')).toBe(false)
  })
})
