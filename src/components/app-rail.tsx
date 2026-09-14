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
  PenLine,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Briefcase,
  Command,
} from 'lucide-react'
import { cn } from 'cn'
import { RelayBrand } from '@/components/brand'
import { IdentityChip } from '@/components/identity-chip'
import { ThemeToggle } from '@/components/theme-toggle'
import { APP_VERSION } from '@/lib/version'
import type { RepRole } from '@/lib/domain/types'

const RELAY_NAV = [
  { href: '/', label: 'Today', icon: CalendarDays, exact: true },
  { href: '/prospect', label: 'Prospect Check', icon: Search, exact: true },
  { href: '/content', label: 'Content', icon: PenLine, exact: false, studio: true },
  { href: '/leads/new', label: 'New lead', icon: Plus, exact: true },
  { href: '/upwork', label: 'Upwork', icon: Briefcase, exact: false },
  { href: '/archive', label: 'Archive', icon: Search, exact: false },
]

const SYSTEM_NAV = [
  { href: '/team', label: 'Team', icon: Users, exact: false },
  { href: '/profiles', label: 'Knowledge', icon: IdCard, exact: false },
  { href: '/facts', label: 'Facts', icon: BookOpen, exact: false },
]

const SOURCER_EXTRA = [
  { href: '/leads/import', label: 'Import', icon: FileUp, exact: false },
]

const ADMIN_NAV = {
  href: '/manage-profiles',
  label: 'Manage',
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
      ? [...RELAY_NAV, ADMIN_NAV, ...SYSTEM_NAV]
      : role === 'sourcer'
        ? [...RELAY_NAV.slice(0, 2), ...SOURCER_EXTRA, ...RELAY_NAV.slice(2), ...SYSTEM_NAV]
        : [...RELAY_NAV, ...SYSTEM_NAV]

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
    return () => { cancelled = true }
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
  const circumference = 2 * Math.PI * 11

  const sendCounter = (
    <div className="flex items-center gap-2" title={`${sends} of ${dailyLimit} sends used today`}>
      <div className="relative size-7">
        <svg className="size-7 -rotate-90" viewBox="0 0 28 28">
          <circle cx="14" cy="14" r="11" fill="none" stroke="var(--line)" strokeWidth="2" />
          <circle
            cx="14"
            cy="14"
            r="11"
            fill="none"
            stroke={atCeiling ? 'var(--status-warning)' : 'var(--orange)'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - sendPct)}
            className="transition-all duration-500 ease-out"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-mono-medium text-[7px] font-medium text-ink">
          {sends}
        </span>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-bone/95 backdrop-blur-sm lg:hidden">
        <div className="flex items-center justify-between px-4 py-2.5">
          <RelayBrand />
          <div className="flex items-center gap-1.5">
            {sendCounter}
            <ThemeToggle />
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-md p-1.5 text-graphite transition-colors hover:bg-bone-raised hover:text-ink"
              title="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-56 lg:flex-col lg:border-r lg:border-line">
        {/* Brand */}
        <div className="flex items-center justify-between px-4 py-4">
          <RelayBrand />
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-0.5 px-2.5 pb-3">
          {/* Relay section */}
          <div className="mb-1 px-2 pt-1">
            <span className="text-label text-stone">Relay</span>
          </div>
          {NAV.filter(n => !('studio' in n) && !SYSTEM_NAV.includes(n) && n.href !== '/manage-profiles').map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact)
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-all duration-150',
                  active
                    ? 'bg-ink text-bone'
                    : 'text-graphite hover:bg-bone-raised hover:text-ink',
                )}
              >
                <Icon
                  className={cn(
                    'size-4 shrink-0 transition-colors',
                    active ? 'text-bone' : 'text-stone group-hover:text-ink',
                  )}
                  aria-hidden="true"
                  strokeWidth={active ? 2 : 1.7}
                />
                <span>{label}</span>
              </Link>
            )
          })}

          {/* Content / Studio */}
          <div className="mb-1 mt-4 px-2 pt-1">
            <span className="text-label text-stone">Studio</span>
          </div>
          {NAV.filter(n => 'studio' in n).map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact)
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-all duration-150',
                  active
                    ? 'bg-cobalt text-bone'
                    : 'text-graphite hover:bg-bone-raised hover:text-ink',
                )}
              >
                <Icon
                  className={cn(
                    'size-4 shrink-0 transition-colors',
                    active ? 'text-bone' : 'text-cobalt/60 group-hover:text-cobalt',
                  )}
                  aria-hidden="true"
                  strokeWidth={active ? 2 : 1.7}
                />
                <span>{label}</span>
              </Link>
            )
          })}

          {/* System */}
          <div className="mb-1 mt-4 px-2 pt-1">
            <span className="text-label text-stone">System</span>
          </div>
          {NAV.filter(n => SYSTEM_NAV.includes(n) || n.href === '/manage-profiles').map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact)
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-all duration-150',
                  active
                    ? 'bg-ink text-bone'
                    : 'text-graphite hover:bg-bone-raised hover:text-ink',
                )}
              >
                <Icon
                  className={cn(
                    'size-4 shrink-0 transition-colors',
                    active ? 'text-bone' : 'text-stone group-hover:text-ink',
                  )}
                  aria-hidden="true"
                  strokeWidth={active ? 2 : 1.7}
                />
                <span>{label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Bottom */}
        <div className="border-t border-line px-3 py-3 space-y-2">
          <Link
            href="/onboarding"
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors hover:bg-bone-raised"
          >
            <Sparkles className="size-4 shrink-0 text-orange" aria-hidden="true" />
            <span className="flex-1 text-graphite">Your voice</span>
            {calibrated ? (
              <span className="text-label text-stone">saved</span>
            ) : (
              <span className="rounded bg-orange/10 px-1.5 py-0.5 text-label text-orange">
                start
              </span>
            )}
          </Link>

          <div className="flex items-center justify-between gap-2 px-1">
            <IdentityChip name={repName} subtitle={ROLE_LABEL[role]} />
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-md p-1.5 text-graphite transition-colors hover:bg-bone-raised hover:text-ink"
              title="Sign out"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 px-1">
            {sendCounter}
            <ThemeToggle className="rounded-md p-1 text-graphite transition-colors hover:bg-bone-raised hover:text-ink" />
            <span className="text-mono-medium text-[9px] text-stone/50">v{APP_VERSION}</span>
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bone/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Primary"
      >
        <div className="flex items-stretch">
          {[...RELAY_NAV.slice(0, 4), SYSTEM_NAV[0]].map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact)
            const isStudio = 'studio' in { href } && href === '/content'
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                  active ? 'text-ink' : 'text-graphite hover:text-ink',
                )}
              >
                {active && (
                  <span className={cn('absolute top-0 left-1/2 h-[2px] w-5 -translate-x-1/2 rounded-full', isStudio ? 'bg-cobalt' : 'bg-orange')} />
                )}
                <Icon
                  className={cn('size-4.5 transition-all', active ? (isStudio ? 'text-cobalt' : 'text-orange') : '')}
                  aria-hidden="true"
                  strokeWidth={active ? 2 : 1.7}
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
