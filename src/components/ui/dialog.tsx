"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { cn } from "cn"

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
  const titleId = React.useId()
  const descId = React.useId()
  const triggerRef = React.useRef<HTMLElement | null>(null)

  React.useEffect(() => {
    if (!open) return
    triggerRef.current = document.activeElement as HTMLElement
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      triggerRef.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div
        className="absolute inset-0 bg-ink/30 fade-in"
        style={{ backdropFilter: "blur(4px)" }}
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "relative w-full max-w-md rounded-2xl bg-paper-raised/95 p-6 shadow-xl ring-1 ring-line/60 outline-none scale-in",
          className,
        )}
        style={{ backdropFilter: "blur(20px)" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 id={titleId} className="text-heading text-lg text-ink">{title}</h2>
            {description ? (
              <p id={descId} className="text-sm leading-relaxed text-slate">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-slate transition-colors hover:bg-paper-tint hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
        {children ? <div className="mt-5">{children}</div> : null}
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
    <div className={cn("flex items-center justify-end gap-3", className)}>
      {children}
    </div>
  )
}
