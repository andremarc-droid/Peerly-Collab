import { Trash2 } from 'lucide-react'
import type { ChatThread } from '../types'

interface ThreadListProps {
  threads: ChatThread[]
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (thread: ChatThread) => void
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function ThreadList({ threads, activeId, onSelect, onDelete }: ThreadListProps) {
  return (
    <nav aria-label="Chat history">
      <ul className="m-0 grid list-none gap-1 p-0">
        {threads.map((thread) => {
          const active = thread.id === activeId
          return (
            <li key={thread.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelect(thread.id)}
                aria-current={active ? 'true' : undefined}
                className={`grid min-h-11 min-w-0 flex-1 gap-0.5 rounded-2xl px-3 py-2 text-left ${
                  active ? 'bg-navy-900 text-white' : 'text-navy-900 hover:bg-navy-700-07'
                }`}
              >
                <span className="truncate font-semibold">{thread.title}</span>
                <span className={`text-sm ${active ? 'text-white-72' : 'text-navy-800-72'}`}>
                  {formatDate(thread.updatedAt)}
                  {thread.messages.length > 0 ? ` · ${thread.messages.length} messages` : ''}
                  {thread.sharedRole && thread.sharedRole !== 'owner'
                    ? ` · Shared ${thread.sharedRole === 'editor' ? 'editor' : 'view only'}`
                    : thread.sharedRole === 'owner' ? ' · Shared by you' : ''}
                </span>
              </button>
              {thread.messages.length > 0 && !thread.sharedRole && (
                <button
                  type="button"
                  onClick={() => onDelete(thread)}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl text-navy-800 hover:bg-navy-700-07 hover:text-navy-900"
                  aria-label={`Delete chat "${thread.title}"`}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
