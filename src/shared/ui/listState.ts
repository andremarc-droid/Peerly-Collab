/**
 * Shared list-state helper ensuring error and empty states never appear together.
 *
 * Balance rule: Error and empty states never appear together.
 * Precedence order:
 * 1. Loading: Render loading skeleton or spinner
 * 2. Error: Render error alert with retry action
 * 3. Empty: Render empty state
 * 4. Ready: Render data content
 */

export type ListStateStatus = 'loading' | 'error' | 'empty' | 'ready'

export interface ListStateOptions {
  loading: boolean
  error?: unknown
  count: number
}

export function resolveListStatus({
  loading,
  error,
  count,
}: ListStateOptions): ListStateStatus {
  if (loading) return 'loading'
  if (error !== undefined && error !== null && error !== false) return 'error'
  if (count === 0) return 'empty'
  return 'ready'
}
