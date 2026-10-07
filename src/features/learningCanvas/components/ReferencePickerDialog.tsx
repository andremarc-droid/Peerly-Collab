import { useState, useMemo } from 'react'
import { Search, BookOpen, HelpCircle, Network, Sparkles } from 'lucide-react'
import { Dialog } from '../../../shared/ui/Dialog'
import { Button } from '../../../shared/ui/Button'
import type { LearningCanvasRefType } from '../types'
import type { ResolvedReferenceInfo } from './ReferenceCard'

interface ReferencePickerDialogProps {
  open: boolean
  onClose: () => void
  onSelect: (refType: LearningCanvasRefType, refId: string) => void
  items: ResolvedReferenceInfo[]
}

type FilterType = 'all' | 'module' | 'quiz' | 'learning'

export function ReferencePickerDialog({
  open,
  onClose,
  onSelect,
  items,
}: ReferencePickerDialogProps) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (!item.available) return false
      if (filter !== 'all' && item.type !== filter) return false
      if (search.trim()) {
        const query = search.toLowerCase()
        return item.title.toLowerCase().includes(query)
      }
      return true
    })
  }, [items, filter, search])

  const renderIcon = (item: ResolvedReferenceInfo) => {
    if (item.type === 'module') return <BookOpen size={16} aria-hidden="true" />
    if (item.type === 'learning') return <Sparkles size={16} aria-hidden="true" />
    if (item.isCanvasActivity) return <Network size={16} aria-hidden="true" />
    return <HelpCircle size={16} aria-hidden="true" />
  }

  const getTypeLabel = (item: ResolvedReferenceInfo) => {
    if (item.type === 'module') return 'Module'
    if (item.type === 'learning') return 'Learning canvas'
    if (item.isCanvasActivity) return 'Canvas activity'
    return 'Quiz'
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Reference classroom material"
      description="Connect this card to a module, quiz, canvas activity, or study board in this class."
      className="max-w-lg"
    >
      <div className="grid gap-3">
        {/* Search Input */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-800-72" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search class materials…"
            aria-label="Search materials"
            className="w-full pl-9 pr-3 py-2 text-sm text-navy-900 bg-white border border-navy-900-20 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-800"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Filter by material type">
          {(['all', 'module', 'quiz', 'learning'] as FilterType[]).map((f) => {
            const isSelected = filter === f
            const label =
              f === 'all'
                ? 'All materials'
                : f === 'module'
                ? 'Modules'
                : f === 'quiz'
                ? 'Quizzes & Activities'
                : 'Learning canvases'
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-navy-800 ${
                  isSelected
                    ? 'bg-navy-900 text-white'
                    : 'bg-navy-900-8 text-navy-900 hover:bg-navy-900-12'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Results List */}
        <div className="max-h-64 overflow-y-auto grid gap-2 pr-1" role="listbox" aria-label="Matching materials">
          {filteredItems.length === 0 ? (
            <div className="p-6 text-center text-sm text-navy-800-72">
              No matching classroom materials found.
            </div>
          ) : (
            filteredItems.map((item) => (
              <div
                key={`${item.type}:${item.id}`}
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-navy-900-12 hover:border-navy-800 bg-white hover:bg-navy-900-5 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="p-1.5 rounded-lg bg-navy-900-8 text-navy-900 shrink-0">
                    {renderIcon(item)}
                  </span>
                  <div className="min-w-0">
                    <h5 className="text-sm font-semibold text-navy-900 truncate m-0">
                      {item.title}
                    </h5>
                    <span className="text-xs text-navy-800-72 font-medium">
                      {getTypeLabel(item)}
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    onSelect(item.type, item.id)
                    onClose()
                  }}
                >
                  Select
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end pt-2 border-t border-navy-900-8">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
