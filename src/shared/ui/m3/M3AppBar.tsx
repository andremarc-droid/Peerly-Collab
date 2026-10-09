import { ArrowLeft } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

interface M3AppBarProps {
  /** Where the back button goes. Leave it out on screens that have nowhere to go back to. */
  backTo?: string
  /** Large title shown under the toolbar, like Material's large top app bar. It is the page's h1. */
  title: string
  /** Moves focus to the title when the screen opens, so screen readers announce the new screen. */
  focusTitle?: boolean
}

export function M3AppBar({ backTo, title, focusTitle = false }: M3AppBarProps) {
  const titleRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (focusTitle) titleRef.current?.focus({ preventScroll: true })
  }, [focusTitle])

  return (
    <header>
      <div className="flex h-16 items-center px-2">
        {backTo && (
          <Link
            to={backTo}
            aria-label="Back"
            className="m3-press m3-press--icon inline-flex size-12 items-center justify-center rounded-full text-navy-900"
          >
            <ArrowLeft size={24} aria-hidden="true" />
          </Link>
        )}
      </div>
      <h1
        ref={titleRef}
        tabIndex={-1}
        className="m3-title m-0 px-6 pb-6 pt-2 font-heading text-[2rem] font-bold leading-10 text-navy-900"
      >
        {title}
      </h1>
    </header>
  )
}
