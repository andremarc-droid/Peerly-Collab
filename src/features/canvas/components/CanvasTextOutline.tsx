import { Check, Copy, ExternalLink, Search, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Button } from '../../../shared/ui/Button'
import { parseConnectionEdge } from '../schemas'
import { safeHttpsUrl } from '../safeUrl'
import type { CanvasCard, CanvasConnection } from '../types'

export interface CanvasTextOutlineProps {
  cards: CanvasCard[]
  connections: (CanvasConnection | string)[]
  directed?: boolean
  selectedCardId?: string | null
  onSelectCard?: (cardId: string | null) => void
  className?: string
  /**
   * Whether the outline starts open. When omitted it is open on screens 1024px
   * and wider, closed below that, and open when matchMedia is unavailable.
   */
  defaultOpen?: boolean
}

function initialOpen(defaultOpen?: boolean): boolean {
  if (typeof defaultOpen === 'boolean') return defaultOpen
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia('(min-width: 1024px)').matches
}

export function CanvasTextOutline({
  cards = [],
  connections = [],
  directed = false,
  selectedCardId,
  onSelectCard,
  className = '',
  defaultOpen,
}: CanvasTextOutlineProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(() => initialOpen(defaultOpen))

  // Map card titles for easy connection rendering
  const cardMap = useMemo(() => {
    const map = new Map<string, CanvasCard>()
    cards.forEach((c) => map.set(c.id, c))
    return map
  }, [cards])

  const getCardName = useCallback(
    (id: string) => {
      const card = cardMap.get(id)
      if (!card) return id
      return card.title?.trim() || card.content.slice(0, 30) || id
    },
    [cardMap],
  )

  // Parse connection objects/strings into structured pairs
  const parsedConnections = useMemo(() => {
    return connections
      .map((conn) => {
        if (typeof conn === 'string') {
          const parsed = parseConnectionEdge(conn)
          if (!parsed) return null
          return { from: parsed.from, to: parsed.to, original: conn }
        }
        return { from: conn.from, to: conn.to, original: conn.id }
      })
      .filter((c): c is { from: string; to: string; original: string } => c !== null)
  }, [connections])

  // Filter cards and connections by query
  const q = searchQuery.trim().toLowerCase()
  const filteredCards = useMemo(() => {
    if (!q) return cards
    return cards.filter(
      (c) =>
        (c.title && c.title.toLowerCase().includes(q)) ||
        c.content.toLowerCase().includes(q) ||
        (c.url && c.url.toLowerCase().includes(q)),
    )
  }, [cards, q])

  const filteredConnections = useMemo(() => {
    if (!q) return parsedConnections
    return parsedConnections.filter((conn) => {
      const fromName = getCardName(conn.from).toLowerCase()
      const toName = getCardName(conn.to).toLowerCase()
      return fromName.includes(q) || toName.includes(q)
    })
  }, [parsedConnections, q, getCardName])

  // Copy plain text outline to clipboard
  const handleCopyOutline = async () => {
    const lines: string[] = ['=== BOARD OUTLINE ===', '', '## Cards:']
    cards.forEach((c, idx) => {
      const title = c.title ? ` [${c.title}]` : ''
      lines.push(`${idx + 1}. (${c.type})${title}: ${c.content || 'No content'}`)
      if (c.type === 'link' && c.url) {
        lines.push(`   URL: ${c.url}`)
      }
    })

    lines.push('', '## Connections:')
    if (parsedConnections.length === 0) {
      lines.push('No connections.')
    } else {
      parsedConnections.forEach((conn) => {
        const fromName = getCardName(conn.from)
        const toName = getCardName(conn.to)
        lines.push(`- ${fromName} ${directed ? 'to' : 'with'} ${toName}`)
      })
    }

    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  if (!open) {
    return (
      <div className={`w-full lg:w-auto flex items-start ${className}`}>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-label="Show text outline"
          className="min-h-[44px]"
        >
          <span>Show text outline</span>
        </Button>
      </div>
    )
  }

  return (
    <div
      className={`w-full lg:w-[360px] lg:min-w-[360px] bg-white rounded-2xl border border-navy-900-12 p-4 shadow-sm flex flex-col gap-3 h-full overflow-hidden ${className}`}
      aria-label="Text outline panel"
    >
      <div className="flex items-center justify-between gap-2 border-b border-navy-900-12 pb-2">
        <h3 className="m-0 text-base font-semibold text-navy-900">Text outline</h3>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleCopyOutline()}
            className="min-h-[36px] py-1 px-2.5 text-sm"
            aria-label="Copy board outline to clipboard"
          >
            {copied ? (
              <>
                <Check size={14} className="text-feedback-success" aria-hidden="true" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy size={14} aria-hidden="true" />
                <span>Copy</span>
              </>
            )}
          </Button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-expanded={true}
            aria-label="Hide text outline"
            className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-full hover:bg-navy-900-12 text-navy-800 transition-colors"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-800-72 pointer-events-none"
          aria-hidden="true"
        />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search cards and connections…"
          aria-label="Search cards and connections"
          className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-navy-900-12 bg-navy-50 text-navy-900 placeholder:text-navy-800-72 focus:outline-none focus:ring-2 focus:ring-navy-800 focus:bg-white transition-all"
        />
      </div>

      <div className="flex items-center justify-between text-sm font-semibold text-navy-800-72 px-1">
        <span>{filteredCards.length} cards</span>
        <span>·</span>
        <span>{filteredConnections.length} connections</span>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 grid gap-4 min-h-0">
        {/* Cards Section */}
        <div>
          <span className="block text-sm font-bold uppercase tracking-wider text-navy-800-72 mb-2">Cards</span>
          {filteredCards.length === 0 ? (
            <p className="text-sm text-navy-800-72 m-0 p-2">No matching cards</p>
          ) : (
            <div className="grid gap-2">
              {filteredCards.map((card) => {
                const isSelected = selectedCardId === card.id
                const safeUrl = card.type === 'link' ? safeHttpsUrl(card.url) : null
                const hasBlockedUrl = card.type === 'link' && Boolean(card.url) && !safeUrl
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => onSelectCard?.(isSelected ? null : card.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-navy-800 bg-navy-50 ring-2 ring-navy-800'
                        : 'border-navy-900-12 bg-white hover:border-navy-800 hover:bg-navy-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-semibold text-navy-900 truncate">
                        {card.title || `${card.type[0].toUpperCase() + card.type.slice(1)} card`}
                      </span>
                      <span className="text-sm uppercase px-1.5 py-0.5 rounded bg-navy-900-12 text-navy-900 font-bold shrink-0">
                        {card.type}
                      </span>
                    </div>

                    {card.content && (
                      <p className="m-0 text-sm text-navy-800 line-clamp-3 leading-relaxed whitespace-pre-wrap">
                        {card.content}
                      </p>
                    )}

                    {safeUrl && (
                      <a
                        href={safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-navy-900 underline hover:text-navy-700 break-all"
                      >
                        <ExternalLink size={13} aria-hidden="true" />
                        <span className="truncate">{safeUrl}</span>
                      </a>
                    )}

                    {hasBlockedUrl && (
                      <p className="m-0 mt-2 text-sm font-medium text-navy-800 break-all">
                        <span className="font-semibold">Link blocked</span>
                        <span className="text-navy-800-72"> (not a valid https:// address): </span>
                        <span>{card.url}</span>
                      </p>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Connections Section */}
        <div className="border-t border-navy-900-12 pt-3">
          <span className="block text-sm font-bold uppercase tracking-wider text-navy-800-72 mb-2">
            Connections ({directed ? 'Directed' : 'Undirected'})
          </span>
          {filteredConnections.length === 0 ? (
            <p className="text-sm text-navy-800-72 m-0 p-2">No matching connections</p>
          ) : (
            <ul className="grid gap-1.5 p-0 m-0 list-none">
              {filteredConnections.map((conn, idx) => {
                const fromName = getCardName(conn.from)
                const toName = getCardName(conn.to)
                return (
                  <li
                    key={`${conn.original}-${idx}`}
                    className="p-2 rounded-lg bg-navy-50 border border-navy-900-12 text-sm text-navy-900 font-medium"
                  >
                    <span>{fromName}</span>
                    <span className="mx-1.5 text-navy-800-72 font-semibold">
                      {directed ? 'to' : 'with'}
                    </span>
                    <span>{toName}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
