import type { LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'

export interface M3NavItem {
  to: string
  label: string
  Icon: LucideIcon
  end?: boolean
}

/** Material 3 navigation bar: icon + 14px label, selected pill on a light tint (never navy on navy). */
export function M3NavBar({ items, label }: { items: M3NavItem[]; label: string }) {
  return (
    <nav
      aria-label={label}
      className={`m3-nav sticky bottom-0 z-30 mt-auto grid border-t border-navy-900-12 bg-white pb-[env(safe-area-inset-bottom)] ${
        items.length === 4 ? 'grid-cols-4' : 'grid-cols-3'
      }`}
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `m3-press m3-press--icon mx-1 my-2 flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl px-2 no-underline ${
              isActive ? 'bg-navy-700-07 text-navy-900' : 'text-navy-800-72'
            }`
          }
        >
          <item.Icon size={24} aria-hidden="true" />
          <span className="text-sm font-semibold leading-none">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
