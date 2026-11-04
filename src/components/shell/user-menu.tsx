'use client'

/**
 * Header account menu — non-operational controls only.
 *
 * USER = the logged-in person. PROFILE / sending identity is a separate concept
 * and is shown contextually on Sales, Inbox and Lead surfaces, never here.
 */
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, CircleHelp, LogOut, Moon, Sun, SlidersHorizontal, UserRound } from 'lucide-react'
import { cn } from 'cn'
import { V3Avatar } from '@/components/v3/primitives'
import { useTheme } from '@/components/theme-provider'

export interface UserMenuProps {
  name: string
  role: string
  organizationName: string
  demo: boolean
  sends: number
  dailyLimit: number
}

export function UserMenu({ name, role, organizationName, demo, sends, dailyLimit }: UserMenuProps) {
  const router = useRouter()
  const { theme, toggle } = useTheme()
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

  async function signOut() {
    if (!demo) {
      const { getBrowserAuth } = await import('@/lib/auth/browser')
      const auth = await getBrowserAuth()
      await auth.signOut()
    }
    router.replace('/login')
    router.refresh()
  }

  const pct = dailyLimit > 0 ? Math.min(sends / dailyLimit, 1) : 0
  const circumference = 2 * Math.PI * 11

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${name} account`}
        className={cn(
          'flex items-center gap-2 rounded-md border border-line bg-bone-raised pl-1.5 pr-2 py-1 text-left',
          'transition-colors hover:border-orange/30',
        )}
      >
        <V3Avatar name={name} size="sm" />
        <span className="hidden max-w-[120px] truncate text-[12px] font-medium text-ink sm:block">{name}</span>
        <ChevronRight
          className={cn('size-3 shrink-0 text-stone transition-transform', open && 'rotate-90')}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-[calc(100%+0.35rem)] z-50 w-72 overflow-hidden rounded-lg border border-line bg-bone-raised shadow-lg"
        >
          <div className="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
            <V3Avatar name={name} />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-ink">{name}</p>
              <p className="truncate text-[10px] uppercase tracking-[0.12em] text-stone">
                {role} · {organizationName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
            <div className="relative size-7 shrink-0">
              <svg className="size-7 -rotate-90" viewBox="0 0 28 28" aria-hidden>
                <circle cx="14" cy="14" r="11" fill="none" stroke="var(--line)" strokeWidth="2" />
                <circle
                  cx="14"
                  cy="14"
                  r="11"
                  fill="none"
                  stroke={sends >= dailyLimit ? 'var(--status-warning)' : 'var(--orange)'}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - pct)}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[7px] font-medium tabular-nums text-ink">
                {sends}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-ink">Send budget</p>
              <p className="text-[10px] text-stone">
                {sends} of {dailyLimit} used today
              </p>
            </div>
          </div>

          <div className="p-1.5">
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-graphite transition-colors hover:bg-bone hover:text-ink"
            >
              <UserRound className="size-3.5 shrink-0 text-stone" aria-hidden />
              <span className="flex-1">Account</span>
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={toggle}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-graphite transition-colors hover:bg-bone hover:text-ink"
            >
              {theme === 'dark' ? (
                <Sun className="size-3.5 shrink-0 text-stone" aria-hidden />
              ) : (
                <Moon className="size-3.5 shrink-0 text-stone" aria-hidden />
              )}
              <span className="flex-1">Appearance</span>
              <span className="text-[11px] text-stone">{theme === 'dark' ? 'Dark' : 'Light'}</span>
            </button>
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-graphite transition-colors hover:bg-bone hover:text-ink"
            >
              <SlidersHorizontal className="size-3.5 shrink-0 text-stone" aria-hidden />
              <span className="flex-1">Preferences</span>
            </Link>
            <Link
              href="/docs"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-graphite transition-colors hover:bg-bone hover:text-ink"
            >
              <CircleHelp className="size-3.5 shrink-0 text-stone" aria-hidden />
              <span className="flex-1">Help & docs</span>
            </Link>
          </div>

          <div className="border-t border-line p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => void signOut()}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-graphite transition-colors hover:bg-bone hover:text-status-danger"
            >
              <LogOut className="size-3.5 shrink-0 text-stone" aria-hidden />
              <span className="flex-1">Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
