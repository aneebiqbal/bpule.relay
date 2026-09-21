'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  CalendarDays,
  Target,
  Briefcase,
  MessageSquare,
  PenLine,
  UserCircle2,
  Shield,
  Settings,
  LogOut,
  ChevronDown,
  Command,
  Menu,
  X,
  BarChart3,
  TrendingUp,
  Users,
} from 'lucide-react'
import { cn } from 'cn'
import { RelayBrand } from '@/components/brand'
import { IdentityChip } from '@/components/identity-chip'
import { ThemeToggle } from '@/components/theme-toggle'
import { APP_VERSION } from '@/lib/version'
import type { RepRole } from '@/lib/domain/types'

const WORK_NAV = [
  { href: '/dashboard', label: 'Today', icon: CalendarDays, exact: true },
  { href: '/leads', label: 'Leads', icon: Target, exact: false },
  { href: '/inbound', label: 'Inbound', icon: MessageSquare, exact: false },
  { href: '/upwork', label: 'Jobs', icon: Briefcase, exact: false },
  { href: '/relay', label: 'Conversations', icon: MessageSquare, exact: false },
]

const TEAM_NAV = [
  { href: '/team', label: 'My Team', icon: Users, exact: false },
]

const CREATE_NAV = [
  { href: '/content', label: 'Studio', icon: PenLine, exact: false, studio: true },
]

const GROWTH_NAV = [
  { href: '/content/growth', label: 'Relay Growth', icon: TrendingUp, exact: true },
]

const INTELLIGENCE_NAV = [
  { href: '/profiles', label: 'Profiles', icon: UserCircle2, exact: false },
  { href: '/facts', label: 'Proof', icon: Shield, exact: false },
  { href: '/relay/benchmark', label: 'Benchmark', icon: Shield, exact: true },
]

const ACCOUNT_NAV = [
  { href: '/usage', label: 'Usage', icon: Target, exact: false },
  { href: '/account', label: 'Settings', icon: Settings, exact: false },
]

const ADMIN_EXTRA = [
  { href: '/admin/command-center', label: 'Command', icon: Shield, exact: true },
  { href: '/admin/people', label: 'People', icon: Users, exact: true },
  { href: '/admin/revenue-intelligence', label: 'Revenue', icon: BarChart3, exact: true },
  { href: '/admin/revenue-identities', label: 'Identities', icon: UserCircle2, exact: true },
  { href: '/admin/targets', label: 'Targets', icon: Target, exact: true },
]

const ROLE_LABEL: Record<RepRole, string> = {
  admin: 'Admin',
  rep: 'Rep',
  sourcer: 'Sourcer',
  manager: 'Manager',
}

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; exact: boolean; studio?: boolean }
type NavSectionProps = { label: string; items: NavItem[]; isActive: (href: string, exact: boolean) => boolean; studio?: boolean }

function NavSection({ label, items, isActive, studio }: NavSectionProps) {
  return (
    <div>
      <div className="mb-1 px-2 pt-1">
        <span className="text-label text-stone">{label}</span>
      </div>
      {items.map(({ href, label: itemLabel, icon: Icon, exact }) => {
        const active = isActive(href, exact)
        return (
          <Link
            key={href}
            href={href}
            prefetch={false}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-all duration-150',
              active
                ? studio
                  ? 'bg-cobalt text-bone shadow-cobalt'
                  : 'bg-ink text-bone'
                : 'text-graphite hover:bg-bone-raised hover:text-ink',
            )}
          >
            <Icon
              className={cn(
                'size-3.5 shrink-0 transition-colors',
                active
                  ? 'text-bone'
                  : studio
                    ? 'text-cobalt/60 group-hover:text-cobalt'
                    : 'text-stone group-hover:text-ink',
              )}
              aria-hidden="true"
              strokeWidth={active ? 2 : 1.7}
            />
            <span>{itemLabel}</span>
          </Link>
        )
      })}
    </div>
  )
}

