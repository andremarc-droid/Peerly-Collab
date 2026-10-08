import { useState } from 'react'
import { ChevronDown, Users } from 'lucide-react'
import { GraphSharingPanel } from './GraphSharingPanel'

interface GraphCollabSidebarProps {
  classId: string
  graphId: string
  uid: string
  name: string
  ownerId: string
  ownerName: string
  owner: boolean
}

/**
 * Right-hand sidebar for collaborators, invite codes and activity history.
 * It is a sibling of the graph canvas (never a child), so it can't overlap or
 * squash the graph. On screens below `lg` it stacks under the graph and is
 * collapsed behind a disclosure button; the panel stays mounted so presence
 * heartbeats keep running.
 */
export function GraphCollabSidebar(props: GraphCollabSidebarProps) {
  const [open, setOpen] = useState(false)
  const panelId = 'graph-collab-panel'

  return (
    <aside
      aria-label="Graph collaborators and activity"
      className="grid gap-2 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto"
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-navy-900-30 bg-white px-4 text-sm font-semibold text-navy-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-800 lg:hidden"
      >
        <span className="inline-flex items-center gap-2">
          <Users size={16} aria-hidden="true" />
          Collaborators &amp; activity
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={open ? 'rotate-180 transition-transform' : 'transition-transform'}
        />
      </button>
      <div id={panelId} className={open ? 'block' : 'hidden lg:block'}>
        <GraphSharingPanel {...props} />
      </div>
    </aside>
  )
}
