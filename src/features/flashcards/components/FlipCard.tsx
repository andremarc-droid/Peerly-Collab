interface FlipCardProps {
  front: string
  back: string
  flipped: boolean
  onFlip: () => void
}

const FACE =
  'col-start-1 row-start-1 flex min-h-[240px] flex-col justify-center gap-3 rounded-3xl border border-navy-900-15 p-6 shadow-md backface-hidden'

export function FlipCard({ front, back, flipped, onFlip }: FlipCardProps) {
  return (
    <div className="perspective-distant">
      <button
        type="button"
        onClick={onFlip}
        className="block w-full rounded-3xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-800 focus-visible:ring-offset-2"
      >
        <span
          className={`grid transform-3d transition-transform duration-500 motion-reduce:transition-none ${
            flipped ? 'rotate-y-180' : ''
          }`}
        >
          <span aria-hidden={flipped} className={`${FACE} bg-white`}>
            <span className="text-sm font-bold uppercase tracking-wide text-navy-800">
              Question
            </span>
            <span className="whitespace-pre-wrap break-words text-xl font-semibold text-navy-900">
              {front}
            </span>
            <span className="text-sm text-navy-800">Select the card to reveal the answer</span>
          </span>
          <span aria-hidden={!flipped} className={`${FACE} rotate-y-180 bg-navy-900-05`}>
            <span className="text-sm font-bold uppercase tracking-wide text-navy-800">Answer</span>
            <span className="whitespace-pre-wrap break-words text-xl font-semibold text-navy-900">
              {back}
            </span>
            <span className="text-sm text-navy-800">Select the card to see the question again</span>
          </span>
        </span>
      </button>
    </div>
  )
}
