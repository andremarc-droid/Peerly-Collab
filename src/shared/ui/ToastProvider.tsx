import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BookOpen, CircleAlert, CircleCheck, X } from 'lucide-react'
import { ToastContext } from './toastContext'

export type ToastTone = 'success' | 'error' | 'info'
interface ToastAction { label: string; onClick: () => void }
interface ToastMessage { id: number; tone: ToastTone; message: string; action?: ToastAction }
const toastMeta = {
  success: { label: 'Success', Icon: CircleCheck },
  error: { label: 'Error', Icon: CircleAlert },
  info: { label: 'Information', Icon: BookOpen },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const timers = useRef(new Map<number, number>())
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), [])

  const showToast = useCallback((tone: ToastTone, message: string, action?: ToastAction) => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, tone, message, action }])
    const timer = window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
      timers.current.delete(id)
    }, 5000)
    timers.current.set(id, timer)
  }, [])

  function dismiss(id: number) {
    const timer = timers.current.get(id)
    if (timer) window.clearTimeout(timer)
    timers.current.delete(id)
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }
  const context = useMemo(() => ({ showToast }), [showToast])
  return (
    <ToastContext.Provider value={context}>
      {children}
      <div className="toast-region" aria-label="Notifications" aria-live="polite" aria-atomic="false">
        {toasts.map(({ id, tone, message, action }) => {
          const { label, Icon } = toastMeta[tone]
          return <div className={`toast toast--${tone}`} role={tone === 'error' ? 'alert' : 'status'} key={id}><Icon size={18} aria-hidden="true" /><strong>{label}</strong><span>{message}</span>{action && <button className="toast__action" type="button" onClick={() => { action.onClick(); dismiss(id) }}>{action.label}</button>}<button type="button" aria-label={`Dismiss ${label.toLowerCase()} notification`} onClick={() => dismiss(id)}><X size={16} aria-hidden="true" /></button></div>
        })}
      </div>
    </ToastContext.Provider>
  )
}
