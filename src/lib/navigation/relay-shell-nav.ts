/**
 * Relay ERP navigation — one canonical, role-aware information architecture.
 *
 * Primary sidebar = domains. Secondary rail = functions inside the active domain.
 * Every destination has exactly ONE label; aliases are resolved centrally so the
 * shell never lights two items at once.
 */

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
}

export interface RelayPrimaryDomain {
  id: RelayNavDomain
  label: string
  /** Representative href for the domain itself. */
  href: string
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
    visible: everyone,
    secondary: [],
  },
  {
    id: 'sales',
    label: 'Sales',
    href: '/leads',
    visible: everyone,
    secondary: [
      { id: 'prospects', label: 'Prospects', href: '/prospect' },
      { id: 'leads', label: 'Leads', href: '/leads' },
      { id: 'pipeline', label: 'Pipeline', href: '/leads?view=pipeline' },
      { id: 'import', label: 'Import Leads', href: '/leads/import' },
      { id: 'companies', label: 'Companies', href: '/accounts', visible: adminUp },
      { id: 'upwork', label: 'Upwork', href: '/upwork' },
      { id: 'email', label: 'Email', href: '/revenue/email' },
    ],
  },
  {
    id: 'inbox',
    label: 'Inbox',
    href: '/chats',
    visible: everyone,
    secondary: [
      { id: 'needs-reply', label: 'Needs reply', href: '/chats?view=waiting_me' },
      { id: 'waiting-them', label: 'Waiting on them', href: '/chats?view=waiting_them' },
      { id: 'followups', label: 'Follow-ups', href: '/chats?view=followups' },
      { id: 'meeting-requests', label: 'Meeting requests', href: '/chats?view=meeting_requests' },
      { id: 'proposal-requests', label: 'Proposal requests', href: '/chats?view=proposal_requests' },
      { id: 'closed', label: 'Closed', href: '/chats?view=closed' },
    ],
  },
  {
    id: 'work',
    label: 'Work',
    href: '/tasks',
    visible: everyone,
    secondary: [
      { id: 'tasks', label: 'Tasks', href: '/tasks' },
      { id: 'today', label: 'Today', href: '/tasks?view=today' },
      { id: 'overdue', label: 'Overdue', href: '/tasks?view=overdue' },
      { id: 'upcoming', label: 'Upcoming', href: '/tasks?view=upcoming' },
      { id: 'completed', label: 'Completed', href: '/tasks?view=completed' },
    ],
  },
  {
    id: 'team',
    label: 'Team',
    href: '/team',
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
    visible: everyone,
    secondary: [
      { id: 'sales-insights', label: 'Sales Insights', href: '/reports/sales' },
      { id: 'ai-usage', label: 'AI Usage', href: '/admin/ai-usage', visible: adminUp },
      { id: 'revenue-intelligence', label: 'Revenue Intelligence', href: '/admin/revenue-intelligence', visible: adminUp },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    href: '/settings',
    visible: everyone,
    secondary: [],
  },
  {
    id: 'admin',
    label: 'Admin',
    href: '/admin/command',
    visible: adminUp,
    secondary: [
      { id: 'command-center', label: 'Command Center', href: '/admin/command' },
      { id: 'people-roles', label: 'People & Roles', href: '/admin/people' },
      { id: 'profiles', label: 'Profiles', href: '/profile-intelligence' },
      { id: 'scoring-qa', label: 'Scoring QA', href: '/admin/scoring-qa' },
      { id: 'qa-trust', label: 'QA & Trust', href: '/admin/qa' },
      { id: 'dataset', label: 'Dataset', href: '/admin/dataset' },
      { id: 'training-data', label: 'Training Data', href: '/admin/training-data' },
      { id: 'manage-profiles', label: 'Manage Profiles', href: '/manage-profiles', visible: (r) => r.isOwner },
    ],
  },
]

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
  if (pathname === '/settings' || pathname === '/account') return 'settings'
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

export function visibleDomains(role: RelayNavRoleFlags): RelayPrimaryDomain[] {
  return NAV_DOMAINS.filter((d) => d.visible(role))
}

export function secondaryItems(domain: RelayNavDomain, role: RelayNavRoleFlags): RelaySecondaryItem[] {
  const config = NAV_DOMAINS.find((d) => d.id === domain)
  if (!config || !config.visible(role)) return []
  return config.secondary.filter((item) => !item.visible || item.visible(role))
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
  if (path !== pathname) return null
  for (const [key, value] of params) {
    if (search.get(key) !== value) return null
  }
  return { pathLen: path.length, paramCount: params.toString().length === 0 ? 0 : [...params.keys()].length }
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
  return best ? best.id : null
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
