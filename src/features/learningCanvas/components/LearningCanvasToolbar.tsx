import { useRef } from 'react'
import {
  FileText,
  Globe,
  BookOpen,
  Layers,
  Grid,
  Undo2,
  Redo2,
  ListTree,
  Search,
  Download,
  Upload,
  HelpCircle,
  Copy,
  Link2,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Image as ImageIcon,
} from 'lucide-react'
import { Button } from '../../../shared/ui/Button'
import type { LearningCanvasNodeType } from '../types'

export type AutosaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'

interface LearningCanvasToolbarProps {
  readOnly?: boolean
  canEditStatus?: boolean
  status?: 'draft' | 'published'
  autosaveStatus: AutosaveStatus
  snapToGrid: boolean
  canUndo: boolean
  canRedo: boolean
  isOutlineOpen: boolean
  searchQuery: string
  searchMatchCount: number
  searchMatchIndex: number
  onToggleSnapToGrid: () => void
  onUndo: () => void
  onRedo: () => void
  onToggleOutline: () => void
  onSearchChange: (q: string) => void
  onSearchNext: () => void
  onSearchPrev: () => void
  onAddCard: (type: LearningCanvasNodeType) => void
  onAddImageFile?: (file: File) => void
  onOpenConnectDialog?: () => void
  onExport: () => void
  onImportFile: (file: File) => void
  onOpenHelp: () => void
  onToggleStatus?: () => void
  onRetrySave?: () => void
  onCopyToMyCanvases?: () => void
}

