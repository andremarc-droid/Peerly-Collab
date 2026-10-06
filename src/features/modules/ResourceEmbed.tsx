import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Skeleton } from '../../shared/ui/Skeleton'
import { isEmbeddableHost } from './links'

interface ResourceEmbedProps {
  src: string
  fallbackUrl: string
  title: string
  fallbackLabel?: string
  fallbackMessage?: string
}

export function ResourceEmbed({
  src,
  fallbackUrl,
  title,
  fallbackLabel = 'Open in new tab',
  fallbackMessage,
}: ResourceEmbedProps) {
  const [loaded, setLoaded] = useState(false)
  const embeddable = isEmbeddableHost(src)
  return (
    <div className="resource-embed">
      {embeddable ? (
        <div className="resource-embed__frame">
          {!loaded && <Skeleton className="resource-embed__skeleton" label={`Loading preview: ${title}`} />}
          <iframe
            src={src}
            title={title}
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => setLoaded(true)}
          />
        </div>
      ) : (
        <p className="resource-embed__blocked">This link opens in a new tab and cannot be embedded.</p>
      )}
      <div className="resource-embed__footer">
        <a
          className="resource-embed__fallback"
          href={fallbackUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={15} aria-hidden="true" />
          {fallbackLabel}
        </a>
        {fallbackMessage && (
          <p className="resource-embed__fallback-message">
            {fallbackMessage}
          </p>
        )}
      </div>
    </div>
  )
}
