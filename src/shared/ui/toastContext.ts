import { createContext } from 'react'

export interface ToastContextValue {
  showToast: (tone: 'success' | 'error' | 'info', message: string, action?: { label: string; onClick: () => void }) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)
