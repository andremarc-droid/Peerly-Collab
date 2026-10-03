import { Search } from 'lucide-react'
import { Input } from './Input'
import type { ReactNode } from 'react'

interface ToolbarProps {
  query: string
  onQueryChange: (query: string) => void
  filters?: ReactNode
  placeholder?: string
}

export function Toolbar({ query, onQueryChange, filters, placeholder = 'Search' }: ToolbarProps) {
  return <div className="toolbar"><div className="toolbar__search"><Search size={18} aria-hidden="true" /><Input label="Search items" name="search-items" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={placeholder} /></div>{filters && <div className="toolbar__filters">{filters}</div>}</div>
}
