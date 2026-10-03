import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'

export interface DataTableColumn<T> {
  key: string
  header: string
  cell: (row: T) => ReactNode
  sortValue?: (row: T) => string | number
}
interface DataTableProps<T> {
  label: string
  columns: DataTableColumn<T>[]
  rows: T[]
  getRowId: (row: T) => string
  selectedId?: string
  emptyMessage?: string
}

export function DataTable<T>({ label, columns, rows, getRowId, selectedId, emptyMessage = 'No rows to show.' }: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>(null)
  const sorted = useMemo(() => {
    if (!sort) return rows
    const column = columns.find((item) => item.key === sort.key)
    if (!column?.sortValue) return rows
    return [...rows].sort((left, right) => {
      const a = column.sortValue!(left)
      const b = column.sortValue!(right)
      const compared = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))
      return sort.direction === 'ascending' ? compared : -compared
    })
  }, [columns, rows, sort])
  function toggle(key: string) {
    setSort((current) => current?.key === key ? { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' } : { key, direction: 'ascending' })
  }
  if (!rows.length) return <p className="data-table__empty" role="status">{emptyMessage}</p>
  return <div className="data-table" role="region" aria-label={label} tabIndex={0}>
    <table><caption className="sr-only">{label}</caption><thead><tr>{columns.map((column) => <th key={column.key} scope="col" aria-sort={sort?.key === column.key ? sort.direction : undefined}>{column.sortValue ? <button type="button" className="data-table__sort" onClick={() => toggle(column.key)}>{column.header}<span aria-hidden="true">{sort?.key !== column.key ? <ArrowUpDown size={15} /> : sort.direction === 'ascending' ? <ArrowUp size={15} /> : <ArrowDown size={15} />}</span><span className="sr-only">{sort?.key === column.key ? `, sorted ${sort.direction}` : ', activate to sort'}</span></button> : column.header}</th>)}</tr></thead><tbody>{sorted.map((row) => <tr key={getRowId(row)} data-selected={getRowId(row) === selectedId || undefined}>{columns.map((column) => <td key={column.key} data-label={column.header}>{column.cell(row)}</td>)}</tr>)}</tbody></table>
  </div>
}
