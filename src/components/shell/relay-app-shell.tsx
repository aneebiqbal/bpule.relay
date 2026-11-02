'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Command, LogOut, Menu, ShieldCheck, X } from 'lucide-react'
import { cn } from 'cn'
import { RelayBrand } from '@/components/brand'
import { NotificationCenter } from '@/components/notification-center'
import { ThemeToggle } from '@/components/theme-toggle'
import { AppBackButton } from '@/components/app-back-button'
import { ProfileSwitcher } from '@/components/shell/profile-switcher'
import { GlobalCreateMenu } from '@/components/shell/global-create-menu'
import { V3Avatar } from '@/components/v3/primitives'
import { useCommandPalette } from '@/components/command-palette'
import {
  detectRelayShellSection,
  resolveV3SidebarActiveId,
  v3MobileNavItems,
  v3SidebarItems,
  type RelayNavRoleFlags,
} from '@/lib/navigation/relay-shell-nav'
import { APP_VERSION } from '@/lib/version'
import type { RepRole } from '@/lib/domain/types'

export interface RelayAppShellProps {
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

export function RelayAppShell({
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
  const [navOpen, setNavOpen] = useState(false)
  const { setOpen: openPalette } = useCommandPalette()

  const roleFlags: RelayNavRoleFlags = useMemo(
    () => ({ isOwner, isAdmin, isManager }),
    [isOwner, isAdmin, isManager],
  )

  const section = detectRelayShellSection(pathname)
  // One canonical answer per surface: never two items lit at once.
  const activeSidebarId = resolveV3SidebarActiveId(pathname, roleFlags)
  const sidebarBase = useMemo(
    () => v3SidebarItems(roleFlags).filter((item) => item.id !== 'settings' && item.id !== 'admin'),
    [roleFlags],
  )
  const sidebarFooter = useMemo(
    () => v3SidebarItems(roleFlags).filter((item) => item.id === 'settings' || item.id === 'admin'),
    [roleFlags],
  )
  const mobileItems = useMemo(() => v3MobileNavItems(roleFlags), [roleFlags])

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
      const { getBrowserAuth } = await import('@/lib/auth/browser')
      const auth = await getBrowserAuth()
      await auth.signOut()
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

  function renderSidebarNav(onNavigate?: () => void) {
    return (
      <nav className="flex flex-col gap-0.5 px-3 py-4" aria-label="Sidebar">
        {sidebarBase.map((item) => {
          const active = activeSidebarId === item.id
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                active ? 'bg-solid text-on-solid' : 'text-graphite hover:bg-bone-raised hover:text-ink',
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    )
  }

  function renderSecondaryNav() {
    return (
      <div className="mt-1 flex flex-col gap-0.5 border-t border-line px-3 py-3">
        {sidebarFooter.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            aria-current={activeSidebarId === item.id ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
              activeSidebarId === item.id
                ? 'bg-solid text-on-solid'
                : 'text-graphite hover:bg-bone-raised hover:text-ink',
            )}
          >
            {item.id === 'admin' && <ShieldCheck className="size-3.5" aria-hidden />}
            {item.label}
          </Link>
        ))}
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-bone pb-14 lg:pb-0">
      <header className="sticky top-0 z-40 border-b border-line bg-bone/95 backdrop-blur-sm">
        <div className="flex h-12 items-center gap-2 px-4 lg:gap-3 lg:px-6">
          <button
            type="button"
            className="rounded-md p-1.5 text-graphite hover:bg-bone-raised lg:hidden"
            aria-label="Open navigation"
            onClick={() => setNavOpen(true)}
          >
            <Menu className="size-5" />
          </button>
          <RelayBrand />
          <button
            type="button"
            onClick={() => openPalette(true)}
            aria-label="Search Relay"
            className="ml-2 hidden min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-bone-raised px-2.5 py-1.5 text-left text-[12px] text-stone transition-colors hover:text-ink sm:flex sm:max-w-xs"
          >
            <Command className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">Search Relay...</span>
            <kbd className="ml-auto hidden items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[9px] text-stone md:inline-flex">
              K
            </kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <GlobalCreateMenu isAdmin={isAdmin || isOwner} />
            <NotificationCenter />
            <div className="hidden md:block">
              <ProfileSwitcher role={role} compact />
            </div>
            {sendCounter}
            <ThemeToggle className="rounded-md p-1 text-graphite hover:bg-bone-raised" />
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
        <div className="flex border-t border-line/70 px-4 py-2 lg:hidden">
          <ProfileSwitcher role={role} className="w-full max-w-none" />
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[14rem_1fr]">
        <aside className="sticky top-12 hidden h-[calc(100dvh-3rem)] self-start flex-col border-r border-line bg-bone lg:flex">
          <div className="border-b border-line px-3 py-3">
            <div className="flex items-center gap-2.5">
              <V3Avatar name={organizationName} />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-ink">{organizationName}</p>
                <p className="text-[10px] uppercase tracking-[0.14em] text-stone">Workspace</p>
              </div>
            </div>
          </div>
          {renderSidebarNav()}
          <div className="mt-auto space-y-2 border-t border-line px-3 py-3">
            {renderSecondaryNav()}
            <p className="text-[9px] text-stone/50">v{APP_VERSION}</p>
          </div>
        </aside>

        {/* min-w-0: a grid item defaults to min-width:auto, so a wide table would widen the page instead of scrolling in its own container. */}
        <main className="mx-auto w-full min-w-0 max-w-6xl px-5 py-6 pb-24 lg:px-8 lg:pb-8">
          <div className="mb-6 hidden border-b border-line pb-2.5 lg:block">
            <AppBackButton />
          </div>
          {children}
        </main>
      </div>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-bone-raised/95 backdrop-blur-sm lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {mobileItems.map((item) => {
          const active = section === item.id
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                active ? 'text-ink' : 'text-stone',
              )}
            >
              <span
                className={cn('h-0.5 w-6 rounded-full', active ? 'bg-orange' : 'bg-transparent')}
                aria-hidden
              />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {navOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/30" aria-hidden onClick={() => setNavOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-bone shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="text-[13px] font-medium capitalize text-ink">{section}</span>
              <button type="button" aria-label="Close" onClick={() => setNavOpen(false)}>
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {renderSidebarNav(() => setNavOpen(false))}
              {renderSecondaryNav()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
