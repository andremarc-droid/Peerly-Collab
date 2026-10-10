import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Bot, X } from 'lucide-react'
import { useMobileChrome } from '../../../lib/platform/mobileChromeContext'
import { useTutorFocus } from '../tutorFocusContext'

interface TutorDockProps {
  /** The tutor itself. It stays mounted while the panel is closed, so a reply in progress is never lost. */
  children: ReactNode
  /** Open the panel on first render, e.g. when arriving from a shared-conversation link. */
  defaultOpen?: boolean
}

const PANEL_ID = 'tutor-dock-panel'

const FLOATING_PANEL =
  'fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-40 flex h-[min(85dvh,46rem)] flex-col overflow-hidden rounded-3xl border border-navy-900-12 bg-white shadow-lg overscroll-contain ' +
  'sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[min(42rem,calc(100dvh-8rem))] sm:w-[26rem]'

const FLOATING_BUTTON =
  'fixed right-4 z-40 inline-flex min-h-14 min-w-14 cursor-pointer items-center justify-center gap-2 rounded-full border-0 bg-navy-900 px-4 text-base font-bold text-white shadow-lg ' +
  'hover:bg-navy-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-800 motion-reduce:transition-none sm:right-6 sm:px-5'

/** Corner position on screens without the phone bottom bar. */
const BUTTON_CORNER = 'bottom-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-6'
/** Phone tab screens have a bottom navigation bar (about 4rem tall); sit above it instead of covering its tabs. */
const BUTTON_ABOVE_NAV = 'bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)]'

/**
 * The AI tutor, available on every Learning tab through a floating button at the bottom-right.
 * The button opens the tutor in a panel: a bottom sheet on phones and a 26rem window from the corner on larger
 * screens. The tutor is mounted once and only hidden while closed, so chats and in-flight replies persist.
 */
export function TutorDock({ children, defaultOpen = false }: TutorDockProps) {
  const [open, setOpen] = useState(defaultOpen)
  // On phone tab screens the bottom navigation bar is showing, so the button must sit above it.
  const aboveNav = useMobileChrome()?.tabRoot === true
  // Opens when a deck or lesson screen asks the tutor about what the learner is studying.
  const openRequest = useTutorFocus()?.openRequest ?? 0
  useEffect(() => {
    if (openRequest > 0) setOpen(true)
  }, [openRequest])
  const panelRef = useRef<HTMLElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)

  // Move focus into the panel when it opens and back to the button when it closes.
  useEffect(() => {
    if (open) {
      wasOpen.current = true
      closeRef.current?.focus()
    } else if (wasOpen.current) {
      wasOpen.current = false
      buttonRef.current?.focus()
    }
  }, [open])

  // Escape closes the panel, unless a dialog or the chat drawer inside it is open (those close first).
  useEffect(() => {
    if (!open) return undefined
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (panelRef.current?.querySelector('[aria-modal="true"]')) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  // On phones the sheet covers most of the screen, so keep the page behind it from scrolling.
  useEffect(() => {
    if (!open || !window.matchMedia?.('(max-width: 639px)')?.matches) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  // Rendered into <body>, not in place. The page container plays a zoom-and-fade entrance animation (m3-enter), and
  // a `position: fixed` child of an element with a transform is positioned against that element instead of the
  // screen. That left the button at the very end of the page content, so it only showed after scrolling down.
  return createPortal(
    <>
      <section
        ref={panelRef}
        id={PANEL_ID}
        aria-label="AI tutor"
        hidden={!open}
        role={open ? 'dialog' : undefined}
        aria-modal={open ? false : undefined}
        className={open ? FLOATING_PANEL : undefined}
      >
        {open && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-navy-900-12 px-3 py-2">
            <span className="inline-flex items-center gap-2 text-base font-bold text-navy-900">
              <span className="inline-flex size-9 items-center justify-center rounded-2xl bg-navy-900 text-white" aria-hidden="true">
                <Bot size={18} />
              </span>
              AI Tutor
            </span>
            <button ref={closeRef} type="button" className="tutor-header-btn" aria-label="Close AI tutor" onClick={() => setOpen(false)}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        )}
        <div className={open ? 'relative min-h-0 flex-1' : undefined}>{children}</div>
      </section>

      {!open && (
        <button
          ref={buttonRef}
          type="button"
          className={`${FLOATING_BUTTON} ${aboveNav ? BUTTON_ABOVE_NAV : BUTTON_CORNER}`}
          aria-label="Open AI tutor"
          aria-expanded={false}
          aria-controls={PANEL_ID}
          onClick={() => setOpen(true)}
        >
          <Bot size={24} aria-hidden="true" />
          <span className="hidden sm:inline">AI Tutor</span>
        </button>
      )}
    </>,
    document.body,
  )
}
