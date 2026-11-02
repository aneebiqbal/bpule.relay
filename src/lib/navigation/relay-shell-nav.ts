/**
 * Relay V2 shell navigation — section top nav + contextual left rail.
 * URLs stay on existing routes during Sprint 1; IA is expressed through chrome.
 */

export type RelayShellSection =
  | 'home'
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
  sales: [
    { label: 'Prospects', href: '/prospect' },
    { label: 'Leads', href: '/leads' },
    { label: 'Pipeline', href: '/leads' },
    { label: 'Upwork', href: '/upwork' },
    { label: 'Tasks', href: '/tasks' },
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
    { label: 'People', href: '/team', exact: true },
    { label: 'Teams', href: '/team/groups' },
    { label: 'Tasks', href: '/team/tasks', exact: true },
    { label: 'Activity', href: '/team/activity', exact: true },
    { label: 'Performance', href: '/team/performance', exact: true },
    { label: 'Daily operations', href: '/admin/command' },
    { label: 'Targets', href: '/team/targets', exact: true },
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

const SALES_PREFIXES = ['/leads', '/prospect', '/upwork', '/archive', '/tasks']
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
