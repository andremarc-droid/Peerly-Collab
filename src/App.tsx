import { AppRoutes } from './app/App'
import { RouteErrorBoundary } from './app/RouteErrorBoundary'

function App() {
  return <><a className="skip-link" href="#main-content">Skip to content</a><RouteErrorBoundary><AppRoutes /></RouteErrorBoundary></>
}

export default App
