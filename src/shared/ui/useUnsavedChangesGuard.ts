import { useCallback, useEffect } from 'react'
import { useBeforeUnload } from 'react-router-dom'

/**
 * Shared unsaved-changes guard hook.
 *
 * Covers:
 * 1. window beforeunload event via react-router's `useBeforeUnload` (tab close, page refresh, external navigation).
 * 2. Capture-phase click listener on in-app <a href> links (navbar, Back-to-class link, breadcrumbs).
 *
 * Limitation note:
 * React Router's `useBlocker` / Back-button guarding requires a Data Router (e.g. `createBrowserRouter` + `<RouterProvider>`).
 * Because this application uses `<BrowserRouter>` from react-router-dom v7, `useBlocker` cannot be used without throwing at runtime.
 * Guarding browser Back/Forward button history navigation reliably requires migrating to a Data Router.
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

  // Capture-phase link click guard for in-app anchor elements
  useEffect(() => {
    if (!dirty) return
    function guardLinkNavigation(event: MouseEvent) {
      if (event.defaultPrevented) return
      const target = event.target
      if (!(target instanceof Element)) return
      const link = target.closest('a[href]')
      if (!(link instanceof HTMLAnchorElement)) return

      const href = link.getAttribute('href')
      if (
        !href ||
        href.startsWith('#') ||
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
}
