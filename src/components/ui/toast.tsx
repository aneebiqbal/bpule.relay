"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "cn"
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react"

export interface ToastInput {
  title: string
  description?: string
  variant?: "default" | "success" | "destructive" | "info"
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
    }, 4500)
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
              className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2.5 px-4"
              role="region"
              aria-label="Notifications"
            >
              {toasts.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3.5 scale-in",
                    t.variant === "destructive"
                      ? "border-status-danger/20 bg-bone-raised/95 text-ink shadow-lg"
                      : t.variant === "success"
                        ? "border-status-success/20 bg-bone-raised/95 text-ink shadow-lg"
                        : t.variant === "info"
                          ? "border-orange/20 bg-bone-raised/95 text-ink shadow-lg"
                          : "border-line/60 bg-bone-raised/95 text-ink shadow-lg",
                  )}
                  style={{ backdropFilter: "blur(16px)" }}
                  role="status"
                  aria-live="polite"
                >
                  <div className="mt-0.5 shrink-0">
                    {t.variant === "destructive" ? (
                      <AlertTriangle className="size-4 text-status-danger" />
                    ) : t.variant === "success" ? (
                      <CheckCircle2 className="size-4 text-status-success" />
                    ) : t.variant === "info" ? (
                      <Info className="size-4 text-orange" />
                    ) : (
                      <Info className="size-4 text-slate" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{t.title}</div>
                    {t.description ? (
                      <div className="mt-0.5 text-xs leading-relaxed text-slate">
                        {t.description}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => dismiss(t.id)}
                    aria-label="Dismiss notification"
                    className="rounded-lg p-1 text-slate transition-colors hover:bg-bone hover:text-ink"
                  >
                    <X className="size-3.5" />
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
