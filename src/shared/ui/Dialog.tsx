import { useEffect, useId, useRef, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { BookOpenText, X } from 'lucide-react'
import { Button } from './Button'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  labelledBy?: string
  className?: string
}

const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

export function Dialog({ open, onClose, title, description, children, labelledBy, className = '' }: DialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const backdropRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleLabel = labelledBy ?? titleId

  useEffect(() => {
    if (!open) return undefined
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const firstControl = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)
    ;(firstControl ?? dialogRef.current)?.focus({ preventScroll: true })
    return () => {
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [open])

  // Track the part of the screen that is actually visible. When the on-screen keyboard opens it covers the bottom of
  // the page without resizing it, so the phone layout reads these two values (--vv-height, --vv-top) to keep the whole
  // dialog above the keyboard instead of leaving the next field hidden behind it.
  useEffect(() => {
    if (!open) return undefined
    const viewport = window.visualViewport
    const backdrop = backdropRef.current
    if (!viewport || !backdrop) return undefined
    const sync = () => {
      backdrop.style.setProperty('--vv-height', `${viewport.height}px`)
      backdrop.style.setProperty('--vv-top', `${viewport.offsetTop}px`)
    }
    sync()
    viewport.addEventListener('resize', sync)
    viewport.addEventListener('scroll', sync)
    return () => {
      viewport.removeEventListener('resize', sync)
      viewport.removeEventListener('scroll', sync)
    }
  }, [open])

  // Keep the field being typed in on screen. The short delay lets the keyboard finish opening before scrolling.
  function handleFocus(event: FocusEvent<HTMLDivElement>) {
    const target = event.target
    if (!(target instanceof HTMLElement) || !target.matches('input, textarea, select')) return
    window.setTimeout(() => {
      if (target.isConnected) target.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    }, 300)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (event.key !== 'Tab') return
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    const first = focusable[0]
    const last = focusable.at(-1)
    if (!first || !last) { event.preventDefault(); dialogRef.current?.focus(); return }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  if (!open) return null
  // Rendered into <body>, not in place. A phone screen plays a zoom-and-fade entrance animation on the page container,
  // and a `position: fixed` child of a transformed element is placed against that element instead of the screen.
  return createPortal(
    <div ref={backdropRef} className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={dialogRef} className={`dialog ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleLabel} aria-describedby={description ? descriptionId : undefined} tabIndex={-1} onKeyDown={handleKeyDown} onFocus={handleFocus}>
        <header className="dialog__header">
          <div className="dialog__heading"><span className="dialog__icon" aria-hidden="true"><BookOpenText size={21} /></span><div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div></div>
          <Button type="button" variant="ghost" className="dialog__close" aria-label="Close dialog" onClick={onClose}><X size={20} aria-hidden="true" /></Button>
        </header>
        <div className="dialog__content">{children}</div>
      </section>
    </div>,
    document.body,
  )
}
