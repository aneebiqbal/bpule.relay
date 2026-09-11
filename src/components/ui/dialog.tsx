"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { cn } from "cn"

/**
 * Minimal accessible modal. Focus lands in the panel, Escape and backdrop
 * close it, and the page behind stays inert to pointer events. Use for
 * destructive confirmations instead of window.confirm.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: React.ReactNode
  className?: string
}) {
  const panelRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div
        className="absolute inset-0 bg-ink/40"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "relative w-full max-w-md rounded-xl bg-paper p-5 shadow-xl ring-1 ring-line outline-none",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-medium text-ink">{title}</h2>
            {description ? (
              <p className="text-sm leading-relaxed text-slate">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate transition-colors hover:bg-paper-tint hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <X className="size-4" />
          </button>
        </div>
        {children ? <div className="mt-4">{children}</div> : null}
      </div>
    </div>,
    document.body,
  )
}

export function DialogActions({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("mt-5 flex items-center justify-end gap-3", className)}>
      {children}
    </div>
  )
}
