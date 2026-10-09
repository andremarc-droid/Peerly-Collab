import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LayoutGrid, Sparkles } from 'lucide-react'
import { MobileChromeContext } from '../../../lib/platform/mobileChromeContext'
import { M3AppBar } from './M3AppBar'
import { M3Button } from './M3Button'
import { M3NavBar } from './M3NavBar'
import { M3PageHeader } from './M3PageHeader'
import { M3PasswordField } from './M3PasswordField'
import { M3TextField } from './M3TextField'

afterEach(cleanup)

describe('M3Button', () => {
  it('renders a link when given a destination and a button otherwise', () => {
    const onClick = vi.fn()
    render(
      <MemoryRouter>
        <M3Button to="/start">Go</M3Button>
        <M3Button onClick={onClick}>Tap</M3Button>
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Go' })).toHaveAttribute('href', '/start')
    const button = screen.getByRole('button', { name: 'Tap' })
    expect(button).toHaveAttribute('type', 'button')
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does nothing when disabled', () => {
    const onClick = vi.fn()
    render(<M3Button disabled onClick={onClick}>Wait</M3Button>)
    fireEvent.click(screen.getByRole('button', { name: 'Wait' }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('gives every variant touch feedback and a 56px target, with a distinct look', () => {
    render(
      <>
        <M3Button>Filled</M3Button>
        <M3Button variant="outlined">Outlined</M3Button>
        <M3Button variant="text">Text</M3Button>
      </>,
    )
    const [filled, outlined, text] = ['Filled', 'Outlined', 'Text'].map((name) => screen.getByRole('button', { name }))

    for (const button of [filled, outlined, text]) {
      expect(button).toHaveClass('m3-press', 'min-h-14', 'rounded-full')
    }
    expect(filled).toHaveClass('bg-navy-900', 'text-white')
    expect(outlined).toHaveClass('border-navy-900-30', 'bg-white')
    expect(text).toHaveClass('bg-transparent')
  })

  it('sets horizontal padding once per variant, so no two px classes compete', () => {
    render(
      <>
        <M3Button>Filled</M3Button>
        <M3Button variant="text">Text</M3Button>
      </>,
    )
    expect(screen.getByRole('button', { name: 'Filled' })).toHaveClass('px-6')
    const text = screen.getByRole('button', { name: 'Text' })
    expect(text).toHaveClass('px-4')
    expect(text).not.toHaveClass('px-6')
  })
})

describe('M3AppBar', () => {
  it('shows the page title as the h1 with a back button', () => {
    render(
      <MemoryRouter>
        <M3AppBar backTo="/" title="Pick one" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Pick one' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/')
  })

  it('can leave out the back button and move focus to the title', () => {
    render(
      <MemoryRouter>
        <M3AppBar title="Pick one" focusTitle />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('link', { name: 'Back' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Pick one' })).toHaveFocus()
  })

  it('leaves focus alone unless asked to move it', () => {
    render(
      <MemoryRouter>
        <M3AppBar title="Pick one" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Pick one' })).not.toHaveFocus()
  })

  it('keeps the back button at least 44px and the title out of the tab order', () => {
    render(
      <MemoryRouter>
        <M3AppBar backTo="/" title="Pick one" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Back' })).toHaveClass('size-12', 'm3-press--icon')
    expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute('tabindex', '-1')
  })
})

describe('M3TextField', () => {
  it('ties the label, hint and error to the input', () => {
    render(<M3TextField label="Email address" hint="We never share it." error="Enter a valid email address." />)

    const input = screen.getByLabelText('Email address')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('We never share it. Enter a valid email address.')
    expect(input).toHaveClass('h-14', 'rounded-2xl')
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.')
  })

  it('is valid and has no alert when there is no error', () => {
    render(<M3TextField label="Name" />)
    expect(screen.getByLabelText('Name')).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps a description the caller already set next to the hint and error', () => {
    render(<M3TextField label="Name" aria-describedby="extra" hint="Hint." />)
    expect(screen.getByLabelText('Name').getAttribute('aria-describedby')).toMatch(/^extra .+-hint$/)
  })

  it('makes room for a trailing control with a single padding rule', () => {
    render(
      <>
        <M3TextField label="Plain" />
        <M3TextField label="With control" trailing={<span>x</span>} />
      </>,
    )
    expect(screen.getByLabelText('Plain')).toHaveClass('px-4')
    const padded = screen.getByLabelText('With control')
    expect(padded).toHaveClass('pl-4', 'pr-14')
    expect(padded).not.toHaveClass('px-4')
  })
})

describe('M3NavBar', () => {
  it('marks the current tab and keeps 48px targets with 14px labels', () => {
    render(
      <MemoryRouter initialEntries={['/instructor']}>
        <M3NavBar
          label="Instructor navigation"
          items={[
            { to: '/instructor', label: 'Classes', Icon: LayoutGrid, end: true },
            { to: '/instructor/learning', label: 'Learning', Icon: Sparkles },
          ]}
        />
      </MemoryRouter>,
    )
    const nav = screen.getByRole('navigation', { name: 'Instructor navigation' })
    expect(nav).toHaveClass('m3-nav', 'grid-cols-3')
    const current = screen.getByRole('link', { name: 'Classes' })
    expect(current).toHaveAttribute('aria-current', 'page')
    expect(current).toHaveClass('min-h-12', 'bg-navy-700-07', 'text-navy-900')
    expect(screen.getByRole('link', { name: 'Learning' })).toHaveClass('text-navy-800-72')
  })
})

describe('M3PageHeader', () => {
  it('uses a large title on white and moves focus to it', () => {
    render(
      <MemoryRouter>
        <MobileChromeContext.Provider value={{ tabRoot: true, backTo: null }}>
          <M3PageHeader eyebrow="INSTRUCTOR SPACE" title="My classes." subtitle="Your teaching space." action={<button type="button">Create class</button>} />
        </MobileChromeContext.Provider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'My classes.' })).toHaveFocus()
    expect(screen.queryByRole('link', { name: 'Back' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create class' })).toBeInTheDocument()
    expect(screen.queryByText('INSTRUCTOR SPACE')?.closest('.page-header')).toHaveClass('page-header--m3')
  })

  it('shows a back control on pushed screens and can hide a desktop-only action', () => {
    render(
      <MemoryRouter>
        <MobileChromeContext.Provider value={{ tabRoot: false, backTo: '/instructor' }}>
          <M3PageHeader eyebrow="ACTIVE CLASS" title="Biology 101" subtitle="Section A" action={<button type="button">Back to My classes</button>} mobileAction={null} />
        </MobileChromeContext.Provider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/instructor')
    expect(screen.queryByRole('button', { name: 'Back to My classes' })).not.toBeInTheDocument()
  })
})

describe('M3PasswordField', () => {
  it('names the toggle by what it will do and controls the input', () => {
    const onToggle = vi.fn()
    const { rerender } = render(<M3PasswordField label="Password" value="" onChange={() => undefined} visible={false} onToggle={onToggle} />)

    const input = screen.getByLabelText('Password')
    expect(input).toHaveAttribute('type', 'password')
    const toggle = screen.getByRole('button', { name: 'Show password' })
    expect(toggle).toHaveAttribute('aria-controls', input.id)
    expect(toggle).toHaveClass('size-12')
    fireEvent.click(toggle)
    expect(onToggle).toHaveBeenCalledTimes(1)

    rerender(<M3PasswordField label="Password" value="" onChange={() => undefined} visible onToggle={onToggle} />)
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument()
  })
})
