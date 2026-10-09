import { createContext, useContext } from 'react'

export interface MobileChrome {
  /** True on Classes / Quizzes / Learning / Profile — the destinations in the bottom bar. */
  tabRoot: boolean
  /** Destination for the large-app-bar back button on pushed screens. */
  backTo: string | null
}

export const MobileChromeContext = createContext<MobileChrome | null>(null)

export function useMobileChrome(): MobileChrome | null {
  return useContext(MobileChromeContext)
}
