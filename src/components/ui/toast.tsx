"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "cn"
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react"
import { isApiMutation, toastFromApiError } from "@/lib/ui/api-error-toast"
import { bindToast, notify } from "@/lib/ui/notify"

export interface ToastInput {
  title: string
  description?: string
  variant?: "default" | "success" | "destructive" | "info"
  action?: { label: string; href: string }
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
    const lifetime = toast.action ? 10000 : toast.variant === "destructive" ? 7000 : 4500
    setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id))
    }, lifetime)
  }, [])

  React.useEffect(() => {
    bindToast(push)
    return () => bindToast(null)
  }, [push])

  React.useEffect(() => {
    const original = window.fetch.bind(window)
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase()
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      try {
        const response = await original(input, init)
        if (isApiMutation(url, method, window.location.origin) && !response.ok) {
          const body = await response.clone().json().catch(() => null)
          notify(toastFromApiError(response.status, body))
        }
        return response
      } catch (error) {
        const aborted = error instanceof DOMException && error.name === "AbortError"
        if (!aborted && isApiMutation(url, method, window.location.origin)) {
          notify({
            title: "Connection failed",
            description: "The request did not reach Relay. Check your connection and try again.",
            variant: "destructive",
          })
        }
        throw error
      }
    }
    return () => {
      window.fetch = original
    }
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
              className="pointer-events-none fixed inset-x-0 bottom-24 z-[80] flex flex-col items-center gap-2.5 px-4 lg:bottom-6"
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
                  role={t.variant === "destructive" ? "alert" : "status"}
                  aria-live={t.variant === "destructive" ? "assertive" : "polite"}
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
                    {t.action ? (
                      <a
                        href={t.action.href}
                        className="mt-2 inline-flex text-xs font-medium text-ink underline underline-offset-2"
                      >
                        {t.action.label}
                      </a>
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
