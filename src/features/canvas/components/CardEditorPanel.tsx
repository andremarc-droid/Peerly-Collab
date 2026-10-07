import { X, Trash2 } from 'lucide-react'
import { Button } from '../../../shared/ui/Button'
import { Input } from '../../../shared/ui/Input'
import { Textarea } from '../../../shared/ui/Textarea'
import { safeHttpsUrl } from '../safeUrl'
import type { CanvasCard } from '../types'

export interface CardEditorPanelProps {
  card: CanvasCard
  onUpdate?: (field: 'title' | 'content' | 'url' | 'alt', value: string) => void
  onDelete?: () => void
  onClose: () => void
  readOnly?: boolean
  className?: string
}

export function CardEditorPanel({
  card,
  onUpdate,
  onDelete,
  onClose,
  readOnly = false,
  className = '',
}: CardEditorPanelProps) {
  const typeLabel = card.type[0].toUpperCase() + card.type.slice(1)
  const isInvalidUrl = Boolean(card.type === 'link' && card.url && !/^https:\/\/[^\s]+$/.test(card.url))

  return (
    <div
      className={`w-full lg:w-[360px] lg:min-w-[360px] bg-white rounded-2xl border border-navy-900-12 p-4 shadow-sm flex flex-col gap-4 ${className}`}
      aria-label={`${typeLabel} card editor`}
    >
      <div className="flex items-center justify-between border-b border-navy-900-12 pb-2">
        <h3 className="text-sm font-semibold text-navy-900 m-0">
          {readOnly ? `${typeLabel} card` : `Edit ${typeLabel} card`}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-full hover:bg-navy-900-12 text-navy-800 transition-colors"
          aria-label="Close card panel"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="grid gap-3">
        {readOnly ? (
          <>
            {card.title && (
              <div>
                <span className="block text-sm font-semibold uppercase tracking-wider text-navy-800-72">Title</span>
                <p className="m-0 text-base font-semibold text-navy-900">{card.title}</p>
              </div>
            )}
            <div>
              <span className="block text-sm font-semibold uppercase tracking-wider text-navy-800-72">Content</span>
              <p className="m-0 text-base text-navy-900 whitespace-pre-wrap break-words">{card.content || '—'}</p>
            </div>
            {card.type === 'link' && card.url && (
              <div>
                <span className="block text-sm font-semibold uppercase tracking-wider text-navy-800-72">Link</span>
                {safeHttpsUrl(card.url) ? (
                  <a
                    href={safeHttpsUrl(card.url) ?? undefined}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-sm text-navy-900 underline break-all font-medium"
                  >
                    {card.url}
                  </a>
                ) : (
                  <p className="m-0 text-sm text-navy-900 break-all font-medium">
                    <span className="font-semibold">Link blocked</span> (not a valid https:// address): {card.url}
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <Input
              label="Title (optional)"
              name="card-title"
              value={card.title ?? ''}
              maxLength={120}
              hint={`${(card.title ?? '').length}/120 characters`}
              onChange={(e) => onUpdate?.('title', e.target.value)}
            />
            <Textarea
              label="Content"
              name="card-content"
              value={card.content}
              maxLength={1000}
              hint={`${card.content.length}/1000 characters`}
              rows={4}
              required
              onChange={(e) => onUpdate?.('content', e.target.value)}
            />
            {card.type === 'link' && (
              <Input
                label="HTTPS link URL"
                name="card-link-url"
                value={card.url ?? ''}
                placeholder="https://"
                hint="Must begin with https://"
                error={isInvalidUrl ? 'URL must begin with https:// and contain no whitespace.' : undefined}
                required
                onChange={(e) => onUpdate?.('url', e.target.value)}
              />
            )}
            {onDelete && (
              <div className="pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="button--destructive w-full"
                  onClick={onDelete}
                >
                  <Trash2 size={15} aria-hidden="true" /> Delete card
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
