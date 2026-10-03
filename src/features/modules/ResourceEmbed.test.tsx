import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ResourceEmbed } from './ResourceEmbed'

afterEach(cleanup)

describe('ResourceEmbed', () => {
  it('embeds an allowlisted preview with the required sandbox and always offers a fallback', () => {
    render(<ResourceEmbed src="https://docs.google.com/document/d/abcdefghijk/preview" fallbackUrl="https://docs.google.com/document/d/abcdefghijk/view" title="Unit notes preview" fallbackLabel="Open in Drive" />)
    const frame = screen.getByTitle('Unit notes preview')
    expect(frame).toHaveAttribute('loading', 'lazy')
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation')
    expect(frame).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
    expect(screen.getByRole('link', { name: 'Open in Drive' })).toHaveAttribute('href', 'https://docs.google.com/document/d/abcdefghijk/view')
    expect(screen.getByRole('status', { name: 'Loading preview: Unit notes preview' })).toBeInTheDocument()
    fireEvent.load(frame)
    expect(screen.queryByRole('status', { name: 'Loading preview: Unit notes preview' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open in Drive' })).toBeInTheDocument()
  })

  it('never embeds a non-allowlisted host and still shows the fallback link', () => {
    render(<ResourceEmbed src="https://example.com/embed" fallbackUrl="https://example.com" title="External preview" />)
    expect(screen.queryByTitle('External preview')).not.toBeInTheDocument()
    expect(screen.getByText('This link opens in a new tab and cannot be embedded.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open in new tab' })).toHaveAttribute('href', 'https://example.com')
  })
})
