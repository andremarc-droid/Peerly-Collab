import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Tabs } from './Tabs'

describe('Tabs', () => {
  it('starts on Modules and supports click and keyboard navigation', () => {
    const onChange = vi.fn()
    render(<Tabs label="Class sections" defaultIndex={0} onChange={onChange} tabs={[
      { label: 'Modules', content: <p>Module panel</p> },
      { label: 'Quizzes', content: <p>Quiz panel</p> },
      { label: 'People', content: <p>People panel</p> },
      { label: 'Settings', content: <p>Settings panel</p> },
    ]} />)
    expect(screen.getByRole('tab', { name: 'Modules' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Module panel')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Quizzes' }))
    expect(screen.getByText('Quiz panel')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Quizzes' }), { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'People' })).toHaveAttribute('aria-selected', 'true')
    expect(onChange).toHaveBeenLastCalledWith(2)
  })
})
