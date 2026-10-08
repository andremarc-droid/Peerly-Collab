import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

interface DropdownMenuProps {
  label: string
  trigger: ReactNode
  children: ReactNode
  className?: string
  /** Render the trigger as a plain icon button (e.g. a three-dot menu) with no pill or chevron. */
  iconOnly?: boolean
}

export function DropdownMenu({ label, trigger, children, className = '', iconOnly = false }: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const menuId = `menu-${useId()}`
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return undefined
    const items = () => rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
    items()[0]?.focus()
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    const activeIndex = items.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const offset = event.key === 'ArrowDown' ? 1 : -1
      items[(activeIndex + offset + items.length) % items.length]?.focus()
    }
    if (event.key === 'Home') { event.preventDefault(); items[0]?.focus() }
    if (event.key === 'End') { event.preventDefault(); items.at(-1)?.focus() }
    if (event.key === 'Tab') setOpen(false)
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target instanceof Element && event.target.closest('[role="menuitem"]')) setOpen(false)
  }

  return (
    <div className={`dropdown-menu ${className}`.trim()} ref={rootRef} onKeyDown={handleKeyDown} onClick={handleClick}>
      <button ref={triggerRef} className={`dropdown-menu__trigger${iconOnly ? ' dropdown-menu__trigger--icon' : ''}`} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen((value) => !value)}>
        {trigger}{!iconOnly && <ChevronDown size={17} aria-hidden="true" />}
      </button>
      {open && <div id={menuId} className="dropdown-menu__panel" role="menu" aria-label={label}>{children}</div>}
    </div>
  )
}
