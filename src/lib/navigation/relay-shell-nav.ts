/**
 * Relay V2 shell navigation — section top nav + contextual left rail.
 * URLs stay on existing routes during Sprint 1; IA is expressed through chrome.
 */

export type RelayShellSection =
  | 'home'
  | 'work'
  | 'sales'
  | 'conversations'
  | 'accounts'
  | 'team'
  | 'intelligence'
  | 'content'
  | 'reports'

export interface RelayNavRoleFlags {
  isOwner: boolean
  isAdmin: boolean
  isManager: boolean
}

export interface RelayTopNavItem {
  id: RelayShellSection
  label: string
  href: string
  /** Who sees this in the top bar */
  visible: (role: RelayNavRoleFlags) => boolean
}

export interface RelaySectionNavItem {
  label: string
  href: string
  exact?: boolean
  /** Admin/Owner only. Items without a flag follow the section default. */
  adminOnly?: boolean
  /** Hidden from Admin/Owner (personal surfaces — admins have no personal stats). */
  repOnly?: boolean
  /** Manager / Admin / Owner only. */
  managerOnly?: boolean
}

const repManagerAdmin = (r: RelayNavRoleFlags) => true
const managerUp = (r: RelayNavRoleFlags) => r.isManager || r.isAdmin || r.isOwner
const adminUp = (r: RelayNavRoleFlags) => r.isAdmin || r.isOwner

export const RELAY_TOP_NAV: RelayTopNavItem[] = [
  { id: 'home', label: 'Home', href: '/home', visible: repManagerAdmin },
  { id: 'work', label: 'Work', href: '/tasks', visible: repManagerAdmin },
  { id: 'sales', label: 'Sales', href: '/leads', visible: repManagerAdmin },
  { id: 'conversations', label: 'Conversations', href: '/chats', visible: repManagerAdmin },
  { id: 'accounts', label: 'Accounts', href: '/accounts', visible: adminUp },
  { id: 'team', label: 'Team', href: '/team', visible: managerUp },
  { id: 'intelligence', label: 'Intelligence', href: '/admin/scoring-qa', visible: adminUp },
  { id: 'content', label: 'Content', href: '/content', visible: repManagerAdmin },
  {
    id: 'reports',
    label: 'Reports',
    href: '/reports/sales',
    visible: repManagerAdmin,
  },
]

export const RELAY_SECTION_NAV: Record<RelayShellSection, RelaySectionNavItem[]> = {
  home: [
    { label: 'Today', href: '/dashboard', exact: true },
    { label: 'My tasks', href: '/tasks', exact: true },
  ],
  work: [
    { label: 'My tasks', href: '/tasks', exact: true },
    { label: 'Today', href: '/tasks?view=today' },
    { label: 'Overdue', href: '/tasks?view=overdue' },
    { label: 'Upcoming', href: '/tasks?view=upcoming' },
    { label: 'Completed', href: '/tasks?view=completed' },
  ],
  sales: [
    { label: 'Prospects', href: '/prospect' },
    { label: 'Leads', href: '/leads' },
    { label: 'Pipeline', href: '/leads' },
    { label: 'Upwork', href: '/upwork' },
    { label: 'Archive', href: '/archive' },
    { label: 'Import', href: '/leads/import', exact: true },
  ],
  conversations: [
    { label: 'Inbox', href: '/chats', exact: true },
    { label: 'Queue', href: '/relay', exact: true },
    { label: 'Inbound', href: '/inbound', exact: true },
  ],
  accounts: [
    { label: 'Companies', href: '/accounts' },
    { label: 'Profiles & identities', href: '/profile-intelligence' },
    { label: 'Manage profiles', href: '/manage-profiles', exact: true },
    { label: 'Proof', href: '/facts', exact: true },
  ],
  team: [
    { label: 'Overview', href: '/team', exact: true },
    { label: 'People', href: '/team/people', exact: true },
    { label: 'Workload', href: '/team/workload', exact: true },
    { label: 'Activity', href: '/team/activity', exact: true },
    { label: 'Performance', href: '/team/performance', exact: true },
    { label: 'Targets', href: '/team/targets', exact: true },
    { label: 'Groups', href: '/team/groups', exact: true },
    { label: 'Daily operations', href: '/admin/command' },
    { label: 'Access & roles', href: '/admin/people', exact: true, adminOnly: true },
  ],
  intelligence: [
    { label: 'Scoring QA', href: '/admin/scoring-qa', exact: true },
    { label: 'QA & trust', href: '/admin/qa', exact: true },
    { label: 'Dataset', href: '/admin/dataset', exact: true },
    { label: 'Training data', href: '/admin/training-data', exact: true },
  ],
  content: [
    { label: 'Studio', href: '/content', exact: true },
    { label: 'Growth', href: '/content-v2/growth', exact: true },
    { label: 'Proof', href: '/facts', exact: true },
  ],
  reports: [
    { label: 'Sales', href: '/reports/sales', exact: true },
    { label: 'Pipeline', href: '/reports/pipeline', exact: true },
    { label: 'Team', href: '/reports/team', exact: true, managerOnly: true },
    { label: 'Activity', href: '/reports/activity', exact: true },
    { label: 'Revenue', href: '/reports/revenue', exact: true },
    { label: 'AI usage', href: '/admin/ai-usage', exact: true, adminOnly: true },
    { label: 'My performance', href: '/performance', exact: true, repOnly: true },
  ],
}

