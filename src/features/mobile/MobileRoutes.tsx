import { Navigate } from 'react-router-dom'
import { useIsMobileView } from '../../lib/platform/isMobileView'
import { LandingPage } from '../landing/LandingPage'
import { StartScreen } from './StartScreen'
import { WelcomeScreen } from './WelcomeScreen'

/** `/`: the welcome screen on phones and in the Android app, the marketing page everywhere else. */
export function LandingRoute() {
  return useIsMobileView() ? <WelcomeScreen /> : <LandingPage />
}

/** `/start`: only exists in the phone flow. Larger screens go back to the marketing page, which has its own buttons. */
export function StartRoute() {
  return useIsMobileView() ? <StartScreen /> : <Navigate to="/" replace />
}
