import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CanvasTextOutline } from './CanvasTextOutline'
import { CardEditorPanel } from './CardEditorPanel'
import { LinkCard } from './nodes/LinkCard'
import type { CanvasCard } from '../types'

afterEach(() => {
  cleanup()
})

function linkCard(id: string, url: string): CanvasCard {
  return { id, type: 'link', title: `Link ${id}`, content: 'Resource', url, position: { x: 0, y: 0 } }
}

function renderLinkNode(card: CanvasCard) {
  return render(
    <ReactFlowProvider>
      <LinkCard
        id={card.id}
        data={{ card } as never}
        selected={false}
        type="link"
        zIndex={1}
        isConnectable={true}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        dragging={false}
        selectable={true}
        deletable={true}
        draggable={true}
      />
    </ReactFlowProvider>,
  )
}

describe('canvas link safety', () => {
  it('LinkCard renders an https link as clickable', () => {
    renderLinkNode(linkCard('ok', 'https://example.com/page'))
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://example.com/page')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.queryByText('Link blocked')).not.toBeInTheDocument()
  })

  it.each(['javascript:alert(1)', 'http://example.com', 'data:text/html;base64,AAAA', 'https://user:pw@example.com'])(
    'LinkCard blocks %s',
    (url) => {
      renderLinkNode(linkCard('bad', url))
      expect(screen.queryByRole('link')).not.toBeInTheDocument()
      expect(screen.getByText('Link blocked')).toBeInTheDocument()
    },
  )

  it('text outline only links https URLs and labels the rest as blocked', () => {
    render(
      <CanvasTextOutline
        defaultOpen={true}
        cards={[
          linkCard('good', 'https://example.com/ok'),
          linkCard('js', 'javascript:alert(document.cookie)'),
          linkCard('plain', 'http://example.com/insecure'),
        ]}
        connections={[]}
      />,
    )

    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', 'https://example.com/ok')
    expect(screen.getAllByText(/Link blocked/i)).toHaveLength(2)
  })

  it('read-only card panel does not link an unsafe URL', () => {
    render(
      <CardEditorPanel
        card={linkCard('x', 'javascript:alert(1)')}
        readOnly={true}
        onClose={() => undefined}
      />,
    )
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText(/Link blocked/i)).toBeInTheDocument()
  })

  it('read-only card panel links a safe URL', () => {
    render(
      <CardEditorPanel
        card={linkCard('y', 'https://example.com/read')}
        readOnly={true}
        onClose={() => undefined}
      />,
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com/read')
  })
})

describe('text outline collapse', () => {
  const cards: CanvasCard[] = [
    { id: 'a', type: 'note', title: 'Alpha', content: 'First card', position: { x: 0, y: 0 } },
  ]

  it('can start closed, then open and close again', () => {
    render(<CanvasTextOutline defaultOpen={false} cards={cards} connections={[]} />)

    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Show text outline/i }))
    expect(screen.getByText('Alpha')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Hide text outline/i }))
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Show text outline/i })).toBeInTheDocument()
  })

  it('is open by default when matchMedia is unavailable', () => {
    render(<CanvasTextOutline cards={cards} connections={[]} />)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
  })
})
