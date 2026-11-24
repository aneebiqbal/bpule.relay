"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { cn } from "cn"

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

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
  title: React.ReactNode
  description?: string
  children?: React.ReactNode
  className?: string
}) {
  const panelRef = React.useRef<HTMLDivElement | null>(null)
  const titleId = React.useId()
  const descId = React.useId()
  const triggerRef = React.useRef<HTMLElement | null>(null)
  const onCloseRef = React.useRef(onClose)
  React.useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  React.useEffect(() => {
    if (!open) return
    triggerRef.current = document.activeElement as HTMLElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current()
        return
      }
      if (e.key !== "Tab") return
      const items = panelRef.current
        ? Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        : []
      if (items.length === 0) {
        e.preventDefault()
        panelRef.current?.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", onKey)
      triggerRef.current?.focus()
    }
  }, [open])

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
          "relative max-h-[90dvh] overflow-y-auto w-full max-w-md rounded-2xl bg-bone-raised/95 p-6 shadow-xl ring-1 ring-line/60 outline-none scale-in",
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
            className="rounded-lg p-1.5 text-slate transition-colors hover:bg-bone hover:text-ink"
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
