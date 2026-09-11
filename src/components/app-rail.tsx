'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  BookOpen,
  CalendarDays,
  FileUp,
  IdCard,
  LogOut,
  Plus,
  Search,
  Sparkles,
  Users,
  Briefcase,
} from 'lucide-react'
import { cn } from 'cn'
import { RelayBrand } from '@/components/brand'
import { IdentityChip } from '@/components/identity-chip'
import { ThemeToggle } from '@/components/theme-toggle'
import { APP_VERSION } from '@/lib/version'
import type { RepRole } from '@/lib/domain/types'

const BASE_NAV = [
  { href: '/', label: 'Today', icon: CalendarDays, exact: true },
  { href: '/leads/new', label: 'New lead', icon: Plus, exact: true },
  { href: '/upwork', label: 'Upwork', icon: Briefcase, exact: false },
  { href: '/archive', label: 'Archive', icon: Search, exact: false },
  { href: '/team', label: 'Team', icon: Users, exact: false },
  { href: '/profiles', label: 'Profiles', icon: IdCard, exact: false },
  { href: '/facts', label: 'Facts', icon: BookOpen, exact: false },
]

const SOURCER_NAV = [
  { href: '/', label: 'Today', icon: CalendarDays, exact: true },
  { href: '/leads/new', label: 'New lead', icon: Plus, exact: true },
  { href: '/leads/import', label: 'Import', icon: FileUp, exact: false },
  { href: '/archive', label: 'Archive', icon: Search, exact: false },
  { href: '/team', label: 'Team', icon: Users, exact: false },
  { href: '/profiles', label: 'Profiles', icon: IdCard, exact: false },
  { href: '/facts', label: 'Facts', icon: BookOpen, exact: false },
]

const ROLE_LABEL: Record<RepRole, string> = {
  admin: 'Admin',
  rep: 'Rep',
  sourcer: 'Sourcer',
}

export interface AppRailProps {
  repName: string
  role: RepRole
  calibrated: boolean
  demo: boolean
  todaySends: number
  dailyLimit: number
}

export function AppRail({
  repName,
  role,
  calibrated,
  demo,
  todaySends,
  dailyLimit,
}: AppRailProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [sends, setSends] = useState(todaySends)

  const NAV = role === 'sourcer' ? SOURCER_NAV : BASE_NAV

  useEffect(() => {
    let cancelled = false
    fetch('/api/me/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && typeof d.todaySends === 'number') {
          setSends(d.todaySends)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [pathname])

  const atCeiling = sends >= dailyLimit

  function isActive(href: string, exact: boolean) {
    return exact ? pathname === href : pathname.startsWith(href)
  }

  async function signOut() {
    if (!demo) {
      const { getBrowserSupabase } = await import('@/lib/supabase/client')
      const supabase = getBrowserSupabase()
      await supabase.auth.signOut()
    }
    router.replace('/login')
    router.refresh()
  }

  const sendCounter = (
    <div className="flex items-center gap-2" title={`${sends} of ${dailyLimit} sends used today`}>
      <span className="font-mono text-xs text-ink">
        {sends}
        <span className="text-slate"> / {dailyLimit}</span>
      </span>
      <div className="h-1 w-12 overflow-hidden rounded-full bg-paper-tint">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-300',
            atCeiling ? 'bg-status-research' : 'bg-gold',
          )}
          style={{ width: `${Math.min(Math.round((sends / dailyLimit) * 100), 100)}%` }}
        />
      </div>
      {atCeiling ? <span className="text-[11px] text-status-research">Ceiling</span> : null}
    </div>
  )

  return (
    <>
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <RelayBrand />
          <div className="flex items-center gap-3">
            {sendCounter}
            <Link
              href="/onboarding"
              className="rounded-md p-1.5 text-slate transition-colors hover:bg-muted hover:text-ink"
              title="Your voice"
            >
              <Sparkles className="size-4" />
            </Link>
            <ThemeToggle />
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-md p-1.5 text-slate transition-colors hover:bg-muted hover:text-ink"
              title="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-line">
        <div className="flex items-center justify-between px-5 py-4">
          <RelayBrand />
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-4 pb-4">
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact)
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  active
                    ? 'bg-muted font-medium text-ink'
                    : 'text-slate hover:bg-muted/60 hover:text-ink',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span>{label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-line px-4 py-4">
          <Link
            href="/onboarding"
            className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-slate transition-colors hover:bg-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            title="Review or rebuild your style card"
          >
            <Sparkles className="size-4 shrink-0 text-gold" aria-hidden="true" />
            <span className="flex-1">Your voice</span>
            {calibrated ? (
              <span className="text-xs text-slate">saved</span>
            ) : (
              <span className="text-xs font-medium text-gold">start</span>
            )}
          </Link>

          <div className="mt-3 flex items-center justify-between gap-2 px-2">
            <IdentityChip name={repName} subtitle={ROLE_LABEL[role]} />
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-md p-1.5 text-slate transition-colors hover:bg-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              title="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 px-2">
            {sendCounter}
            <div className="flex items-center gap-1">
              <ThemeToggle className="rounded-md p-1 text-slate transition-colors hover:bg-muted hover:text-ink" />
              <span className="font-mono text-[11px] text-slate">v{APP_VERSION}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Primary"
      >
        <div className="flex items-stretch">
          {NAV.slice(0, 5).map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact)
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  active ? 'text-ink' : 'text-slate hover:text-ink',
                )}
              >
                <Icon
                  className={cn('size-5', active ? 'text-gold' : '')}
                  aria-hidden="true"
                  strokeWidth={active ? 2.4 : 2}
                />
                {label}
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
