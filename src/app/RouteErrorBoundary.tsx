import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { Alert } from '../shared/ui/Alert'
import { Button } from '../shared/ui/Button'

interface RouteErrorBoundaryState {
  failed: boolean
}

/** Catches page-load and render failures so the person sees a way forward instead of a blank screen. */
export class RouteErrorBoundary extends Component<{ children: ReactNode }, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): RouteErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('A page failed to load or render.', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="route-state" id="main-content">
        <Alert tone="error" label="This page couldn’t load">
          Something went wrong while loading this page. The app may have been updated. Reload to get the latest version.
        </Alert>
        <Button type="button" onClick={() => window.location.reload()}>
          <RefreshCw size={17} aria-hidden="true" /> Reload page
        </Button>
      </main>
    )
  }
}
