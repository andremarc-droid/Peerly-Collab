import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClassColorPicker } from './ClassColorPicker'
import { COLOR_OPTIONS } from './types'

afterEach(() => {
  cleanup()
})

describe('ClassColorPicker', () => {
  it('renders all 11 color swatches with accessible labels and 44px touch targets', () => {
    render(<ClassColorPicker value="navy" onChange={() => undefined} />)

    for (const option of COLOR_OPTIONS) {
      const radio = screen.getByRole('radio', { name: option.label })
      expect(radio).toBeInTheDocument()
      const label = radio.closest('label')
      expect(label).toHaveClass('min-w-11')
      expect(label).toHaveClass('min-h-11')
    }
  })

  it('indicates the selected swatch and shows checkmark', () => {
    render(<ClassColorPicker value="ocean" onChange={() => undefined} />)

    const oceanRadio = screen.getByRole('radio', { name: 'Ocean' })
    expect(oceanRadio).toBeChecked()

    const navyRadio = screen.getByRole('radio', { name: 'Navy' })
    expect(navyRadio).not.toBeChecked()

    const selectedSwatch = oceanRadio.nextElementSibling
    expect(selectedSwatch).toHaveClass('class-color-picker__swatch--selected')
    expect(selectedSwatch).toHaveAttribute('data-class-color', 'ocean')
  })

  it('calls onChange when clicking a swatch', () => {
    const handleChange = vi.fn()
    render(<ClassColorPicker value="navy" onChange={handleChange} />)

    const tealRadio = screen.getByRole('radio', { name: 'Teal' })
    fireEvent.click(tealRadio)

    expect(handleChange).toHaveBeenCalledWith('teal')
  })

  it('supports keyboard navigation using arrow keys', () => {
    const handleChange = vi.fn()
    render(<ClassColorPicker value="navy" onChange={handleChange} />)

    const navyRadio = screen.getByRole('radio', { name: 'Navy' })
    // Navy is index 0 -> ArrowRight should navigate to Ocean (index 1)
    fireEvent.keyDown(navyRadio, { key: 'ArrowRight' })
    expect(handleChange).toHaveBeenCalledWith('ocean')

    // ArrowLeft should wrap to Slate (last item)
    fireEvent.keyDown(navyRadio, { key: 'ArrowLeft' })
    expect(handleChange).toHaveBeenCalledWith('slate')
  })

  it('displays a live preview tile showing the selected color and class name', () => {
    render(
      <ClassColorPicker
        value="purple"
        onChange={() => undefined}
        previewName="Advanced Physics"
        previewSection="Period 4"
      />
    )

    expect(screen.getByText('Advanced Physics')).toBeInTheDocument()
    expect(screen.getByText('Period 4')).toBeInTheDocument()

    const previewContainer = screen.getByText('Advanced Physics').closest('[data-class-color]')
    expect(previewContainer).toHaveAttribute('data-class-color', 'purple')
  })
})
