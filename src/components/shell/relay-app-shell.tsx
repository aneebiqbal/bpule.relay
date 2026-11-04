'use client'

/**
 * Relay app shell — the entire navigation architecture:
 *
 *   PRIMARY SIDEBAR   where am I in the product?      (domains, collapsible)
 *   SECONDARY SIDEBAR what can I do in this domain?   (contextual, one level)
 *   HEADER            search, create, notifications, account
 *   PAGE              actual work
 *
 * There is no third navigation layer. Page-local views use tabs or filters.
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Command, Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { cn } from 'cn'
import { RelayBrand } from '@/components/brand'
import { NotificationCenter } from '@/components/notification-center'
import { AppBackButton, hasAppParent } from '@/components/app-back-button'
import { GlobalCreateMenu } from '@/components/shell/global-create-menu'
import { UserMenu } from '@/components/shell/user-menu'
import { useCommandPalette } from '@/components/command-palette'
import {
  PRIMARY_MAIN_IDS,
  PRIMARY_UTILITY_IDS,
  isRecordDetailPathname,
  mobileNavItems,
  moreSheetSections,
  navBreadcrumb,
  resolvePrimaryActiveId,
  resolveSecondaryActiveId,
  secondaryGroups,
  visibleDomains,
  type RelayNavDomain,
  type RelayNavRoleFlags,
} from '@/lib/navigation/relay-shell-nav'
import { APP_VERSION } from '@/lib/version'
import { sidebarBadge, type SidebarCounts } from '@/lib/operations/sidebar-counts'
import type { RepRole } from '@/lib/domain/types'

export interface RelayAppShellProps {
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

const COLLAPSE_KEY = 'relay.primary.collapsed'

/** Badge count per primary domain. Only Inbox and Work have counts. */
function domainBadge(id: RelayNavDomain, counts?: SidebarCounts) {
  if (id === 'inbox') return sidebarBadge(counts?.inboxNeedsReply)
  if (id === 'work') return sidebarBadge(counts?.actionableTasks)
  return null
}

