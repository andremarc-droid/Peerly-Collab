import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClassTile } from './ClassTile'

const view = vi.hoisted(() => ({ mobile: false }))
vi.mock('../../lib/platform/isMobileView', () => ({ useIsMobileView: () => view.mobile }))

afterEach(() => {
  view.mobile = false
  cleanup()
})

describe('ClassTile', () => {
  it('renders instructor variant with student count, quiz count, code, and link to class', () => {
    const { container } = render(
      <MemoryRouter>
        <ClassTile
          role="instructor"
          id="c1"
          name="Math 101"
          section="Sec A"
          subject="Calculus"
          instructorName="Ms. Nguyen"
          instructorPhotoURL="https://example.test/instructor.jpg"
          color="ocean"
          accent="pinstripe"
          joinCode="8VYRTY"
          studentsCount={15}
          quizzesCount={3}
          pendingCount={2}
        />
      </MemoryRouter>
    )

    expect(screen.getByText('Math 101')).toBeInTheDocument()
    expect(screen.getByText('Sec A · Calculus')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('2 pending')).toBeInTheDocument()
    expect(screen.getByText('8VYRTY')).toBeInTheDocument()
    expect(screen.getByText('Instructor · Ms. Nguyen')).toBeInTheDocument()
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.test/instructor.jpg')

    const link = screen.getByRole('link', { name: 'Open class Math 101' })
    expect(link).toHaveAttribute('href', '/instructor/classes/c1')
  })

  it('renders student variant with instructor name and quiz count', () => {
    render(
      <MemoryRouter>
        <ClassTile
          role="student"
          id="c2"
          name="Biology"
          section="Period 2"
          subject="Genetics"
          color="teal"
          instructorName="Dr. Watson"
          availableQuizzesCount={4}
          enrollmentStatus="active"
        />
      </MemoryRouter>
    )

    expect(screen.getByText('Biology')).toBeInTheDocument()
    expect(screen.getByText('Instructor · Dr. Watson')).toBeInTheDocument()
    expect(screen.getByText('4 published quizzes')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Open class Biology' })
    expect(link).toHaveAttribute('href', '/student/classes/c2')
  })

  it('renders pending student state and is not clickable into the class', () => {
    render(
      <MemoryRouter>
        <ClassTile
          role="student"
          id="c3"
          name="Chemistry"
          instructorName="Mr. White"
          enrollmentStatus="pending"
        />
      </MemoryRouter>
    )

    expect(screen.getByText('Chemistry')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('Waiting for approval from your instructor')).toBeInTheDocument()

    // No link to open class should exist
    expect(screen.queryByRole('link', { name: 'Open class Chemistry' })).not.toBeInTheDocument()
  })

  it('renders archived state with Archived badge and greyed class', () => {
    const { container } = render(
      <MemoryRouter>
        <ClassTile
          role="instructor"
          id="c4"
          name="Old History"
          status="archived"
        />
      </MemoryRouter>
    )

    expect(screen.getByText('Archived')).toBeInTheDocument()
    const article = container.querySelector('.class-tile')
    expect(article).toHaveClass('class-tile--archived')
  })

  it('maintains accessible keyboard navigation with one main tile link', () => {
    render(
      <MemoryRouter>
        <ClassTile
          role="instructor"
          id="c5"
          name="Literature"
          joinCode="ABCDEF"
        />
      </MemoryRouter>
    )

    // Exactly one link for the whole tile
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '/instructor/classes/c5')
  })

  it('provides working instructor menu actions (Copy code, Edit appearance, Archive)', () => {
    const onCopy = vi.fn()
    const onEdit = vi.fn()
    const onArchive = vi.fn()

    render(
      <MemoryRouter>
        <ClassTile
          role="instructor"
          id="c6"
          name="Physics"
          joinCode="PHY123"
          status="active"
          onCopyCode={onCopy}
          onEditAppearance={onEdit}
          onToggleArchive={onArchive}
        />
      </MemoryRouter>
    )

    // Open menu and click Copy code
    const menuBtn = screen.getByRole('button', { name: /Class actions for Physics/i })
    fireEvent.click(menuBtn)
    const copyBtn = screen.getByRole('menuitem', { name: /Copy code/i })
    fireEvent.click(copyBtn)
    expect(onCopy).toHaveBeenCalledTimes(1)

    // Open menu and click Edit appearance
    fireEvent.click(menuBtn)
    const editBtn = screen.getByRole('menuitem', { name: /Edit appearance/i })
    fireEvent.click(editBtn)
    expect(onEdit).toHaveBeenCalledTimes(1)

    // Open menu and click Archive
    fireEvent.click(menuBtn)
    const archiveBtn = screen.getByRole('menuitem', { name: /Archive class/i })
    fireEvent.click(archiveBtn)
    expect(onArchive).toHaveBeenCalledTimes(1)
  })

  it('provides working student menu action (Leave class)', () => {
    const onLeave = vi.fn()

    render(
      <MemoryRouter>
        <ClassTile
          role="student"
          id="c7"
          name="Art History"
          enrollmentStatus="active"
          onLeaveClass={onLeave}
        />
      </MemoryRouter>
    )

    // Open menu
    const menuBtn = screen.getByRole('button', { name: /Class actions for Art History/i })
    fireEvent.click(menuBtn)

    const leaveBtn = screen.getByRole('menuitem', { name: /Leave class/i })
    fireEvent.click(leaveBtn)
    expect(onLeave).toHaveBeenCalledTimes(1)
  })

  it('renders a list-style card on phones instead of the colored header band', () => {
    view.mobile = true
    const { container } = render(
      <MemoryRouter>
        <ClassTile
          role="instructor"
          id="c1"
          name="Math 101"
          section="Sec A"
          subject="Calculus"
          joinCode="8VYRTY"
          studentsCount={15}
          quizzesCount={3}
          onCopyCode={() => undefined}
        />
      </MemoryRouter>,
    )
    expect(container.querySelector('.class-tile--m3')).toBeInTheDocument()
    expect(container.querySelector('.class-tile__header')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open class Math 101' })).toHaveAttribute('href', '/instructor/classes/c1')
    expect(screen.getByText(/15 students · 3 quizzes · Code 8VYRTY/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Class actions for Math 101/i }))
    expect(screen.getByRole('menuitem', { name: /Copy code/i })).toBeInTheDocument()
  })
})
