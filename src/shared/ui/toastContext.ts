import { createContext } from 'react'

export interface ToastContextValue {
  showToast: (tone: 'success' | 'error' | 'info', message: string) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)