function MobileNavSection({ label, items, isActive, studio, onNavigate }: NavSectionProps & { onNavigate?: () => void }) {
  return (
    <div>
      <div className="mb-1 px-2 pt-1">
        <span className="text-label text-stone">{label}</span>
      </div>
      {items.map(({ href, label: itemLabel, icon: Icon, exact }) => {
        const active = isActive(href, exact)
        return (
          <Link
            key={href}
            href={href}
            prefetch={false}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-all duration-150',
              active
                ? studio
                  ? 'bg-cobalt text-bone'
                  : 'bg-ink text-bone'
                : 'text-graphite hover:bg-bone-raised hover:text-ink',
            )}
          >
            <Icon
              className={cn(
                'size-4 shrink-0 transition-colors',
                active
                  ? 'text-bone'
                  : studio
                    ? 'text-cobalt/60 group-hover:text-cobalt'
                    : 'text-stone group-hover:text-ink',
              )}
              aria-hidden="true"
              strokeWidth={active ? 2 : 1.7}
            />
            <span>{itemLabel}</span>
          </Link>
        )
      })}
    </div>
  )
}

export interface AppRailProps {
  repName: string
  organizationName: string
  role: RepRole
  calibrated: boolean
  demo: boolean
  todaySends: number
  dailyLimit: number
  revenueIdentities: Array<{
    id: string
    identityName: string
    title: string | null
    channel: string
  }>
}

