'use client'

/**
 * Relay V4 app shell — ONE primary navigation system.
 *
 *   HEADER        search, create, notifications, account
 *   SIDEBAR       the product domains, always visible on desktop
 *   SECTION TABS  the active domain's sections, inside the work surface
 *   WORK          the active workspace, full width
 *
 * There is no second sidebar and no global tab bar: the sidebar is the only
 * navigation, and section tabs belong to the page they switch. At desktop
 * sizes the work surface owns ~85% of the width.
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Command, Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { cn } from 'cn'
import { RelayBrand } from '@/components/brand'
import { NotificationCenter } from '@/components/notification-center'
import { GlobalCreateMenu } from '@/components/shell/global-create-menu'
import { UserMenu } from '@/components/shell/user-menu'
import { useCommandPalette } from '@/components/command-palette'
import {
  PRIMARY_MAIN_IDS,
  mobileNavItems,
  moreSheetSections,
  pageOwnsSubNav,
  resolvePrimaryActiveId,
  resolveSecondaryActiveId,
  secondaryGroups,
  visibleDomains,
  type RelayNavDomain,
  type RelayNavRoleFlags,
} from '@/lib/navigation/relay-shell-nav'
import { sidebarBadge, type SidebarCounts } from '@/lib/operations/sidebar-counts'
import type { RepRole } from '@/lib/domain/types'

export interface V4AppShellProps {
  organizationName: string
  repName: string
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

const COLLAPSE_KEY = 'relay.v4.collapsed'

function domainBadge(id: RelayNavDomain, counts?: SidebarCounts) {
  if (id === 'inbox') return sidebarBadge(counts?.inboxNeedsReply)
  if (id === 'work') return sidebarBadge(counts?.actionableTasks)
  return null
}

export function V4AppShell({
  organizationName,
  repName,
  role,
  isOwner,
  isAdmin,
  isManager,
  demo,
  todaySends,
  dailyLimit,
  sidebarCounts,
  children,
}: V4AppShellProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [navOpen, setNavOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const { setOpen: openPalette } = useCommandPalette()

  const roleFlags: RelayNavRoleFlags = useMemo(
    () => ({ isOwner, isAdmin, isManager }),
    [isOwner, isAdmin, isManager],
  )

  const search = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams])
  const activeDomain = resolvePrimaryActiveId(pathname, roleFlags)
  const domains = useMemo(() => visibleDomains(roleFlags), [roleFlags])
  const mobileItems = useMemo(() => mobileNavItems(roleFlags), [roleFlags])
  const moreSections = useMemo(() => moreSheetSections(roleFlags), [roleFlags])

  const main = domains.filter((d) => PRIMARY_MAIN_IDS.includes(d.id))
  const utility = domains.filter((d) => !PRIMARY_MAIN_IDS.includes(d.id))

  const secondary = activeDomain ? secondaryGroups(activeDomain, roleFlags) : []
  const activeSecondaryId = activeDomain
    ? resolveSecondaryActiveId(activeDomain, pathname, search, roleFlags)
    : null
  const showSectionTabs = Boolean(
    activeDomain &&
      secondary.length > 0 &&
      !pageOwnsSubNav(pathname),
  )

  useEffect(() => {
    try {
      if (localStorage.getItem(COLLAPSE_KEY) === '1') setCollapsed(true)
    } catch {
      /* storage unavailable */
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

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      } catch {
        /* storage unavailable */
      }
      return next
    })
  }

  function renderDomainNav(onNavigate?: () => void) {
    const renderItem = (item: (typeof domains)[number]) => {
      const active = activeDomain === item.id
      const badge = domainBadge(item.id, sidebarCounts)
      const Icon = item.icon
      return (
        <Link
          key={item.id}
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? 'page' : undefined}
          aria-label={collapsed ? (badge ? `${item.label}, ${badge.value} needing attention` : item.label) : undefined}
          title={collapsed ? item.label : undefined}
          className={cn(
            'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors',
            active ? 'bg-bone-raised text-ink shadow-sm' : 'text-graphite hover:bg-bone-raised hover:text-ink',
          )}
        >
          {active && (
            <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-orange" aria-hidden />
          )}
          <Icon className="size-4 shrink-0" aria-hidden strokeWidth={active ? 2 : 1.75} />
          <span className={cn('flex-1 truncate text-left', collapsed && 'hidden')}>{item.label}</span>
          {badge && !collapsed && (
            <span className="rounded-full bg-orange-faint px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-orange-dark">
              {badge.label}
            </span>
          )}
          {badge && collapsed && (
            <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-orange" aria-hidden />
          )}
        </Link>
      )
    }
    return (
      <nav className="flex flex-col gap-0.5 px-2 py-2" aria-label="Domains">
        {main.map(renderItem)}
        {utility.length > 0 && <div className="my-2 border-t border-line" aria-hidden />}
        {utility.map(renderItem)}
      </nav>
    )
  }

  function renderSectionTabs() {
    if (!showSectionTabs || !activeDomain) return null
    const config = domains.find((d) => d.id === activeDomain)
    if (!config) return null
    return (
      <div className="mb-5 overflow-x-auto">
        <nav
          aria-label={`${config.label} sections`}
          className="flex min-w-max items-center gap-0.5 rounded-xl bg-bone p-0.5 ring-1 ring-line"
        >
          {secondary.map((group) => (
            <div key={group.label ?? 'default'} className="flex items-center gap-0.5">
              {group.label && (
                <span className="mr-1 hidden px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-stone lg:block">
                  {group.label}
                </span>
              )}
              {group.items.map((item) => {
                const active = activeSecondaryId === item.id
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    aria-current={activeSecondaryId === item.id ? 'page' : undefined}
                    className={cn(
                      'whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12px] transition-colors',
                      active
                        ? 'bg-bone-raised font-medium text-ink shadow-sm'
                        : 'text-graphite hover:bg-bone-raised hover:text-ink',
                    )}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>
      </div>
    )
  }

  function renderMobileNav() {
    return (
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
              <span className={cn('h-0.5 w-6 rounded-full', active ? 'bg-orange' : 'bg-transparent')} aria-hidden />
              {item.label}
            </Link>
          )
        })}
      </nav>
    )
  }

  function renderMoreSheet() {
    if (!moreOpen) return null
    return (
      <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="More navigation">
        <div className="absolute inset-0 bg-ink/30" aria-hidden onClick={() => setMoreOpen(false)} />
        <div className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-2xl border-t border-line bg-bone shadow-xl">
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
        <div className="flex h-12 items-center gap-2 px-4 sm:px-5">
          <button
            type="button"
            className="rounded-md p-1.5 text-graphite hover:bg-bone-raised lg:hidden"
            aria-label="Open navigation"
            onClick={() => setNavOpen(true)}
          >
            <Menu className="size-5" />
          </button>
          <Link href="/dashboard" className="shrink-0" aria-label="Relay home">
            <RelayBrand />
          </Link>

          <button
            type="button"
            onClick={() => openPalette(true)}
            className="ml-2 hidden min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-bone-raised px-2.5 py-1.5 text-left text-[12px] text-stone transition-colors hover:text-ink sm:flex sm:max-w-xs"
          >
            <Command className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">Search Relay</span>
            <kbd className="ml-auto hidden items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[9px] text-stone md:inline-flex">
              K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <GlobalCreateMenu isAdmin={isAdmin || isOwner} isManager={isManager} />
            <NotificationCenter />
            <UserMenu
              name={repName}
              role={role}
              organizationName={organizationName}
              demo={demo}
              sends={todaySends}
              dailyLimit={dailyLimit}
            />
          </div>
        </div>
      </header>

      <div className="lg:flex">
        <aside
          className={cn(
            'sticky top-12 hidden h-[calc(100dvh-3rem)] shrink-0 flex-col border-r border-line bg-bone lg:flex',
            collapsed ? 'lg:w-[68px]' : 'lg:w-[216px]',
          )}
          aria-label="Primary navigation"
        >
          <div className="min-h-0 flex-1 overflow-y-auto">{renderDomainNav()}</div>
          <div className="border-t border-line p-2">
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-graphite transition-colors hover:bg-bone-raised hover:text-ink',
                collapsed && 'justify-center px-0',
              )}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4 shrink-0" aria-hidden />
              ) : (
                <PanelLeftClose className="size-4 shrink-0" aria-hidden />
              )}
              {!collapsed && <span>Collapse</span>}
            </button>
          </div>
        </aside>

        {/* min-w-0: a flex item defaults to min-width:auto, so a wide table would
            widen the page instead of scrolling in its own container. */}
        <main className="mx-auto w-full min-w-0 max-w-[1600px] flex-1 px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:pb-10">
          {renderSectionTabs()}
          {children}
        </main>
      </div>

      {renderMobileNav()}
      {renderMoreSheet()}

      {navOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-ink/30" aria-hidden onClick={() => setNavOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col bg-bone shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="text-[13px] font-medium text-ink">Relay</span>
              <button type="button" aria-label="Close" autoFocus onClick={() => setNavOpen(false)}>
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              {renderDomainNav(() => setNavOpen(false))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
