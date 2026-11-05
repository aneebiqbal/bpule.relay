/**
 * Relay ERP navigation — one canonical, role-aware information architecture.
 *
 * Primary sidebar = domains ("where am I?"). Secondary rail = functions inside
 * the active domain ("what can I do here?"). Header = search, create,
 * notifications, account. Everything else belongs to the page.
 *
 * Exactly one primary and one secondary item is active; the resolvers below are
 * the single authority for that contract.
 */

import {
  House,
  Target,
  Inbox,
  ListChecks,
  Users,
  PenLine,
  BarChart3,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { INBOX_PRIMARY_VIEWS, inboxViewHref } from '@/lib/navigation/inbox-nav'

export type RelayNavDomain =
  | 'home'
  | 'sales'
  | 'inbox'
  | 'work'
  | 'team'
  | 'content'
  | 'insights'
  | 'settings'
  | 'admin'

export interface RelayNavRoleFlags {
  isOwner: boolean
  isAdmin: boolean
  isManager: boolean
}

export interface RelaySecondaryItem {
  id: string
  label: string
  /** May include a query string, e.g. `/leads?view=pipeline`. */
  href: string
  visible?: (role: RelayNavRoleFlags) => boolean
  /** Optional group heading inside the secondary rail. */
  group?: string
}

export interface RelayPrimaryDomain {
  id: RelayNavDomain
  label: string
  /** Representative href for the domain itself. */
  href: string
  icon: LucideIcon
  visible: (role: RelayNavRoleFlags) => boolean
  secondary: RelaySecondaryItem[]
}

const everyone = () => true
const managerUp = (role: RelayNavRoleFlags) => role.isManager || role.isAdmin || role.isOwner
const adminUp = (role: RelayNavRoleFlags) => role.isAdmin || role.isOwner
/** Managers only — admins reach the same surface through the Admin domain. */
const managerOnly = (role: RelayNavRoleFlags) => role.isManager && !role.isAdmin && !role.isOwner

export const NAV_DOMAINS: RelayPrimaryDomain[] = [
  {
    id: 'home',
    label: 'Home',
    href: '/dashboard',
    icon: House,
    visible: everyone,
    secondary: [],
  },
  {
    id: 'sales',
    label: 'Sales',
    href: '/leads',
    icon: Target,
    visible: everyone,
    secondary: [
      { id: 'prospects', label: 'Prospects', href: '/prospect', group: 'Prospecting' },
      { id: 'leads', label: 'Leads', href: '/leads', group: 'Prospecting' },
      { id: 'pipeline', label: 'Pipeline', href: '/leads?view=pipeline', group: 'Prospecting' },
      { id: 'companies', label: 'Companies', href: '/accounts', visible: adminUp, group: 'Prospecting' },
      { id: 'import', label: 'Import Leads', href: '/leads/import', group: 'Prospecting' },
      { id: 'upwork', label: 'Upwork', href: '/upwork', group: 'Channels' },
      { id: 'email', label: 'Email', href: '/revenue/email', group: 'Channels' },
    ],
  },
  {
    id: 'inbox',
    label: 'Inbox',
    href: '/chats',
    icon: Inbox,
    visible: everyone,
    // One canonical Inbox contract: the four primary views. Secondary
    // conditions live in the /chats Filters drawer, not in global navigation.
    secondary: INBOX_PRIMARY_VIEWS.map((view) => ({
      id: view.id,
      label: view.label,
      href: inboxViewHref(view.value),
    })),
  },
  {
    id: 'work',
    label: 'Work',
    href: '/tasks',
    icon: ListChecks,
    visible: everyone,
    secondary: [
      { id: 'my-tasks', label: 'My Tasks', href: '/tasks', group: 'Views' },
      { id: 'today', label: 'Today', href: '/tasks?view=today', group: 'Views' },
      { id: 'overdue', label: 'Overdue', href: '/tasks?view=overdue', group: 'Views' },
      { id: 'upcoming', label: 'Upcoming', href: '/tasks?view=upcoming', group: 'Views' },
      { id: 'completed', label: 'Completed', href: '/tasks?view=completed', group: 'Views' },
      { id: 'team-tasks', label: 'Team Tasks', href: '/tasks?scope=team', visible: managerUp, group: 'Team' },
    ],
  },
  {
    id: 'team',
    label: 'Team',
    href: '/team',
    icon: Users,
    visible: managerUp,
    secondary: [
      { id: 'overview', label: 'Overview', href: '/team' },
      { id: 'people', label: 'People', href: '/team/people' },
      { id: 'workload', label: 'Workload', href: '/team/workload' },
      { id: 'activity', label: 'Activity', href: '/team/activity' },
      { id: 'performance', label: 'Performance', href: '/team/performance' },
      { id: 'targets', label: 'Targets', href: '/team/targets' },
      { id: 'groups', label: 'Groups', href: '/team/groups' },
      { id: 'daily-operations', label: 'Daily Operations', href: '/admin/command', visible: managerOnly },
    ],
  },
  {
    id: 'content',
    label: 'Content',
    href: '/content',
    icon: PenLine,
    visible: everyone,
    secondary: [
      { id: 'studio', label: 'Studio', href: '/content' },
      { id: 'ideas', label: 'Ideas', href: '/content/ideas' },
      { id: 'growth', label: 'Growth', href: '/content/growth', visible: adminUp },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    href: '/reports/sales',
    icon: BarChart3,
    visible: everyone,
    secondary: [
      { id: 'sales-insights', label: 'Sales', href: '/reports/sales', group: 'Reports' },
      { id: 'pipeline-report', label: 'Pipeline', href: '/reports/pipeline', group: 'Reports' },
      { id: 'team-report', label: 'Team', href: '/reports/team', group: 'Reports' },
      { id: 'revenue-report', label: 'Revenue', href: '/reports/revenue', group: 'Reports' },
      { id: 'ai-usage', label: 'AI Usage', href: '/admin/ai-usage', visible: adminUp, group: 'System' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    href: '/settings',
    icon: Settings,
    visible: everyone,
    secondary: [
      { id: 'account', label: 'My Account', href: '/settings', group: 'Account' },
      { id: 'notifications', label: 'Notifications', href: '/notifications', group: 'Account' },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    href: '/admin/command',
    icon: ShieldCheck,
    visible: adminUp,
    secondary: [
      { id: 'command-center', label: 'Command Center', href: '/admin/command', group: 'Organization' },
      { id: 'people-roles', label: 'People & Roles', href: '/admin/people', group: 'Organization' },
      { id: 'profiles', label: 'Profiles', href: '/profile-intelligence', group: 'Organization' },
      { id: 'scoring-qa', label: 'Scoring QA', href: '/admin/scoring-qa', group: 'Quality' },
      { id: 'qa-trust', label: 'QA & Trust', href: '/admin/qa', group: 'Quality' },
      { id: 'dataset', label: 'Dataset', href: '/admin/dataset', group: 'System' },
      { id: 'training-data', label: 'Training Data', href: '/admin/training-data', group: 'System' },
      { id: 'admin-ai-usage', label: 'AI Usage', href: '/admin/ai-usage', group: 'System' },
      { id: 'revenue-intelligence', label: 'Revenue Intelligence', href: '/admin/revenue-intelligence', group: 'System' },
      { id: 'manage-profiles', label: 'Manage Profiles', href: '/manage-profiles', visible: (r) => r.isOwner, group: 'System' },
    ],
  },
]

/** Primary domains shown above the divider; Settings and Admin sit below it. */
export const PRIMARY_MAIN_IDS: RelayNavDomain[] = ['home', 'sales', 'inbox', 'work', 'team', 'content', 'insights']
export const PRIMARY_UTILITY_IDS: RelayNavDomain[] = ['settings', 'admin']

// ─── Domain resolution ──────────────────────────────────────────────────────

/**
 * Pathname → domain. Overrides run before the prefix table so routes that live
 * under an admin URL but belong to another domain resolve correctly.
 */
export function domainForPathname(pathname: string): RelayNavDomain | null {
  if (pathname === '/admin/command' || pathname.startsWith('/admin/command/')) return 'team'
  if (pathname.startsWith('/admin/ai-usage')) return 'insights'
  if (pathname.startsWith('/admin/revenue-intelligence')) return 'insights'

  if (pathname === '/dashboard') return 'home'
  if (pathname === '/chats' || pathname.startsWith('/chats/')) return 'inbox'
  if (pathname === '/inbound' || pathname.startsWith('/inbound/')) return 'inbox'
  if (pathname === '/relay' || pathname.startsWith('/relay/')) return 'inbox'
  if (pathname === '/tasks' || pathname.startsWith('/tasks/')) return 'work'
  if (pathname.startsWith('/team') || pathname.startsWith('/accountability')) return 'team'
  if (pathname.startsWith('/content') || pathname.startsWith('/studio')) return 'content'
  if (pathname.startsWith('/reports') || pathname.startsWith('/performance')) return 'insights'
  if (pathname === '/settings' || pathname === '/account' || pathname === '/notifications') return 'settings'
  if (
    pathname === '/accounts' ||
    pathname.startsWith('/accounts/') ||
    pathname.startsWith('/prospect') ||
    pathname.startsWith('/leads') ||
    pathname.startsWith('/upwork') ||
    pathname.startsWith('/archive') ||
    pathname.startsWith('/activate') ||
    pathname.startsWith('/revenue/email')
  ) {
    return 'sales'
  }
  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/profile-intelligence') ||
    pathname.startsWith('/profiles') ||
    pathname.startsWith('/manage-profiles') ||
    pathname.startsWith('/facts') ||
    pathname.startsWith('/workspace')
  ) {
    return 'admin'
  }
  return null
}

/** Record-detail routes hide the secondary rail so the page's own tabs are the only sub-nav. */
export function isRecordDetailPathname(pathname: string): boolean {
  return (
    /^\/leads\/[^/]+/.test(pathname) ||
    /^\/team\/[^/]+/.test(pathname) ||
    /^\/accounts\/[^/]+/.test(pathname) ||
    /^\/upwork\/[^/]+/.test(pathname) ||
    /^\/profile-intelligence\/[^/]+/.test(pathname)
  )
}

export function visibleDomains(role: RelayNavRoleFlags): RelayPrimaryDomain[] {
  return NAV_DOMAINS.filter((d) => d.visible(role))
}

export function secondaryItems(domain: RelayNavDomain, role: RelayNavRoleFlags): RelaySecondaryItem[] {
  const config = NAV_DOMAINS.find((d) => d.id === domain)
  if (!config || !config.visible(role)) return []
  return config.secondary.filter((item) => !item.visible || item.visible(role))
}

export interface RelaySecondaryGroup {
  label: string | null
  items: RelaySecondaryItem[]
}

/** Secondary items grouped for the contextual rail. Consecutive `group` values merge. */
export function secondaryGroups(domain: RelayNavDomain, role: RelayNavRoleFlags): RelaySecondaryGroup[] {
  const items = secondaryItems(domain, role)
  const groups: RelaySecondaryGroup[] = []
  for (const item of items) {
    const label = item.group ?? null
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(item)
    else groups.push({ label, items: [item] })
  }
  return groups
}

/** Exactly one active primary domain — the one whose routes contain this pathname. */
export function resolvePrimaryActiveId(
  pathname: string,
  role: RelayNavRoleFlags,
): RelayNavDomain | null {
  const domain = domainForPathname(pathname)
  if (!domain) return null
  return visibleDomains(role).some((d) => d.id === domain) ? domain : null
}

// ─── Secondary resolution ───────────────────────────────────────────────────

function splitHref(href: string): { path: string; params: URLSearchParams } {
  const [path, query] = href.split('?')
  return { path, params: new URLSearchParams(query ?? '') }
}

function matchesHref(
  href: string,
  pathname: string,
  search: URLSearchParams,
): { pathLen: number; paramCount: number } | null {
  const { path, params } = splitHref(href)
  const hasParams = params.toString().length > 0
  // A plain destination also owns its descendants (/leads owns /leads/:id), so a
  // record detail keeps its parent's context. Query-scoped destinations are
  // exact: /leads?view=pipeline must not claim /leads/import.
  const pathMatches = hasParams ? path === pathname : pathname === path || pathname.startsWith(`${path}/`)
  if (!pathMatches) return null
  for (const [key, value] of params) {
    if (search.get(key) !== value) return null
  }
  return { pathLen: path.length, paramCount: hasParams ? [...params.keys()].length : 0 }
}

/**
 * Exactly one active secondary item. Most specific match wins: longest path,
 * then most query params, then declaration order.
 */
export function resolveSecondaryActiveId(
  domain: RelayNavDomain,
  pathname: string,
  search: URLSearchParams,
  role: RelayNavRoleFlags,
): string | null {
  let best: { id: string; pathLen: number; paramCount: number } | null = null
  const items = secondaryItems(domain, role)
  for (const item of items) {
    const match = matchesHref(item.href, pathname, search)
    if (!match) continue
    if (
      !best ||
      match.pathLen > best.pathLen ||
      (match.pathLen === best.pathLen && match.paramCount > best.paramCount)
    ) {
      best = { id: item.id, pathLen: match.pathLen, paramCount: match.paramCount }
    }
  }
  if (best) return best.id
  // /chats with no view resolves immediately to the role default, so the
  // active state is correct without waiting for a URL normalization pass.
  if (domain === 'inbox' && !search.has('view')) {
    return managerUp(role) ? 'all' : 'needs-reply'
  }
  return null
}

export interface RelayBreadcrumb {
  domain: RelayNavDomain
  domainLabel: string
  itemLabel: string | null
}

/** Canonical breadcrumb, e.g. `{ domainLabel: 'Sales', itemLabel: 'Leads' }`. */
export function navBreadcrumb(
  pathname: string,
  search: URLSearchParams,
  role: RelayNavRoleFlags,
): RelayBreadcrumb | null {
  const domain = resolvePrimaryActiveId(pathname, role)
  if (!domain) return null
  const config = NAV_DOMAINS.find((d) => d.id === domain)!
  const activeId = resolveSecondaryActiveId(domain, pathname, search, role)
  const item = config.secondary.find((i) => i.id === activeId)
  return { domain, domainLabel: config.label, itemLabel: item ? item.label : null }
}

// ─── Mobile ─────────────────────────────────────────────────────────────────

export interface MobileNavItem {
  id: RelayNavDomain | 'more'
  label: string
  href: string
}

/** Five slots max. Everything else lives behind "More". */
export function mobileNavItems(role: RelayNavRoleFlags): MobileNavItem[] {
  const items: MobileNavItem[] = [
    { id: 'home', label: 'Home', href: '/dashboard' },
    { id: 'sales', label: 'Sales', href: '/leads' },
    { id: 'inbox', label: 'Inbox', href: '/chats' },
  ]
  if (managerUp(role)) items.push({ id: 'team', label: 'Team', href: '/team' })
  else items.push({ id: 'work', label: 'Work', href: '/tasks' })
  items.push({ id: 'more', label: 'More', href: '' })
  return items
}

/** Contents of the mobile "More" sheet — every role-valid domain and its functions. */
export function moreSheetSections(role: RelayNavRoleFlags): Array<{
  id: RelayNavDomain
  label: string
  href: string
  items: Array<{ id: string; label: string; href: string }>
}> {
  return visibleDomains(role)
    .filter((d) => d.id !== 'home' && d.id !== 'sales' && d.id !== 'inbox' && d.id !== 'team')
    .map((d) => ({
      id: d.id,
      label: d.label,
      href: d.href,
      items: secondaryItems(d.id, role),
    }))
}