export function RelayAppShell({
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
}: RelayAppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
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
  const secondary = activeDomain ? secondaryGroups(activeDomain, roleFlags) : []
  const activeSecondaryId = activeDomain
    ? resolveSecondaryActiveId(activeDomain, pathname, search, roleFlags)
    : null
  const breadcrumb = navBreadcrumb(pathname, search, roleFlags)
  const domains = useMemo(() => visibleDomains(roleFlags), [roleFlags])
  const mobileItems = useMemo(() => mobileNavItems(roleFlags), [roleFlags])
  const moreSections = useMemo(() => moreSheetSections(roleFlags), [roleFlags])
  const secondaryFlat = useMemo(() => secondary.flatMap((g) => g.items), [secondary])

  const showSecondary = Boolean(activeDomain) && secondary.length > 0 && !isRecordDetailPathname(pathname)

  // Restore the persisted collapse state after mount so SSR and hydration agree.
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

  function renderPrimaryNav(onNavigate?: () => void) {
    const main = domains.filter((d) => PRIMARY_MAIN_IDS.includes(d.id))
    const utility = domains.filter((d) => PRIMARY_UTILITY_IDS.includes(d.id))
    const renderGroup = (items: typeof domains) =>
      items.map((item) => {
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
              'group relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
              active ? 'bg-bone-raised text-ink' : 'text-graphite hover:bg-bone-raised hover:text-ink',
            )}
          >
            {active && (
              <span
                className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-orange"
                aria-hidden
              />
            )}
            <Icon
              className="size-4 shrink-0"
              aria-hidden
              strokeWidth={active ? 2 : 1.75}
            />
            <span className={cn('flex-1 truncate text-left', collapsed && 'hidden')}>{item.label}</span>
            {badge && !collapsed && (
              <span
                aria-hidden
                className="ml-auto rounded-full bg-orange-faint px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-orange-dark"
              >
                {badge.label}
              </span>
            )}
            {badge && collapsed && (
              <span
                aria-hidden
                className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-orange"
              />
            )}
          </Link>
        )
      })

    return (
      <nav className="flex flex-col gap-0.5 px-2 py-2" aria-label="Domains">
        {renderGroup(main)}
        {utility.length > 0 && <div className="my-2 border-t border-line" aria-hidden />}
        {renderGroup(utility)}
      </nav>
    )
  }

  function renderSecondaryRail() {
    if (!showSecondary || !activeDomain) return null
    const config = domains.find((d) => d.id === activeDomain)
    if (!config) return null
    return (
      <aside
        className="hidden w-56 shrink-0 border-r border-line bg-bone xl:block"
        aria-label={`${config.label} sections`}
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {secondary.map((group, index) => (
            <div key={group.label ?? 'default'} className={index > 0 ? 'mt-3' : undefined}>
              {group.label && (
                <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-stone">
                  {group.label}
                </p>
              )}
              <nav className="flex flex-col gap-0.5" aria-label={group.label ?? undefined}>
                {group.items.map((item) => {
                  const active = activeSecondaryId === item.id
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'relative rounded-md px-2.5 py-1.5 text-[13px] transition-colors',
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
            </div>
          ))}
        </div>
      </aside>
    )
  }

  function renderMobileSectionTabs() {
    if (!showSecondary) return null
    return (
      <div className="w-full overflow-x-auto border-b border-line bg-bone px-3 py-2 xl:hidden">
        <div className="flex min-w-max gap-0.5" role="tablist" aria-label="Section">
          {secondaryFlat.map((item) => {
            const active = activeSecondaryId === item.id
            return (
              <Link
                key={item.id}
                href={item.href}
                role="tab"
                aria-selected={active}
                className={cn(
                  'whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12px] transition-colors',
                  active
                    ? 'bg-bone-raised font-medium text-ink'
                    : 'text-graphite hover:bg-bone-raised hover:text-ink',
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
      </div>
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
          <span className="lg:hidden">
            <RelayBrand />
          </span>
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
            className="ml-2 hidden min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-bone-raised px-2.5 py-1.5 text-left text-[12px] text-stone transition-colors hover:text-ink sm:flex sm:max-w-xs"
          >
            <Command className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">Search Relay</span>
            <kbd className="ml-auto hidden items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[9px] text-stone md:inline-flex">
              K
            </kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <GlobalCreateMenu isAdmin={isAdmin || isOwner} />
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
        {renderMobileSectionTabs()}
      </header>

      <div className="lg:flex">
        <aside
          className={cn(
            'sticky top-12 hidden h-[calc(100dvh-3rem)] shrink-0 flex-col border-r border-line bg-bone lg:flex',
            collapsed ? 'lg:w-[68px]' : 'lg:w-[216px]',
          )}
          aria-label="Primary navigation"
        >
          <div
            className={cn(
              'flex items-center gap-2 border-b border-line px-3 py-3',
              collapsed && 'justify-center px-0',
            )}
          >
            <RelayBrand />
            {!collapsed && <span className="text-[10px] text-stone">v{APP_VERSION}</span>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{renderPrimaryNav()}</div>
          <div className="border-t border-line p-2">
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-graphite transition-colors hover:bg-bone-raised hover:text-ink',
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
              <span className="text-[13px] font-medium text-ink">
                {breadcrumb?.domainLabel ?? 'Relay'}
              </span>
              <button type="button" aria-label="Close" autoFocus onClick={() => setNavOpen(false)}>
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {renderPrimaryNav(() => setNavOpen(false))}
              {showSecondary && (
                <div className="border-t border-line px-3 py-3">
                  {secondary.map((group) => (
                    <div key={group.label ?? 'default'} className="pb-2">
                      {group.label && (
                        <p className="px-2.5 pb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-stone">
                          {group.label}
                        </p>
                      )}
                      {group.items.map((item) => (
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
