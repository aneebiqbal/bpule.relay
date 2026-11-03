'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Command, LogOut, Menu, X } from 'lucide-react'
import { cn } from 'cn'
import { RelayBrand } from '@/components/brand'
import { NotificationCenter } from '@/components/notification-center'
import { ThemeToggle } from '@/components/theme-toggle'
import { AppBackButton, hasAppParent } from '@/components/app-back-button'
import { ProfileSwitcher } from '@/components/shell/profile-switcher'
import { GlobalCreateMenu } from '@/components/shell/global-create-menu'
import { V3Avatar } from '@/components/v3/primitives'
import { useCommandPalette } from '@/components/command-palette'
import {
  mobileNavItems,
  moreSheetSections,
  navBreadcrumb,
  resolvePrimaryActiveId,
  resolveSecondaryActiveId,
  secondaryItems,
  visibleDomains,
  type RelayNavDomain,
  type RelayNavRoleFlags,
} from '@/lib/navigation/relay-shell-nav'
import { APP_VERSION } from '@/lib/version'
import { sidebarBadge, type SidebarCounts } from '@/lib/operations/sidebar-counts'
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
  sidebarCounts?: SidebarCounts
  children: React.ReactNode
}

/** Badge count per primary domain. Only Inbox and Work have counts. */
function domainBadge(id: RelayNavDomain, counts?: SidebarCounts) {
  if (id === 'inbox') return sidebarBadge(counts?.inboxNeedsReply)
  if (id === 'work') return sidebarBadge(counts?.actionableTasks)
  return null
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
  sidebarCounts,
  children,
}: RelayAppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [sends, setSends] = useState(todaySends)
  const [navOpen, setNavOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const { setOpen: openPalette } = useCommandPalette()

  const roleFlags: RelayNavRoleFlags = useMemo(
    () => ({ isOwner, isAdmin, isManager }),
    [isOwner, isAdmin, isManager],
  )

  const search = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams])
  const activeDomain = resolvePrimaryActiveId(pathname, roleFlags)
  const secondary = activeDomain ? secondaryItems(activeDomain, roleFlags) : []
  const activeSecondaryId = activeDomain
    ? resolveSecondaryActiveId(activeDomain, pathname, search, roleFlags)
    : null
  const breadcrumb = navBreadcrumb(pathname, search, roleFlags)
  const domains = useMemo(() => visibleDomains(roleFlags), [roleFlags])
  const mobileItems = useMemo(() => mobileNavItems(roleFlags), [roleFlags])
  const moreSections = useMemo(() => moreSheetSections(roleFlags), [roleFlags])

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

  useEffect(() => {
    if (!navOpen && !moreOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNavOpen(false)
        setMoreOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navOpen, moreOpen])

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

  function renderPrimaryNav(onNavigate?: () => void) {
    return (
      <nav className="flex flex-col gap-0.5 px-3 py-3" aria-label="Primary">
        {domains.map((item) => {
          const active = activeDomain === item.id
          const badge = domainBadge(item.id, sidebarCounts)
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              aria-label={badge ? `${item.label}, ${badge.value} needing attention` : undefined}
              className={cn(
                'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                active ? 'bg-solid text-on-solid' : 'text-graphite hover:bg-bone-raised hover:text-ink',
              )}
            >
              <span className="flex-1">{item.label}</span>
              {badge && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                    active ? 'bg-on-solid/20 text-on-solid' : 'bg-orange/15 text-orange',
                  )}
                >
                  {badge.label}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    )
  }

  function renderSecondaryRail() {
    if (!activeDomain || secondary.length === 0) return null
    const config = domains.find((d) => d.id === activeDomain)
    if (!config) return null
    return (
      <aside
        className="hidden w-56 shrink-0 border-r border-line bg-bone lg:block"
        aria-label={`${config.label} sections`}
      >
        <p className="px-4 pb-1 pt-4 text-[10px] font-medium uppercase tracking-[0.14em] text-stone">
          {config.label}
        </p>
        <nav className="flex flex-col gap-0.5 px-3 pb-4">
          {secondary.map((item) => {
            const active = activeSecondaryId === item.id
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-[13px] transition-colors',
                  active
                    ? 'bg-bone-raised font-medium text-ink'
                    : 'text-graphite hover:bg-bone-raised hover:text-ink',
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>
    )
  }

  function renderMoreSheet() {
    if (!moreOpen) return null
    return (
      <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="More navigation">
        <div className="absolute inset-0 bg-ink/30" aria-hidden onClick={() => setMoreOpen(false)} />
        <div className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-xl border-t border-line bg-bone shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-[13px] font-medium text-ink">More</span>
            <button type="button" aria-label="Close" autoFocus onClick={() => setMoreOpen(false)}>
              <X className="size-5" />
            </button>
          </div>
          <div className="px-4 py-3">
            {moreSections.map((section) => (
              <div key={section.id} className="pb-4">
                <Link
                  href={section.href}
                  onClick={() => setMoreOpen(false)}
                  className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone"
                >
                  {section.label}
                </Link>
                <div className="mt-1 flex flex-col">
                  {section.items.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className="rounded-md px-2 py-1.5 text-[13px] text-graphite hover:bg-bone-raised hover:text-ink"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
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
          {breadcrumb && (
            <nav
              aria-label="Breadcrumb"
              className="hidden min-w-0 items-center gap-1.5 text-[13px] md:flex"
            >
              <span className="text-stone">{breadcrumb.domainLabel}</span>
              {breadcrumb.itemLabel && (
                <>
                  <span className="text-stone" aria-hidden>
                    /
                  </span>
                  <span className="truncate font-medium text-ink">{breadcrumb.itemLabel}</span>
                </>
              )}
            </nav>
          )}
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

      <div className="lg:flex">
        <aside className="sticky top-12 hidden h-[calc(100dvh-3rem)] shrink-0 flex-col border-r border-line bg-bone lg:flex lg:w-52">
          <div className="border-b border-line px-3 py-3">
            <div className="flex items-center gap-2.5">
              <V3Avatar name={organizationName} />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-ink">{organizationName}</p>
                <p className="text-[10px] uppercase tracking-[0.14em] text-stone">Workspace</p>
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{renderPrimaryNav()}</div>
          <div className="border-t border-line px-3 py-3">
            <p className="text-[9px] text-stone">v{APP_VERSION}</p>
          </div>
        </aside>

        {renderSecondaryRail()}

        {/* min-w-0: a flex item defaults to min-width:auto, so a wide table would widen the page instead of scrolling in its own container. */}
        <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-5 py-6 pb-24 lg:px-8 lg:pb-8">
          {hasAppParent(pathname) && (
            <div className="mb-6 hidden border-b border-line pb-2.5 lg:block">
              <AppBackButton />
            </div>
          )}
          {children}
        </main>
      </div>

      <nav
        aria-label="Mobile"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-bone-raised/95 backdrop-blur-sm lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {mobileItems.map((item) => {
          if (item.id === 'more') {
            return (
              <button
                key="more"
                type="button"
                onClick={() => setMoreOpen(true)}
                className="flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-stone"
              >
                <span className="h-0.5 w-6 rounded-full bg-transparent" aria-hidden />
                More
              </button>
            )
          }
          const active = activeDomain === item.id
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

      {renderMoreSheet()}

      {navOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-ink/30" aria-hidden onClick={() => setNavOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-bone shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="text-[13px] font-medium capitalize text-ink">
                {breadcrumb?.domainLabel ?? 'Relay'}
              </span>
              <button type="button" aria-label="Close" autoFocus onClick={() => setNavOpen(false)}>
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {renderPrimaryNav(() => setNavOpen(false))}
              {activeDomain && secondary.length > 0 && (
                <div className="border-t border-line px-3 py-3">
                  <p className="px-2.5 pb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-stone">
                    {breadcrumb?.domainLabel}
                  </p>
                  {secondary.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => setNavOpen(false)}
                      aria-current={activeSecondaryId === item.id ? 'page' : undefined}
                      className={cn(
                        'block rounded-md px-2.5 py-1.5 text-[13px] transition-colors',
                        activeSecondaryId === item.id
                          ? 'bg-bone-raised font-medium text-ink'
                          : 'text-graphite hover:bg-bone-raised hover:text-ink',
                      )}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
