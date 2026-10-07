import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeImage, makeMessage } from '../testFactories'
import { MessageBubble } from './MessageBubble'

function renderBubble(message: ReturnType<typeof makeMessage>, canRetry = false) {
  const onRetry = vi.fn()
  render(
    <ul>
      <MessageBubble message={message} canRetry={canRetry} onRetry={onRetry} />
    </ul>,
  )
  return { onRetry }
}

describe('MessageBubble', () => {
  afterEach(cleanup)

  it('offers Retry on the newest failed message', () => {
    const { onRetry } = renderBubble(makeMessage(0, 'user', 'Explain mitosis', { failed: true }), true)

    expect(screen.getByText('Not answered')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows a failed message without Retry when it is not the newest', () => {
    renderBubble(makeMessage(0, 'user', 'Old question', { failed: true }), false)

    expect(screen.getByText('Not answered')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })

  it('does not show Not answered for a normal message', () => {
    renderBubble(makeMessage(0, 'user', 'Hello'), true)

    expect(screen.queryByText('Not answered')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })

  it('shows attached images from their base64 data', () => {
    renderBubble(makeMessage(0, 'user', 'What is this?', { images: [makeImage('plant.jpg')] }))

    expect(screen.getByAltText('plant.jpg')).toHaveAttribute('src', 'data:image/jpeg;base64,QUJD')
  })

  it('shows learner text literally instead of treating it as HTML', () => {
    renderBubble(makeMessage(0, 'user', '<b>bold</b> <img src=x onerror=alert(1)>'))

    expect(screen.getByText(/<b>bold<\/b>/)).toBeInTheDocument()
    expect(document.querySelector('b')).toBeNull()
    expect(document.querySelector('img')).toBeNull()
  })

  it('shows the tutor reply', () => {
    renderBubble(makeMessage(1, 'assistant', 'The nucleus stores DNA.'))

    expect(screen.getByText('The nucleus stores DNA.')).toBeInTheDocument()
  })
})
