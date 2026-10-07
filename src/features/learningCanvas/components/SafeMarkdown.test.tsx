import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SafeMarkdownChunk from './SafeMarkdownChunk'

describe('SafeMarkdown security and rendering', () => {
  it('renders standard Markdown subset (bold, italic, lists, headings, code)', () => {
    const markdown = `# Main Title
This is **bold** and *italic*.
- Item 1
- Item 2

\`inline code\`
`
    const { container } = render(<SafeMarkdownChunk content={markdown} />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Main Title')
    expect(screen.getByText('bold')).toBeInTheDocument()
    expect(screen.getByText('italic')).toBeInTheDocument()
    expect(screen.getByText('Item 1')).toBeInTheDocument()
    expect(screen.getByText('Item 2')).toBeInTheDocument()
    expect(container.querySelector('code')).toHaveTextContent('inline code')
  })

  it('renders https links with rel="noopener noreferrer" and target="_blank"', () => {
    const markdown = '[Peerly](https://example.com/guide)'
    render(<SafeMarkdownChunk content={markdown} />)

    const link = screen.getByRole('link', { name: 'Peerly' })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', 'https://example.com/guide')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('blocks javascript: and non-https links from being clickable links', () => {
    const markdown = '[XSS Attack](javascript:alert(1)) and [Insecure](http://insecure.com)'
    render(<SafeMarkdownChunk content={markdown} />)

    expect(screen.queryByRole('link', { name: 'XSS Attack' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Insecure' })).toBeNull()
    expect(screen.getByText('XSS Attack')).toBeInTheDocument()
    expect(screen.getByText('Insecure')).toBeInTheDocument()
  })

  it('disallows and drops images completely', () => {
    const markdown = 'Look at this: ![Malicious Image](https://evil.com/tracker.png)'
    const { container } = render(<SafeMarkdownChunk content={markdown} />)

    expect(container.querySelector('img')).toBeNull()
    expect(screen.queryByAltText('Malicious Image')).toBeNull()
  })

  it('disallows raw HTML and script tags', () => {
    const markdown = '<script>window.pwned = true;</script><iframe src="https://evil.com"></iframe><b>Bold HTML</b>'
    const { container } = render(<SafeMarkdownChunk content={markdown} />)

    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('iframe')).toBeNull()
    // Raw HTML b tag is not rendered as DOM element when HTML parser is not enabled
    expect(container.querySelector('b')).toBeNull()
  })
})