export function LearningCanvasToolbar({
  readOnly = false,
  canEditStatus = false,
  status = 'draft',
  autosaveStatus,
  snapToGrid,
  canUndo,
  canRedo,
  isOutlineOpen,
  searchQuery,
  searchMatchCount,
  searchMatchIndex,
  onToggleSnapToGrid,
  onUndo,
  onRedo,
  onToggleOutline,
  onSearchChange,
  onSearchNext,
  onSearchPrev,
  onAddCard,
  onAddImageFile,
  onOpenConnectDialog,
  onExport,
  onImportFile,
  onOpenHelp,
  onToggleStatus,
  onRetrySave,
  onCopyToMyCanvases,
}: LearningCanvasToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageFileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onImportFile(file)
      e.target.value = ''
    }
  }

  return (
    <div
      role="toolbar"
      aria-label="Learning canvas whiteboard tools"
      className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-2xl bg-white border border-navy-900-12 shadow-sm w-full"
    >
      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".canvas,.json"
        className="hidden"
        onChange={handleFileChange}
        aria-label="Upload canvas file"
      />

      {/* Hidden file input for image upload */}
      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            onAddImageFile?.(file)
            e.target.value = ''
          }
        }}
        aria-label="Upload image card"
      />

      {/* Left tool group: Card Creation (if not readOnly) */}
      <div className="flex flex-wrap items-center gap-1">
        {!readOnly ? (
          <>
            <button
              type="button"
              onClick={() => onAddCard('text')}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-2 text-xs font-bold text-navy-900 rounded-xl hover:bg-navy-900-5 focus:outline-none focus:ring-2 focus:ring-navy-800"
              title="Add text card (N)"
            >
              <FileText size={16} aria-hidden="true" />
              <span>Text</span>
            </button>
            <button
              type="button"
              onClick={() => onAddCard('link')}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-2 text-xs font-bold text-navy-900 rounded-xl hover:bg-navy-900-5 focus:outline-none focus:ring-2 focus:ring-navy-800"
              title="Add web link"
            >
              <Globe size={16} aria-hidden="true" />
              <span>Link</span>
            </button>
            <button
              type="button"
              onClick={() => imageFileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-2 text-xs font-bold text-navy-900 rounded-xl hover:bg-navy-900-5 focus:outline-none focus:ring-2 focus:ring-navy-800"
              title="Upload image card"
            >
              <ImageIcon size={16} aria-hidden="true" />
              <span>Image</span>
            </button>
            <button
              type="button"
              onClick={() => onAddCard('reference')}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-2 text-xs font-bold text-navy-900 rounded-xl hover:bg-navy-900-5 focus:outline-none focus:ring-2 focus:ring-navy-800"
              title="Add reference card"
            >
              <BookOpen size={16} aria-hidden="true" />
              <span>Reference</span>
            </button>
            <button
              type="button"
              onClick={() => onAddCard('group')}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-2 text-xs font-bold text-navy-900 rounded-xl hover:bg-navy-900-5 focus:outline-none focus:ring-2 focus:ring-navy-800"
              title="Add group container (G)"
            >
              <Layers size={16} aria-hidden="true" />
              <span>Group</span>
            </button>

            <span className="h-6 w-px bg-navy-900-12 mx-1" aria-hidden="true" />

            {/* Keyboard Connect button */}
            {onOpenConnectDialog && (
              <button
                type="button"
                onClick={onOpenConnectDialog}
                className="inline-flex items-center gap-1 min-h-[44px] px-2.5 py-2 text-xs font-semibold text-navy-900 rounded-xl hover:bg-navy-900-5 focus:outline-none focus:ring-2 focus:ring-navy-800"
                title="Connect cards (keyboard)"
                aria-label="Connect cards via keyboard"
              >
                <Link2 size={16} aria-hidden="true" />
                <span className="hidden sm:inline">Connect</span>
              </button>
            )}

            {/* Undo / Redo */}
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className="min-h-[44px] min-w-[44px] p-2 text-navy-900 rounded-xl hover:bg-navy-900-5 disabled:opacity-40 disabled:hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-navy-800"
              title="Undo (Ctrl+Z)"
              aria-label="Undo last change"
            >
              <Undo2 size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className="min-h-[44px] min-w-[44px] p-2 text-navy-900 rounded-xl hover:bg-navy-900-5 disabled:opacity-40 disabled:hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-navy-800"
              title="Redo (Ctrl+Shift+Z)"
              aria-label="Redo last change"
            >
              <Redo2 size={16} aria-hidden="true" />
            </button>

            {/* Snap to grid */}
            <button
              type="button"
              onClick={onToggleSnapToGrid}
              className={`min-h-[44px] min-w-[44px] p-2 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-navy-800 ${
                snapToGrid ? 'bg-navy-900 text-white' : 'text-navy-900 hover:bg-navy-900-5'
              }`}
              title={snapToGrid ? 'Snap to 20px grid (enabled)' : 'Snap to 20px grid (disabled)'}
              aria-pressed={snapToGrid}
              aria-label="Toggle snap to grid"
            >
              <Grid size={16} aria-hidden="true" />
            </button>
          </>
        ) : onCopyToMyCanvases ? (
          <Button type="button" onClick={onCopyToMyCanvases}>
            <Copy size={16} aria-hidden="true" />
            <span>Copy to my canvases</span>
          </Button>
        ) : null}

        {/* Outline View toggle */}
        <button
          type="button"
          onClick={onToggleOutline}
          className={`inline-flex items-center gap-1.5 min-h-[44px] px-3 py-2 text-xs font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-navy-800 ${
            isOutlineOpen ? 'bg-navy-900 text-white' : 'text-navy-900 hover:bg-navy-900-5'
          }`}
          title="Toggle text outline view"
          aria-pressed={isOutlineOpen}
        >
          <ListTree size={16} aria-hidden="true" />
          <span>Outline</span>
        </button>
      </div>

      {/* Center Search Input */}
      <div className="flex items-center gap-1.5 min-w-[180px] max-w-[280px] flex-1 sm:flex-initial">
        <div className="relative w-full">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-800-72" aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search cards… (/)"
            aria-label="Search canvas cards"
            className="w-full pl-8 pr-16 py-1.5 text-xs text-navy-900 bg-white border border-navy-900-20 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-800"
          />
          {searchQuery && (
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 text-[10px] text-navy-800-72 font-semibold">
              <span>
                {searchMatchCount > 0 ? `${searchMatchIndex + 1}/${searchMatchCount}` : '0'}
              </span>
              <button
                type="button"
                onClick={onSearchPrev}
                disabled={searchMatchCount === 0}
                aria-label="Previous search match"
                className="p-1 hover:text-navy-900 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={onSearchNext}
                disabled={searchMatchCount === 0}
                aria-label="Next search match"
                className="p-1 hover:text-navy-900 disabled:opacity-30"
              >
                ↓
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right tool group: Save state, status, import/export, help */}
      <div className="flex items-center gap-2">
        {/* Autosave Status */}
        {!readOnly && (
          <div className="flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg">
            {autosaveStatus === 'saving' && (
              <span className="flex items-center gap-1 text-navy-800-72">
                <RefreshCw size={13} className="animate-spin text-navy-800" aria-hidden="true" />
                <span>Saving…</span>
              </span>
            )}
            {autosaveStatus === 'saved' && (
              <span className="flex items-center gap-1 text-feedback-success font-semibold">
                <CheckCircle2 size={13} aria-hidden="true" />
                <span>Saved</span>
              </span>
            )}
            {autosaveStatus === 'unsaved' && (
              <span className="text-navy-800-72">Unsaved changes</span>
            )}
            {autosaveStatus === 'error' && (
              <span className="flex items-center gap-1 text-feedback-error font-semibold">
                <AlertCircle size={13} aria-hidden="true" />
                <span>Failed</span>
                {onRetrySave && (
                  <button
                    type="button"
                    onClick={onRetrySave}
                    className="underline hover:text-navy-900 ml-1"
                  >
                    Retry
                  </button>
                )}
              </span>
            )}
          </div>
        )}

        {/* Draft / Published button (Instructor) */}
        {canEditStatus && onToggleStatus && (
          <button
            type="button"
            onClick={onToggleStatus}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-navy-800 ${
              status === 'published'
                ? 'bg-feedback-success/15 border-feedback-success/30 text-feedback-success'
                : 'bg-navy-900-8 border-navy-900-20 text-navy-900'
            }`}
            title="Click to change publication status"
          >
            {status === 'published' ? 'Published' : 'Draft'}
          </button>
        )}

        {/* Export / Import */}
        <button
          type="button"
          onClick={onExport}
          className="min-h-[44px] min-w-[44px] p-2 text-navy-900 rounded-xl hover:bg-navy-900-5 focus:outline-none focus:ring-2 focus:ring-navy-800"
          title="Export .canvas file"
          aria-label="Export canvas file"
        >
          <Download size={16} aria-hidden="true" />
        </button>

        {!readOnly && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] min-w-[44px] p-2 text-navy-900 rounded-xl hover:bg-navy-900-5 focus:outline-none focus:ring-2 focus:ring-navy-800"
            title="Import .canvas file"
            aria-label="Import canvas file"
          >
            <Upload size={16} aria-hidden="true" />
          </button>
        )}

        {/* Shortcuts Help */}
        <button
          type="button"
          onClick={onOpenHelp}
          className="min-h-[44px] min-w-[44px] p-2 text-navy-900 rounded-xl hover:bg-navy-900-5 focus:outline-none focus:ring-2 focus:ring-navy-800"
          title="Shortcuts help (?)"
          aria-label="Shortcuts and whiteboard help"
        >
          <HelpCircle size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
