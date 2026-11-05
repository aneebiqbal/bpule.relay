"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { cn } from "cn"

interface DrawerProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  side?: "left" | "right" | "bottom"
  className?: string
}

export function Drawer({ open, onClose, title, children, side = "left", className }: DrawerProps) {
  const panelRef = React.useRef<HTMLDivElement>(null)
  // Portals need document.body, which does not exist during server rendering.
  // A deep link can open the drawer before hydration, so render it only after
  // mount instead of touching `document` while React is server-rendering.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key !== "Tab") return
      // Keep Tab inside the drawer: a modal panel must not let focus escape to
      // the page behind it.
      const focusables = panelRef.current
        ? Array.from(
            panelRef.current.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
            ),
          )
        : []
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    // Move focus into the panel and give it back on close (keyboard + SR users).
    const previouslyFocused = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
      previouslyFocused?.focus?.()
    }
  }, [open, onClose])

  if (!open || !mounted) return null

  const sideClasses: Record<string, string> = {
    left: "inset-y-0 left-0 w-72 max-w-[85vw]",
    right: "inset-y-0 right-0 w-80 max-w-[85vw] sm:w-[420px]",
    bottom: "inset-x-0 bottom-0 max-h-[85vh] rounded-t-xl",
  }

  return createPortal(
    <div className="fixed inset-0 z-50">
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
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "fixed flex flex-col bg-bone-raised shadow-xl",
          sideClasses[side],
          "slide-in-right",
          className
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-heading text-sm font-medium text-ink">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 text-graphite transition-colors hover:bg-bone hover:text-ink"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body
  )
}
