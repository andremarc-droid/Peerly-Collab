import { useEffect, type RefObject } from 'react'

/** After a failed validation, moves focus to the first invalid field inside `containerRef`. `trigger` goes up on every failure. */
export function useFocusFirstInvalid(containerRef: RefObject<HTMLElement | null>, trigger: number) {
  useEffect(() => {
    if (trigger === 0) return
    containerRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [containerRef, trigger])
}
