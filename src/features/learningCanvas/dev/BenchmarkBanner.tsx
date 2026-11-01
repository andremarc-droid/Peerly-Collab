import type { SeedBoardSize } from './seedBoard'

interface BenchmarkBannerProps {
  currentSize: SeedBoardSize | null
  onSelectSize: (size: SeedBoardSize | null) => void
}

export function BenchmarkBanner({ currentSize, onSelectSize }: BenchmarkBannerProps) {
  return (
    <aside
      aria-label="Benchmark Controls"
      className="bg-navy-900 text-white px-3 py-2 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs border border-navy-700 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <span className="font-semibold uppercase tracking-wider text-white">Dev Benchmark</span>
        <span className="text-white/80">
          {currentSize ? `Seeded board (${currentSize} cards, in-memory)` : 'Real Firestore data'}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onSelectSize(50)}
          className={`px-2 py-1 rounded text-xs font-medium transition ${
            currentSize === 50 ? 'bg-white text-navy-900 font-bold' : 'bg-navy-800 text-white hover:bg-navy-700'
          }`}
        >
          50 cards
        </button>
        <button
          type="button"
          onClick={() => onSelectSize(150)}
          className={`px-2 py-1 rounded text-xs font-medium transition ${
            currentSize === 150 ? 'bg-white text-navy-900 font-bold' : 'bg-navy-800 text-white hover:bg-navy-700'
          }`}
        >
          150 cards
        </button>
        <button
          type="button"
          onClick={() => onSelectSize(400)}
          className={`px-2 py-1 rounded text-xs font-medium transition ${
            currentSize === 400 ? 'bg-white text-navy-900 font-bold' : 'bg-navy-800 text-white hover:bg-navy-700'
          }`}
        >
          400 cards
        </button>
        {currentSize !== null && (
          <button
            type="button"
            onClick={() => onSelectSize(null)}
            className="px-2 py-1 rounded text-xs font-medium bg-white/10 text-white hover:bg-white/20 ml-1"
          >
            Reset
          </button>
        )}
      </div>
    </aside>
  )
}

