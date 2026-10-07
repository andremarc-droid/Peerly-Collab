import ReactMarkdown from 'react-markdown'

interface SafeMarkdownChunkProps {
  content: string
  className?: string
}

const ALLOWED_ELEMENTS = [
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'em',
  'ul',
  'ol',
  'li',
  'a',
  'code',
  'pre',
  'blockquote',
  'hr',
]

/**
 * Lazy-loaded Markdown chunk renderer:
 * - Exact pinned react-markdown
 * - No raw HTML
 * - No images
 * - https:// links only with rel="noopener noreferrer" and target="_blank"
 */
export default function SafeMarkdownChunk({ content, className = '' }: SafeMarkdownChunkProps) {
  return (
    <div className={`learning-canvas-markdown ${className}`}>
      <ReactMarkdown
        allowedElements={ALLOWED_ELEMENTS}
        unwrapDisallowed
        components={{
          img: () => null,
          a: ({ href, children }) => {
            if (!href || !href.startsWith('https://')) {
              return <span>{children}</span>
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-navy-900 underline font-medium hover:text-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-800 rounded"
              >
                {children}
              </a>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
