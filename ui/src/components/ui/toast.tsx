/**
 * Toast Notification System
 *
 * Lightweight toast notifications with auto-dismiss, stacking,
 * and support for success/error/info variants.
 *
 * Usage:
 *   import { useToast, ToastContainer } from '@/components/ui/toast'
 *
 *   // In your component:
 *   const { toast } = useToast()
 *   toast({ title: 'Done!', variant: 'success' })
 *
 *   // Mount <ToastContainer /> once at app root.
 *
 * Issue: #24 Abort Run
 */

import {
  createContext,
  useContext,
  useCallback,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export type ToastVariant = 'success' | 'error' | 'info'

export interface ToastData {
  id: string
  title: string
  description?: string
  variant: ToastVariant
  durationMs: number
}

type ToastInput = Omit<ToastData, 'id' | 'durationMs'> & {
  durationMs?: number
}

interface ToastContextValue {
  toast: (input: ToastInput) => void
  dismiss: (id: string) => void
}

// ---------------------------------------------------------------------------
//  Context
// ---------------------------------------------------------------------------

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a <ToastProvider>')
  }
  return ctx
}

// ---------------------------------------------------------------------------
//  Provider
// ---------------------------------------------------------------------------

const DEFAULT_DURATION_MS = 4000
const MAX_VISIBLE = 5

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([])

  const toast = useCallback((input: ToastInput) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const entry: ToastData = {
      ...input,
      id,
      durationMs: input.durationMs ?? DEFAULT_DURATION_MS,
    }
    setToasts((prev) => [...prev, entry].slice(-MAX_VISIBLE))
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

// ---------------------------------------------------------------------------
//  Container (renders toasts in a portal-like fixed layer)
// ---------------------------------------------------------------------------

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastData[]
  onDismiss: (id: string) => void
}) {
  if (toasts.length === 0) return null

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Individual toast
// ---------------------------------------------------------------------------

const variantStyles: Record<ToastVariant, string> = {
  success:
    'border-emerald-500/30 bg-emerald-950/90 text-emerald-100',
  error:
    'border-red-500/30 bg-red-950/90 text-red-100',
  info:
    'border-sky-500/30 bg-sky-950/90 text-sky-100',
}

const variantIcons: Record<ToastVariant, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastData
  onDismiss: (id: string) => void
}) {
  const [exiting, setExiting] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setExiting(true)
      // Allow exit animation to play before removal
      setTimeout(() => onDismiss(toast.id), 200)
    }, toast.durationMs)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [toast.id, toast.durationMs, onDismiss])

  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto min-w-[280px] max-w-[400px] rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm',
        'transform transition-all duration-200',
        exiting
          ? 'translate-x-full opacity-0'
          : 'translate-x-0 opacity-100 animate-in slide-in-from-right-full',
        variantStyles[toast.variant],
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-sm font-bold shrink-0">
          {variantIcons[toast.variant]}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{toast.title}</p>
          {toast.description && (
            <p className="mt-1 text-xs opacity-80">{toast.description}</p>
          )}
        </div>
        <button
          onClick={() => {
            setExiting(true)
            setTimeout(() => onDismiss(toast.id), 200)
          }}
          className="shrink-0 text-xs opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
