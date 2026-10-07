import { lazy, Suspense } from 'react'

const SafeMarkdownChunk = lazy(() => import('./SafeMarkdownChunk'))

export interface SafeMarkdownProps {
  content: string
  className?: string
}

/**
 * Lazy-loaded markdown container with accessible plain-text fallback while loading.
 */
export function SafeMarkdown({ content, className = '' }: SafeMarkdownProps) {
  return (
    <Suspense fallback={<div className={`whitespace-pre-wrap break-words text-sm text-navy-900 ${className}`}>{content}</div>}>
      <SafeMarkdownChunk content={content} className={className} />
    </Suspense>
  )
}
