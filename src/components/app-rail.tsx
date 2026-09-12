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
  ShieldCheck,
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

const ADMIN_NAV_ITEM = {
  href: '/manage-profiles',
  label: 'Manage Profiles',
  icon: ShieldCheck,
  exact: false,
}

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

  const NAV =
    role === 'admin'
      ? [...BASE_NAV, ADMIN_NAV_ITEM]
      : role === 'sourcer'
        ? SOURCER_NAV
        : BASE_NAV

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

  const sendPct = Math.min(sends / dailyLimit, 1)
  const circumference = 2 * Math.PI * 13

  const sendCounter = (
    <div className="flex items-center gap-2.5" title={`${sends} of ${dailyLimit} sends used today`}>
      <div className="relative size-8">
        <svg className="size-8 -rotate-90" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="13" fill="none" stroke="var(--line)" strokeWidth="2.5" />
          <circle
            cx="16"
            cy="16"
            r="13"
            fill="none"
            stroke={atCeiling ? 'var(--status-research)' : 'var(--gold)'}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - sendPct)}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-mono-medium text-[8px] font-medium text-ink">
          {sends}
        </span>
      </div>
      {atCeiling && <span className="text-label text-status-research">Ceiling</span>}
    </div>
  )

  return (
    <>
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 border-b border-line/60 surface-glass lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <RelayBrand />
          <div className="flex items-center gap-2">
            {sendCounter}
            <Link
              href="/onboarding"
              className="rounded-lg p-1.5 text-slate transition-colors hover:bg-muted hover:text-ink"
              title="Your voice"
            >
              <Sparkles className="size-4" />
            </Link>
            <ThemeToggle />
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg p-1.5 text-slate transition-colors hover:bg-muted hover:text-ink"
              title="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-64 lg:flex-col lg:border-r lg:border-line/60">
        {/* Brand */}
        <div className="flex items-center justify-between px-5 py-5">
          <RelayBrand />
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-0.5 px-3 pb-4">
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact)
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200',
                  active
                    ? 'bg-ink text-paper shadow-sm'
                    : 'text-slate hover:bg-muted/50 hover:text-ink',
                )}
              >
                <Icon
                  className={cn(
                    'size-[18px] shrink-0 transition-colors',
                    active ? 'text-gold' : 'text-slate group-hover:text-ink',
                  )}
                  aria-hidden="true"
                  strokeWidth={active ? 2.2 : 1.8}
                />
                <span>{label}</span>
                {active && (
                  <span className="absolute right-2.5 size-1.5 rounded-full bg-gold" />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Bottom */}
        <div className="border-t border-line/60 px-4 py-4 space-y-3">
          <Link
            href="/onboarding"
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] transition-colors hover:bg-muted"
          >
            <Sparkles className="size-[18px] shrink-0 text-gold" aria-hidden="true" />
            <span className="flex-1 text-slate">Your voice</span>
            {calibrated ? (
              <span className="text-label text-slate">saved</span>
            ) : (
              <span className="rounded-full bg-gold/10 px-2 py-0.5 text-label text-gold">
                start
              </span>
            )}
          </Link>

          <div className="flex items-center justify-between gap-2 px-1">
            <IdentityChip name={repName} subtitle={ROLE_LABEL[role]} />
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg p-1.5 text-slate transition-colors hover:bg-muted hover:text-ink"
              title="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 px-1">
            {sendCounter}
            <div className="flex items-center gap-2">
              <ThemeToggle className="rounded-lg p-1 text-slate transition-colors hover:bg-muted hover:text-ink" />
              <span className="text-mono-medium text-[10px] text-slate/50">v{APP_VERSION}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line/60 surface-glass pb-[env(safe-area-inset-bottom)] lg:hidden"
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
                  'relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
                  active ? 'text-ink' : 'text-slate hover:text-ink',
                )}
              >
                {active && (
                  <span className="absolute top-0 left-1/2 h-[2px] w-6 -translate-x-1/2 rounded-full bg-gold" />
                )}
                <Icon
                  className={cn('size-5 transition-all', active ? 'text-gold' : '')}
                  aria-hidden="true"
                  strokeWidth={active ? 2.2 : 1.8}
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
