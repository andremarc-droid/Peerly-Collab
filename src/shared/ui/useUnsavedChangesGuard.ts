import { useCallback, useEffect } from 'react'
import { useBeforeUnload } from 'react-router-dom'

/**
 * Shared unsaved-changes guard hook.
 *
 * Covers:
 * 1. window beforeunload event (tab close, page refresh, external navigation).
 * 2. Capture-phase click listener on in-app <a href> links (navbar, Back-to-class link, breadcrumbs).
 * 3. Popstate event listener for browser Back/Forward navigation.
 *
 * Limitation note:
 * React Router's `useBlocker` requires a Data Router (e.g. `createBrowserRouter` + `<RouterProvider>`).
 * Because this application uses `<BrowserRouter>` from react-router-dom v7, `useBlocker` throws at runtime
 * if invoked outside a data router. We listen to `popstate` as a best-effort guard for browser back/forward buttons.
 */
export function useUnsavedChangesGuard(dirty: boolean, message = 'You have unsaved changes. Leave without saving?') {
  // react-router beforeunload hook
  useBeforeUnload(
    useCallback(
      (event) => {
        if (dirty) {
          event.preventDefault()
        }
      },
      [dirty],
    ),
  )

  // Direct window beforeunload listener for environments where useBeforeUnload may not trigger
  useEffect(() => {
    if (!dirty) return
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty])

  // Capture-phase link click guard for in-app anchor elements
  useEffect(() => {
    if (!dirty) return
    function guardLinkNavigation(event: MouseEvent) {
      if (event.defaultPrevented) return
      const target = event.target
      if (!(target instanceof Element)) return
      const link = target.closest('a[href]')
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === '_blank' ||
        link.hasAttribute('download') ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }

      if (!window.confirm(message)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    document.addEventListener('click', guardLinkNavigation, true)
    return () => document.removeEventListener('click', guardLinkNavigation, true)
  }, [dirty, message])

  // Browser back/forward button (popstate) guard
  useEffect(() => {
    if (!dirty) return
    function handlePopState() {
      if (!window.confirm(message)) {
        // Revert back navigation by pushing current location
        window.history.pushState(null, '', window.location.href)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [dirty, message])
}
