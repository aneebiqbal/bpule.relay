'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Command, LogOut, Menu, Settings, X } from 'lucide-react'
import { cn } from 'cn'
import { RelayBrand } from '@/components/brand'
import { IdentityChip } from '@/components/identity-chip'
import { NotificationCenter } from '@/components/notification-center'
import { ThemeToggle } from '@/components/theme-toggle'
import { AppBackButton } from '@/components/app-back-button'
import { ProfileSwitcher } from '@/components/shell/profile-switcher'
import {
  detectRelayShellSection,
  sectionNavItems,
  visibleTopNav,
  type RelayNavRoleFlags,
} from '@/lib/navigation/relay-shell-nav'
import { APP_VERSION } from '@/lib/version'
import type { RepRole } from '@/lib/domain/types'

const ROLE_LABEL: Record<RepRole, string> = {
  admin: 'Admin',
  rep: 'Rep',
  sourcer: 'Sourcer',
  manager: 'Manager',
}

export interface RelayAppShellProps {
  repName: string
  organizationName: string
  role: RepRole
  isOwner: boolean
  isAdmin: boolean
  isManager: boolean
  demo: boolean
  todaySends: number
  dailyLimit: number
  children: React.ReactNode
}

function navActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
}

export function RelayAppShell({
  repName,
  organizationName,
  role,
  isOwner,
  isAdmin,
  isManager,
  demo,
  todaySends,
  dailyLimit,
  children,
}: RelayAppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [sends, setSends] = useState(todaySends)
  const [sectionRailOpen, setSectionRailOpen] = useState(false)

  const roleFlags: RelayNavRoleFlags = useMemo(
    () => ({ isOwner, isAdmin, isManager }),
    [isOwner, isAdmin, isManager],
  )

  const section = detectRelayShellSection(pathname)
  const topItems = visibleTopNav(roleFlags)
  const leftItems = useMemo(() => {
    const items = sectionNavItems(section, roleFlags)
    if (section === 'home' && !roleFlags.isAdmin && !roleFlags.isOwner && !roleFlags.isManager) {
      return items.filter((i) => i.href !== '/admin/command')
    }
    return items
  }, [section, roleFlags])

  useEffect(() => {
    let cancelled = false
    const fetchStatus = () => {
      fetch('/api/me/status')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d && typeof d.todaySends === 'number') setSends(d.todaySends)
        })
        .catch(() => {})
    }
    fetchStatus()
    const interval = setInterval(fetchStatus, 30_000)
    window.addEventListener('focus', fetchStatus)
    return () => {
      cancelled = true
      clearInterval(interval)
      window.removeEventListener('focus', fetchStatus)
    }
  }, [])

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
  const atCeiling = sends >= dailyLimit
  const circumference = 2 * Math.PI * 11

  const sendCounter = (
    <div className="flex items-center gap-2" title={`${sends} of ${dailyLimit} sends used today`}>
      <div className="relative size-7">
        <svg className="size-7 -rotate-90" viewBox="0 0 28 28" aria-hidden>
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
        <span className="absolute inset-0 flex items-center justify-center text-[7px] font-medium tabular-nums text-ink">
          {sends}
        </span>
      </div>
    </div>
  )

  function renderSectionRail(onNavigate?: () => void) {
    if (leftItems.length === 0) return null
    return (
      <nav className="flex flex-col gap-0.5 px-2 py-3" aria-label={`${section} section`}>
        {leftItems.map(({ label, href, exact }) => {
          const active = navActive(pathname, href, exact)
          return (
            <Link
              key={`${href}-${label}`}
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                active ? 'bg-solid text-on-solid' : 'text-graphite hover:bg-bone-raised hover:text-ink',
              )}
            >
              {label}
            </Link>
          )
        })}
      </nav>
    )
  }

  return (
    <div className="min-h-dvh bg-bone">
      <header className="sticky top-0 z-40 border-b border-line bg-bone/95 backdrop-blur-sm">
        <div className="flex h-12 items-center gap-3 px-4 lg:px-6">
          <button
            type="button"
            className="rounded-md p-1.5 text-graphite lg:hidden"
            aria-label="Open section menu"
            onClick={() => setSectionRailOpen(true)}
          >
            <Menu className="size-5" />
          </button>
          <RelayBrand />
          <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto lg:flex" aria-label="Primary">
            {topItems.map((item) => {
              const active = section === item.id
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'shrink-0 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                    active ? 'bg-bone-raised text-ink' : 'text-graphite hover:text-ink',
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <kbd className="hidden items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[9px] text-stone sm:inline-flex">
              <Command className="size-2.5" aria-hidden />
              K
            </kbd>
            <div className="hidden md:block">
              <ProfileSwitcher role={role} compact />
            </div>
            {sendCounter}
            <NotificationCenter />
            <ThemeToggle className="rounded-md p-1 text-graphite hover:bg-bone-raised" />
            <Link
              href="/settings"
              className="rounded-md p-1.5 text-graphite hover:bg-bone-raised hover:text-ink"
              title="Settings"
            >
              <Settings className="size-4" />
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              className="hidden rounded-md p-1.5 text-graphite hover:bg-bone-raised sm:block"
              title="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
        <div className="flex border-t border-line/70 px-4 py-2 md:hidden">
          <ProfileSwitcher role={role} className="w-full max-w-none" />
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-line/70 px-4 py-2 lg:hidden" aria-label="Primary mobile">
          {topItems.map((item) => {
            const active = section === item.id
            return (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1 text-[12px] font-medium',
                  active ? 'bg-solid text-on-solid' : 'border border-line text-graphite',
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </header>

      <div className="lg:grid lg:grid-cols-[12.5rem_1fr]">
        <aside className="hidden min-h-[calc(100dvh-3rem)] border-r border-line lg:flex lg:flex-col">
          {renderSectionRail()}
          <div className="mt-auto border-t border-line px-3 py-3">
            <IdentityChip name={repName} subtitle={`${ROLE_LABEL[role]} · ${organizationName}`} />
            <p className="mt-2 text-[9px] text-stone/50">v{APP_VERSION}</p>
          </div>
        </aside>

        <main className="mx-auto w-full max-w-6xl px-5 py-6 pb-24 lg:px-8 lg:pb-8">
          <div className="mb-6 hidden border-b border-line pb-2.5 lg:block">
            <AppBackButton />
          </div>
          {children}
        </main>
      </div>

      {sectionRailOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/30" aria-hidden onClick={() => setSectionRailOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-bone-raised shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="text-[13px] font-medium capitalize text-ink">{section}</span>
              <button type="button" aria-label="Close" onClick={() => setSectionRailOpen(false)}>
                <X className="size-5" />
              </button>
            </div>
            {renderSectionRail(() => setSectionRailOpen(false))}
          </div>
        </div>
      )}

    </div>
  )
}
