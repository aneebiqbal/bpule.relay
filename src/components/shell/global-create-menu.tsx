'use client'

/**
 * Global Create — one persistent primary action in the V3 header.
 * Every item routes to the canonical surface; no creation logic is duplicated.
 */
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Plus, ChevronRight } from 'lucide-react'
import { cn } from 'cn'
import { buildGlobalCreateItems } from '@/lib/navigation/global-create-items'

export interface GlobalCreateMenuProps {
  isAdmin: boolean
  isManager?: boolean
}

export function GlobalCreateMenu({ isAdmin, isManager = false }: GlobalCreateMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const items = buildGlobalCreateItems(isAdmin, isManager)

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md bg-solid px-3 py-1.5 text-[13px] font-medium text-on-solid',
          'transition-transform active:scale-[0.98]',
        )}
      >
        <Plus className="size-3.5" aria-hidden />
        Create
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Create"
          className="absolute right-0 top-[calc(100%+0.35rem)] z-50 w-72 overflow-hidden rounded-lg border border-line bg-bone-raised p-1.5 shadow-lg"
        >
          {items.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-bone"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                  {item.label}
                  {'default' in item && item.default && (
                    <span className="rounded-full bg-orange-faint px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.1em] text-orange-ink">
                      Default
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-[11px] text-stone">{item.description}</span>
              </span>
              <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-stone" aria-hidden />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