const WORK_PREFIXES = ['/tasks']
const SALES_PREFIXES = ['/leads', '/prospect', '/upwork', '/archive']
const CONVERSATION_PREFIXES = ['/chats', '/relay', '/inbound']
const ACCOUNTS_PREFIXES = ['/accounts', '/profile-intelligence', '/profiles', '/manage-profiles', '/workspace', '/rep/assigned-profiles']
const TEAM_PREFIXES = ['/team', '/admin/command', '/admin/people', '/admin/targets', '/accountability']
const INTELLIGENCE_PREFIXES = ['/admin/scoring-qa', '/admin/qa', '/admin/dataset', '/admin/training-data']
const CONTENT_PREFIXES = ['/content', '/content-v2', '/facts', '/studio']
const REPORTS_PREFIXES = ['/reports', '/performance', '/admin/revenue-intelligence', '/admin/ai-usage']

export function detectRelayShellSection(pathname: string): RelayShellSection {
  if (pathname === '/dashboard' || pathname === '/home') {
    return 'home'
  }
  // Daily operations (/admin/command) lives under Team since Phase 8.27.
  if (CONVERSATION_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return 'conversations'
  }
  if (WORK_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return 'work'
  if (SALES_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return 'sales'
  if (ACCOUNTS_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return 'accounts'
  if (TEAM_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return 'team'
  if (INTELLIGENCE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return 'intelligence'
  }
  if (CONTENT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return 'content'
  if (REPORTS_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return 'reports'
  if (pathname.startsWith('/settings') || pathname.startsWith('/account')) return 'home'
  return 'home'
}

export function visibleTopNav(role: RelayNavRoleFlags): RelayTopNavItem[] {
  return RELAY_TOP_NAV.filter((item) => item.visible(role))
}

export function sectionNavItems(
  section: RelayShellSection,
  role: RelayNavRoleFlags,
): RelaySectionNavItem[] {
  const adminRole = role.isAdmin || role.isOwner
  const items = RELAY_SECTION_NAV[section].filter(
    (i) =>
      (!i.adminOnly || adminRole) &&
      (!i.repOnly || !adminRole) &&
      (!i.managerOnly || adminRole || role.isManager),
  )
  if (section === 'team') {
    // Managers keep Daily operations (/admin/command allows them); flagged
    // admin-only items are already removed above.
    return role.isManager || adminRole ? items : []
  }
  if (section === 'reports' && !adminRole) {
    return items.filter((i) => !i.href.startsWith('/admin/'))
  }
  if (section === 'intelligence') {
    return role.isAdmin || role.isOwner ? items : []
  }
  if (section === 'accounts') {
    return role.isAdmin || role.isOwner ? items : []
  }
  return items
}

function navItemMatches(pathname: string, item: RelaySectionNavItem): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`)
}

/**
 * The one canonical answer to "which sidebar item is active?".
 *
 * Prefix matching can match several aliases of the same route (for example
 * `/leads` is both "Leads" and "Pipeline"), which used to light up more than
 * one item at a time. Resolve to the most specific match — longest href wins,
 * first declared breaks ties — so exactly one item (or none) is ever active.
 * RENDER_V3_SINGLE_ACTIVE_NAV_ITEM.
 */
export function resolveSectionActiveItem(
  section: RelayShellSection,
  pathname: string,
  role: RelayNavRoleFlags,
): RelaySectionNavItem | null {
  let best: RelaySectionNavItem | null = null
  for (const item of sectionNavItems(section, role)) {
    if (!navItemMatches(pathname, item)) continue
    if (!best || item.href.length > best.href.length) best = item
  }
  return best
}

/** Mobile primary destinations — one canonical list keyed by section id. */
export function v3MobileNavItems(role: RelayNavRoleFlags): Array<{ id: string; label: string; href: string }> {
  const items: Array<{ id: string; label: string; href: string }> = [
    { id: 'home', label: 'Home', href: '/dashboard' },
    { id: 'work', label: 'Work', href: '/tasks' },
    { id: 'sales', label: 'Leads', href: '/leads' },
    { id: 'conversations', label: 'Inbox', href: '/chats' },
  ]
  if (role.isManager || role.isAdmin || role.isOwner) {
    items.push({ id: 'team', label: 'Team', href: '/team' })
  }
  items.push({ id: 'reports', label: 'Reports', href: '/reports/sales' })
  return items
}

export interface V3SidebarItem {
  id: string
  label: string
  href: string
  visible: (role: RelayNavRoleFlags) => boolean
}

const v3SidebarBase: V3SidebarItem[] = [
  { id: 'home', label: 'Home', href: '/dashboard', visible: repManagerAdmin },
  { id: 'work', label: 'Work', href: '/tasks', visible: repManagerAdmin },
  { id: 'sales', label: 'Sales', href: '/leads', visible: repManagerAdmin },
  { id: 'conversations', label: 'Inbox', href: '/chats', visible: repManagerAdmin },
  { id: 'team', label: 'Team', href: '/team', visible: managerUp },
  { id: 'insights', label: 'Insights', href: '/reports', visible: repManagerAdmin },
]

const v3SidebarAdmin: V3SidebarItem[] = [
  { id: 'admin', label: 'Admin', href: '/admin', visible: adminUp },
]

const v3SidebarFooter: V3SidebarItem[] = [
  { id: 'settings', label: 'Settings', href: '/settings', visible: repManagerAdmin },
]

export function v3SidebarItems(role: RelayNavRoleFlags): V3SidebarItem[] {
  return [...v3SidebarBase, ...v3SidebarAdmin, ...v3SidebarFooter].filter((item) => item.visible(role))
}

/** One active sidebar destination — longest href wins, first declared breaks ties. */
export function resolveV3SidebarActiveId(pathname: string, role: RelayNavRoleFlags): string | null {
  const items = v3SidebarItems(role)
  let best: V3SidebarItem | null = null
  for (const item of items) {
    const matches = pathname === item.href || pathname.startsWith(`${item.href}/`)
    if (!matches) continue
    if (!best || item.href.length > best.href.length) best = item
  }
  if (best) return best.id

  // A section route with no dedicated sidebar item (/prospect, /upwork, …)
  // still belongs to its parent destination — never leave context blank.
  const fallback: Partial<Record<RelayShellSection, string>> = {
    home: 'home',
    work: 'work',
    sales: 'sales',
    conversations: 'conversations',
    team: 'team',
    reports: 'insights',
  }
  const fallbackId = fallback[detectRelayShellSection(pathname)]
  return fallbackId && items.some((item) => item.id === fallbackId) ? fallbackId : null
}
