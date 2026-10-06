import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Alert } from './Alert'
import { Badge } from './Badge'
import { Button } from './Button'
import { DataCard } from './DataCard'
import { EmptyState } from './EmptyState'
import { PageHeader } from './PageHeader'
import { SectionCard } from './SectionCard'
import { StatTile } from './StatTile'
import { Tabs } from './Tabs'

afterEach(() => {
  cleanup()
})

describe('Component Variant & Anti-Regression Tests (No Dark-on-Dark)', () => {
  describe('Button variants on light and navy surfaces', () => {
    it('renders primary button on light surface with button--primary', () => {
      render(<Button variant="primary">Save changes</Button>)
      const btn = screen.getByRole('button', { name: 'Save changes' })
      expect(btn).toHaveClass('button', 'button--primary')
      expect(btn).not.toHaveClass('button--on-navy')
    })

    it('renders secondary button on light surface with button--secondary', () => {
      render(<Button variant="secondary">Cancel</Button>)
      const btn = screen.getByRole('button', { name: 'Cancel' })
      expect(btn).toHaveClass('button', 'button--secondary')
      expect(btn).not.toHaveClass('button--on-navy')
    })

    it('renders tertiary button link on light surface with button--tertiary', () => {
      render(<Button variant="tertiary">Learn more</Button>)
      const btn = screen.getByRole('button', { name: 'Learn more' })
      expect(btn).toHaveClass('button', 'button--tertiary')
      expect(btn).not.toHaveClass('button--on-navy')
    })

    it('renders primary button on navy surface with button--on-navy', () => {
      render(<Button variant="primary" surface="navy">Get started</Button>)
      const btn = screen.getByRole('button', { name: 'Get started' })
      expect(btn).toHaveClass('button', 'button--primary', 'button--on-navy')
    })

    it('renders secondary button on navy surface with button--on-navy', () => {
      render(<Button variant="secondary" surface="navy">View details</Button>)
      const btn = screen.getByRole('button', { name: 'View details' })
      expect(btn).toHaveClass('button', 'button--secondary', 'button--on-navy')
    })

    it('renders inverse button variant (white fill on navy)', () => {
      render(<Button variant="inverse">Take quiz</Button>)
      const btn = screen.getByRole('button', { name: 'Take quiz' })
      expect(btn).toHaveClass('button', 'button--inverse')
    })
  })

  describe('Tabs variants & counts', () => {
    it('sets correct accessibility attributes and count badge on tabs', () => {
      render(
        <Tabs
          label="Practice options"
          tabs={[
            { label: 'All', content: 'All items', count: 5 },
            { label: 'Starred', content: 'Starred items', count: 0 },
          ]}
        />,
      )
      const tabs = screen.getAllByRole('tab')
      expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
      expect(tabs[1]).toHaveAttribute('aria-selected', 'false')

      const counts = document.querySelectorAll('.tabs__count')
      expect(counts).toHaveLength(2)
      expect(counts[0]).toHaveTextContent('5')
      expect(counts[1]).toHaveTextContent('0')
    })
  })

  describe('StatTile variants without dark-on-dark stripes', () => {
    it('renders default white stat tile card', () => {
      render(<StatTile label="Accuracy" value="94%" hint="Target: 90%" />)
      const card = screen.getByRole('article')
      expect(card).toHaveClass('stat-tile', 'stat-tile--white')
      expect(card.querySelector('.stripe')).toBeNull()
    })

    it('renders navy stat tile without decorative stripe child element', () => {
      render(<StatTile label="Mastered" value="42" hint="Cards memorized" variant="navy" />)
      const card = screen.getByRole('article')
      expect(card).toHaveClass('stat-tile', 'stat-tile--navy')
      expect(card.querySelector('.stripe')).toBeNull()
      expect(card.querySelector('.stat-tile__stripe')).toBeNull()
    })
  })

  describe('EmptyState flat white card', () => {
    it('renders flat card without stripes or background gradients', () => {
      render(
        <EmptyState
          title="No quizzes yet"
          description="Create your first quiz to practice."
          action={<Button variant="primary">Create quiz</Button>}
        />,
      )
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('No quizzes yet')
      expect(screen.getByText('Create your first quiz to practice.')).toBeInTheDocument()
      expect(document.querySelector('.empty-state__stripe')).toBeNull()
    })
  })

  describe('Alert tones on neutral white card', () => {
    it('renders success, error, warning, and info tones', () => {
      const { rerender } = render(<Alert tone="success" label="Complete">All questions answered.</Alert>)
      expect(screen.getByRole('status')).toHaveClass('alert', 'alert--success')

      rerender(<Alert tone="error" label="Failed">Submission failed.</Alert>)
      expect(screen.getByRole('alert')).toHaveClass('alert', 'alert--error')

      rerender(<Alert tone="warning" label="Review needed">One card unrated.</Alert>)
      expect(screen.getByRole('status')).toHaveClass('alert', 'alert--warning')

      rerender(<Alert tone="info" label="Note">Practice is self-paced.</Alert>)
      expect(screen.getByRole('status')).toHaveClass('alert', 'alert--info')
    })
  })

  describe('PageHeader compact band and stripes', () => {
    it('renders header with eyebrow, title, and action', () => {
      render(
        <PageHeader
          eyebrow="CLASSROOM"
          title="Biology 101"
          subtitle="Cellular structures and mitosis."
          action={<Button variant="primary">Invite</Button>}
        />,
      )
      expect(screen.getByRole('banner')).toHaveClass('page-header')
      expect(screen.getByText('CLASSROOM')).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Biology 101')
      expect(screen.getByText('Cellular structures and mitosis.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Invite' })).toBeInTheDocument()
    })
  })

  describe('Cards and structured content', () => {
    it('renders DataCard with title, meta and actions', () => {
      render(
        <DataCard
          title="Chapter 1 Quiz"
          meta="10 questions · 15 minutes"
          badge={<Badge>Published</Badge>}
          actions={<Button variant="secondary">Start</Button>}
        />,
      )
      expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Chapter 1 Quiz')
      expect(screen.getByText('10 questions · 15 minutes')).toBeInTheDocument()
      expect(screen.getByText('Published')).toBeInTheDocument()
    })

    it('renders SectionCard with icon header and content', () => {
      render(
        <SectionCard title="Settings" description="Configure quiz parameters.">
          <p>Settings body</p>
        </SectionCard>,
      )
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Settings')
      expect(screen.getByText('Configure quiz parameters.')).toBeInTheDocument()
      expect(screen.getByText('Settings body')).toBeInTheDocument()
    })
  })
})
