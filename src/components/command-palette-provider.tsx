'use client'

import { useEffect, useState } from 'react'
import { CommandPalette, useCommandPalette } from '@/components/command-palette'

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const { open, setOpen } = useCommandPalette()
  const [isAdmin, setIsAdmin] = useState(false)
  const [isManager, setIsManager] = useState(false)

  // The canonical org role, so admin commands never show on a stale reps.role.
  useEffect(() => {
    let cancelled = false

    // The app layout already resolved the canonical org role; reuse it instead
    // of a second authenticated request on every page load.
    const boot = (window as typeof window & { __RELAY_AUTH_CONTEXT__?: { isAdmin?: boolean; isManager?: boolean } })
      .__RELAY_AUTH_CONTEXT__
    if (boot && typeof boot.isAdmin === 'boolean' && typeof boot.isManager === 'boolean') {
      setIsAdmin(boot.isAdmin)
      setIsManager(boot.isManager)
      return
    }

    fetch('/api/me/status', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return
        if (typeof d.isAdmin === 'boolean') setIsAdmin(d.isAdmin)
        if (typeof d.isManager === 'boolean') setIsManager(d.isManager)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      {children}
      <CommandPalette open={open} onOpenChange={setOpen} isAdmin={isAdmin} isManager={isManager} />
    </>
  )
}
