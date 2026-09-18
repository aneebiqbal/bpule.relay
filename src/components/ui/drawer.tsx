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

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [open, onClose])

  if (!open) return null

  const sideClasses: Record<string, string> = {
    left: "inset-y-0 left-0 w-72 max-w-[85vw]",
    right: "inset-y-0 right-0 w-80 max-w-[85vw]",
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
