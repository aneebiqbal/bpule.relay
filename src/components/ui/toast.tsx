"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "cn"

export interface ToastInput {
  title: string
  description?: string
  variant?: "default" | "destructive"
}

interface ToastItem extends ToastInput {
  id: number
}

const ToastContext = React.createContext<(toast: ToastInput) => void>(() => {})

export function useToast() {
  return React.useContext(ToastContext)
}

let nextId = 1

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([])

  const push = React.useCallback((toast: ToastInput) => {
    const id = nextId++
    setToasts((list) => [...list, { ...toast, id }])
    setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  const dismiss = React.useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      {toasts.length > 0
        ? createPortal(
            <div
              className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
              role="region"
              aria-label="Notifications"
            >
              {toasts.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border px-3.5 py-2.5 text-sm shadow-lg",
                    t.variant === "destructive"
                      ? "border-status-no/30 bg-paper text-status-no"
                      : "border-line bg-paper text-ink",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{t.title}</div>
                    {t.description ? (
                      <div className="mt-0.5 text-xs leading-relaxed text-slate">
                        {t.description}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => dismiss(t.id)}
                    aria-label="Dismiss"
                    className="rounded p-0.5 text-slate transition-colors hover:text-ink"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  )
}
