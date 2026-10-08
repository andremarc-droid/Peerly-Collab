import { RotateCcw, TriangleAlert } from 'lucide-react'
import { Button } from '../../../shared/ui/Button'
import { toDataUrl } from '../../canvas/imageProcessing'
import { DocumentChips } from '../../documents'
import { SafeMarkdown } from '../../learningCanvas/components/SafeMarkdown'
import type { ChatMessage } from '../types'
import { plainMath } from '../plainMath'

interface MessageBubbleProps {
  message: ChatMessage
  /** Show the Retry button (only for the newest failed message). */
  canRetry: boolean
  onRetry: () => void
}

export function MessageBubble({ message, canRetry, onRetry }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <li className={`flex min-w-0 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-3xl px-3 py-2.5 sm:px-4 sm:py-3 ${
          isUser
            ? 'max-w-[88%] bg-navy-900 text-white sm:max-w-[min(100%,42rem)]'
            : 'w-full max-w-full border border-navy-900-12 bg-white text-navy-900 shadow-sm sm:w-auto sm:max-w-[min(100%,42rem)]'
        }`}
      >
        <span className="sr-only">{isUser ? 'You said:' : 'Tutor replied:'}</span>

        {message.images.length > 0 && (
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Attached images">
            {message.images.map((image) => (
              <li key={image.id}>
                <img
                  src={toDataUrl(image.mimeType, image.data)}
                  alt={image.name}
                  width={image.width}
                  height={image.height}
                  loading="lazy"
                  className="h-auto max-h-48 w-auto max-w-full rounded-2xl border border-navy-900-12 bg-white"
                />
              </li>
            ))}
          </ul>
        )}

        {isUser && message.documents && message.documents.length > 0 && (
          <DocumentChips documents={message.documents} label="Attached documents" onNavy />
        )}

        {message.text &&
          (isUser ? (
            <p className="m-0 whitespace-pre-wrap break-words">{message.text}</p>
          ) : (
            <SafeMarkdown
              content={plainMath(message.text)}
              className="min-w-0 break-words [&_img]:max-w-full [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto"
            />
          ))}

        {message.failed && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <TriangleAlert size={16} aria-hidden="true" />
            <span className="font-semibold">Not answered</span>
            {canRetry && (
              <Button type="button" variant="secondary" surface="navy" onClick={onRetry}>
                <RotateCcw size={16} aria-hidden="true" />
                <span>Retry</span>
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  )
}
