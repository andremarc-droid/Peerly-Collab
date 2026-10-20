import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TagInput } from './TagInput'

afterEach(cleanup)

function Harness({ initial = [], caseSensitive = false, onChange }: { initial?: string[]; caseSensitive?: boolean; onChange?: (values: string[]) => void }) {
  const [values, setValues] = useState(initial)
  return <TagInput label="Accepted answers" values={values} caseSensitive={caseSensitive} onChange={(next) => { setValues(next); onChange?.(next) }} />
}

describe('TagInput', () => {
  it('adds a tag only when Enter is pressed', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const input = screen.getByLabelText('Accepted answers')
    await user.type(input, 'Syntax error')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Press Enter to add “Syntax error”')
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['Syntax error'])
    expect(screen.getByRole('button', { name: 'Remove answer Syntax error' })).toBeInTheDocument()
    expect(input).toHaveValue('')
  })

  it('does not add commas or blur text as tags and ignores empty Enter', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const input = screen.getByLabelText('Accepted answers')
    await user.type(input, 'a, b')
    await user.tab()
    expect(onChange).not.toHaveBeenCalled()
    await user.clear(input)
    await user.type(input, '   {Enter}')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('rejects duplicates using the grading rules', async () => {
    const user = userEvent.setup()
    render(<Harness initial={['Syntax error']} />)
    await user.type(screen.getByLabelText('Accepted answers'), 'SYNTAX ERROR{Enter}')
    expect(screen.getAllByRole('button', { name: /Remove answer/ })).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('already in the list')
  })

  it('keeps different capitalizations when answers are case-sensitive', async () => {
    const user = userEvent.setup()
    render(<Harness initial={['Syntax error']} caseSensitive />)
    await user.type(screen.getByLabelText('Accepted answers'), 'syntax error{Enter}')
    expect(screen.getAllByRole('button', { name: /Remove answer/ })).toHaveLength(2)
  })

  it('removes a tag with its button and with Backspace on an empty input', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness initial={['One', 'Two', 'Three']} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Remove answer Two' }))
    expect(onChange).toHaveBeenLastCalledWith(['One', 'Three'])
    await user.click(screen.getByLabelText('Accepted answers'))
    await user.keyboard('{Backspace}')
    expect(onChange).toHaveBeenLastCalledWith(['One'])
  })
})
