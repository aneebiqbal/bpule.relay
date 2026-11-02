'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { isDemoMode } from '@/lib/ai/config'

export function SignOutButton() {
  const router = useRouter()

  async function handleSignOut() {
    if (!isDemoMode()) {
      const { getBrowserAuth } = await import("@/lib/auth/browser")
      const auth = await getBrowserAuth()
      await auth.signOut()
    }
    router.replace('/login')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={() => void handleSignOut()}
      className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-bone"
    >
      <LogOut className="size-4 text-status-danger" aria-hidden="true" />
      <span className="flex-1 text-[14px] text-status-danger">Sign out</span>
    </button>
  )
}
