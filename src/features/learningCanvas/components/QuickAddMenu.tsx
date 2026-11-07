import { FileText, Globe, BookOpen, Layers, X, Image as ImageIcon } from 'lucide-react'
import type { LearningCanvasNodeType } from '../types'

interface QuickAddMenuProps {
  position: { x: number; y: number }
  onSelect: (type: LearningCanvasNodeType) => void
  onClose: () => void
}

export function QuickAddMenu({ position, onSelect, onClose }: QuickAddMenuProps) {
  return (
    <div
      role="menu"
      aria-label="Quick add connected card"
      className="fixed z-50 bg-white border border-navy-900-12 rounded-2xl shadow-xl p-2 w-52 grid gap-1 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      data-testid="quick-add-menu"
    >
      <div className="flex items-center justify-between px-2 py-1 border-b border-navy-900-8 text-xs font-bold text-navy-900">
        <span>Connect new card</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="p-1 rounded text-navy-800 hover:bg-navy-900-8"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      <button
        type="button"
        role="menuitem"
        onClick={() => onSelect('text')}
        className="flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold text-navy-900 rounded-xl hover:bg-navy-900-5 focus:outline-none focus:ring-2 focus:ring-navy-800 text-left transition-colors"
      >
        <span className="p-1.5 rounded-lg bg-navy-900-8 text-navy-900 shrink-0">
          <FileText size={15} aria-hidden="true" />
        </span>
        <div>
          <div className="font-bold">Text card</div>
          <div className="text-[10px] text-navy-800-72 font-normal">Markdown note</div>
        </div>
      </button>

      <button
        type="button"
        role="menuitem"
        onClick={() => onSelect('link')}
        className="flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold text-navy-900 rounded-xl hover:bg-navy-900-5 focus:outline-none focus:ring-2 focus:ring-navy-800 text-left transition-colors"
      >
        <span className="p-1.5 rounded-lg bg-navy-900-8 text-navy-900 shrink-0">
          <Globe size={15} aria-hidden="true" />
        </span>
        <div>
          <div className="font-bold">Web link</div>
          <div className="text-[10px] text-navy-800-72 font-normal">HTTPS URL & note</div>
        </div>
      </button>

      <button
        type="button"
        role="menuitem"
        onClick={() => onSelect('reference')}
        className="flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold text-navy-900 rounded-xl hover:bg-navy-900-5 focus:outline-none focus:ring-2 focus:ring-navy-800 text-left transition-colors"
      >
        <span className="p-1.5 rounded-lg bg-navy-900-8 text-navy-900 shrink-0">
          <BookOpen size={15} aria-hidden="true" />
        </span>
        <div>
          <div className="font-bold">Class reference</div>
          <div className="text-[10px] text-navy-800-72 font-normal">Module or quiz</div>
        </div>
      </button>

      <button
        type="button"
        role="menuitem"
        onClick={() => onSelect('image')}
        className="flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold text-navy-900 rounded-xl hover:bg-navy-900-5 focus:outline-none focus:ring-2 focus:ring-navy-800 text-left transition-colors"
      >
        <span className="p-1.5 rounded-lg bg-navy-900-8 text-navy-900 shrink-0">
          <ImageIcon size={15} aria-hidden="true" />
        </span>
        <div>
          <div className="font-bold">Image card</div>
          <div className="text-[10px] text-navy-800-72 font-normal">Visual photo or diagram</div>
        </div>
      </button>

      <button
        type="button"
        role="menuitem"
        onClick={() => onSelect('group')}
        className="flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold text-navy-900 rounded-xl hover:bg-navy-900-5 focus:outline-none focus:ring-2 focus:ring-navy-800 text-left transition-colors"
      >
        <span className="p-1.5 rounded-lg bg-navy-900-8 text-navy-900 shrink-0">
          <Layers size={15} aria-hidden="true" />
        </span>
        <div>
          <div className="font-bold">Group</div>
          <div className="text-[10px] text-navy-800-72 font-normal">Container box</div>
        </div>
      </button>
    </div>
  )
}
