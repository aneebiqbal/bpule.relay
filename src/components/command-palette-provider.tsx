'use client'

import { useEffect, useState } from 'react'
import { CommandPalette, useCommandPalette } from '@/components/command-palette'

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const { open, setOpen } = useCommandPalette()
  const [isAdmin, setIsAdmin] = useState(false)

  // The canonical org role, so admin commands never show on a stale reps.role.
  useEffect(() => {
    let cancelled = false
    fetch('/api/me/status', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && typeof d.isAdmin === 'boolean') setIsAdmin(d.isAdmin)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      {children}
      <CommandPalette open={open} onOpenChange={setOpen} isAdmin={isAdmin} />
    </>
  )
}