export function AppRail({
  repName,
  organizationName,
  role,
  demo,
  todaySends,
  dailyLimit,
  revenueIdentities,
}: AppRailProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [sends, setSends] = useState(todaySends)
  const [identityOpen, setIdentityOpen] = useState(false)
  const [activeIdentityId, setActiveIdentityId] = useState<string | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const key = 'relay-active-identity'
    try {
      const saved = localStorage.getItem(key)
      if (saved && revenueIdentities.some((identity) => identity.id === saved)) {
        setActiveIdentityId(saved)
        return
      }
    } catch {
      // Ignore local storage failures.
    }

    if (revenueIdentities[0]) {
      setActiveIdentityId(revenueIdentities[0].id)
    }
  }, [revenueIdentities])

  const activeIdentity = revenueIdentities.find((identity) => identity.id === activeIdentityId) ?? revenueIdentities[0] ?? null

  useEffect(() => {
    let cancelled = false
    const fetchStatus = () => {
      fetch('/api/me/status')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d && typeof d.todaySends === 'number') {
            setSends(d.todaySends)
          }
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

  function selectIdentity(identityId: string) {
    setActiveIdentityId(identityId)
    setIdentityOpen(false)
    try {
      localStorage.setItem('relay-active-identity', identityId)
    } catch {
      // Ignore local storage failures.
    }
  }

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

  const handleMobileNavigate = () => {
    setMobileMenuOpen(false)
  }

  return (
    <>
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-bone/95 backdrop-blur-sm lg:hidden">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation"
              className="rounded-md p-1.5 text-graphite transition-colors hover:bg-bone-raised hover:text-ink"
            >
              <Menu className="size-5" />
            </button>
            <RelayBrand />
          </div>
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
        {activeIdentity && (
          <div className="border-t border-line/60 px-4 py-1">
            <p className="truncate text-mono-medium text-[9px] uppercase tracking-[0.12em] text-stone">
              Working as {activeIdentity.identityName} / {activeIdentity.channel.toUpperCase()}
            </p>
          </div>
        )}
      </header>

      {/* Mobile navigation drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/30 fade-in"
            style={{ backdropFilter: "blur(4px)" }}
            aria-hidden="true"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-bone-raised shadow-xl slide-in-right">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <RelayBrand />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation"
                className="rounded-md p-1 text-graphite transition-colors hover:bg-bone hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2.5 py-3" aria-label="Mobile">
              <MobileNavSection label="Work" items={WORK_NAV} isActive={isActive} onNavigate={handleMobileNavigate} />
              {(role === 'admin' || role === 'manager') && (
                <div className="mt-3">
                  <MobileNavSection label="Team" items={TEAM_NAV} isActive={isActive} onNavigate={handleMobileNavigate} />
                </div>
              )}
              <div className="mt-3">
                <MobileNavSection label="Create" items={CREATE_NAV} isActive={isActive} studio onNavigate={handleMobileNavigate} />
                {role === 'admin' && (
                  <div className="mt-3">
                    <MobileNavSection label="Growth" items={GROWTH_NAV} isActive={isActive} onNavigate={handleMobileNavigate} />
                  </div>
                )}
              </div>
              <div className="mt-3">
                <MobileNavSection label="Intelligence" items={INTELLIGENCE_NAV} isActive={isActive} onNavigate={handleMobileNavigate} />
              </div>
              {role === 'admin' && (
                <div className="mt-3">
                  <MobileNavSection label="Admin" items={ADMIN_EXTRA} isActive={isActive} onNavigate={handleMobileNavigate} />
                </div>
              )}
              <div className="mt-3">
                <MobileNavSection label="Account" items={ACCOUNT_NAV} isActive={isActive} onNavigate={handleMobileNavigate} />
              </div>
            </nav>
            <div className="border-t border-line px-3 py-3 space-y-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIdentityOpen((open) => !open)}
                  className="group flex w-full items-center justify-between rounded-md border border-line bg-bone px-2 py-2 text-left hover:border-orange/30"
                >
                  <div className="min-w-0">
                    <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Working as</p>
                    {activeIdentity ? (
                      <>
                        <p className="truncate text-[12px] font-medium text-ink">{activeIdentity.identityName}</p>
                        <p className="truncate text-[10px] text-graphite">
                          {[activeIdentity.title, activeIdentity.channel.toUpperCase()].filter(Boolean).join(' / ')}
                        </p>
                      </>
                    ) : (
                      <p className="truncate text-[11px] text-graphite">No identity assigned</p>
                    )}
                  </div>
                  <ChevronDown className={cn('size-3.5 shrink-0 text-stone transition-transform', identityOpen && 'rotate-180')} />
                </button>

                {identityOpen && (
                  <div className="absolute right-0 bottom-[calc(100%+0.4rem)] z-20 w-full rounded-md border border-line bg-bone-raised p-1.5 shadow-lg">
                    {revenueIdentities.length === 0 ? (
                      <p className="px-2 py-1 text-[11px] text-graphite">
                        {role === 'admin' ? 'No active identities yet.' : 'No assigned identities yet.'}
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {revenueIdentities.map((identity) => {
                          const selected = identity.id === activeIdentity?.id
                          return (
                            <button
                              key={identity.id}
                              type="button"
                              onClick={() => selectIdentity(identity.id)}
                              className={cn(
                                'w-full rounded px-2 py-1.5 text-left transition-colors',
                                selected ? 'bg-ink text-bone' : 'hover:bg-bone',
                              )}
                            >
                              <p className="truncate text-[12px] font-medium">{identity.identityName}</p>
                              <p className={cn('truncate text-[10px]', selected ? 'text-bone/70' : 'text-graphite')}>
                                {[identity.title, identity.channel.toUpperCase()].filter(Boolean).join(' / ')}
                              </p>
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {role === 'admin' && (
                      <Link
                        href="/admin/revenue-identities"
                        onClick={() => setIdentityOpen(false)}
                        className="mt-1.5 block rounded border border-line px-2 py-1 text-center text-[11px] font-medium text-ink hover:bg-bone"
                      >
                        Manage identities
                      </Link>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 px-1">
                <IdentityChip name={repName} subtitle={`${ROLE_LABEL[role]} · ${organizationName}`} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-56 lg:flex-col lg:border-r lg:border-line">
        <div className="space-y-1 px-4 py-4">
          <div className="flex items-center justify-between">
            <RelayBrand />
            <kbd className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-mono-medium text-[9px] text-stone">
              <Command className="size-2.5" />K
            </kbd>
          </div>
          <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Relay / Capture</p>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 pb-3">
          <NavSection label="Work" items={WORK_NAV} isActive={isActive} />
          {(role === 'admin' || role === 'manager') && (
            <div className="mt-3">
              <NavSection label="Team" items={TEAM_NAV} isActive={isActive} />
            </div>
          )}
          <div className="mt-3">
            <NavSection label="Create" items={CREATE_NAV} isActive={isActive} studio />
            {role === 'admin' && (
              <div className="mt-3">
                <NavSection label="Growth" items={GROWTH_NAV} isActive={isActive} />
              </div>
            )}
          </div>
          <div className="mt-3">
            <NavSection label="Intelligence" items={INTELLIGENCE_NAV} isActive={isActive} />
          </div>
          {role === 'admin' && (
            <div className="mt-3">
              <NavSection label="Admin" items={ADMIN_EXTRA} isActive={isActive} />
            </div>
          )}
          <div className="mt-3">
            <NavSection label="Account" items={ACCOUNT_NAV} isActive={isActive} />
          </div>
        </nav>

        <div className="border-t border-line px-3 py-3 space-y-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setIdentityOpen((open) => !open)}
              className="group flex w-full items-center justify-between rounded-md border border-line bg-bone-raised px-2 py-2 text-left hover:border-orange/30"
            >
              <div className="min-w-0">
                <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Working as</p>
                {activeIdentity ? (
                  <>
                    <p className="truncate text-[12px] font-medium text-ink">{activeIdentity.identityName}</p>
                    <p className="truncate text-[10px] text-graphite">
                      {[activeIdentity.title, activeIdentity.channel.toUpperCase()].filter(Boolean).join(' / ')}
                    </p>
                  </>
                ) : (
                  <p className="truncate text-[11px] text-graphite">No identity assigned</p>
                )}
              </div>
              <ChevronDown className={cn('size-3.5 shrink-0 text-stone transition-transform', identityOpen && 'rotate-180')} />
            </button>

            {identityOpen && (
              <div className="absolute right-0 bottom-[calc(100%+0.4rem)] z-20 w-full rounded-md border border-line bg-bone-raised p-1.5 shadow-lg">
                {revenueIdentities.length === 0 ? (
                  <p className="px-2 py-1 text-[11px] text-graphite">
                    {role === 'admin' ? 'No active identities yet.' : 'No assigned identities yet.'}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {revenueIdentities.map((identity) => {
                      const selected = identity.id === activeIdentity?.id
                      return (
                        <button
                          key={identity.id}
                          type="button"
                          onClick={() => selectIdentity(identity.id)}
                          className={cn(
                            'w-full rounded px-2 py-1.5 text-left transition-colors',
                            selected ? 'bg-ink text-bone' : 'hover:bg-bone',
                          )}
                        >
                          <p className="truncate text-[12px] font-medium">{identity.identityName}</p>
                          <p className={cn('truncate text-[10px]', selected ? 'text-bone/70' : 'text-graphite')}>
                            {[identity.title, identity.channel.toUpperCase()].filter(Boolean).join(' / ')}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                )}

                {role === 'admin' && (
                  <Link
                    href="/admin/revenue-identities"
                    onClick={() => setIdentityOpen(false)}
                    className="mt-1.5 block rounded border border-line px-2 py-1 text-center text-[11px] font-medium text-ink hover:bg-bone"
                  >
                    Manage identities
                  </Link>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 px-1">
            <IdentityChip name={repName} subtitle={`${ROLE_LABEL[role]} · ${organizationName}`} />
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
          {[
            { href: '/dashboard', label: 'Today', icon: CalendarDays, exact: true },
            { href: '/leads', label: 'Leads', icon: Target, exact: false },
            { href: '/content', label: 'Studio', icon: PenLine, exact: false, studio: true },
            { href: '/account', label: 'Account', icon: Settings, exact: false },
          ].map(({ href, label, icon: Icon, exact, studio }) => {
            const active = isActive(href, exact)
            return (
              <Link
                key={href}
                href={href}
                prefetch={false}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors',
                  active ? 'text-ink' : 'text-graphite hover:text-ink',
                )}
              >
                {active && (
                  <span className={cn('absolute top-0 left-1/2 h-[2px] w-5 -translate-x-1/2 rounded-full', studio ? 'bg-cobalt' : 'bg-orange')} />
                )}
                <Icon
                  className={cn('size-[18px] transition-all', active ? (studio ? 'text-cobalt' : 'text-orange') : '')}
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
