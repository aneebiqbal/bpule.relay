'use client'

import { useState } from 'react'
import { PanelRight } from 'lucide-react'
import { Drawer } from '@/components/ui/drawer'

/**
 * Below xl the intelligence pane moves into a right drawer (list → thread →
 * info drawer on phones). The server-rendered panel is passed as children.
 */
export function IntelligenceDrawer({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-bone px-2.5 text-[13px] text-ink hover:bg-bone-raised xl:hidden"
      >
        <PanelRight className="size-4" aria-hidden="true" />
        Lead intelligence
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Lead intelligence" side="right">
        <div className="p-3">{children}</div>
      </Drawer>
    </>
  )
}
