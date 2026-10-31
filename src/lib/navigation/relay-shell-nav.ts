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
}

const repManagerAdmin = (r: RelayNavRoleFlags) => true
const managerUp = (r: RelayNavRoleFlags) => r.isManager || r.isAdmin || r.isOwner
const adminUp = (r: RelayNavRoleFlags) => r.isAdmin || r.isOwner

export const RELAY_TOP_NAV: RelayTopNavItem[] = [
  { id: 'home', label: 'Home', href: '/home', visible: repManagerAdmin },
  { id: 'sales', label: 'Sales', href: '/leads', visible: repManagerAdmin },
  { id: 'conversations', label: 'Conversations', href: '/chats', visible: repManagerAdmin },
  { id: 'accounts', label: 'Accounts', href: '/profile-intelligence', visible: adminUp },
  { id: 'team', label: 'Team', href: '/team', visible: managerUp },
  { id: 'intelligence', label: 'Intelligence', href: '/admin/scoring-qa', visible: adminUp },
  { id: 'content', label: 'Content', href: '/content', visible: repManagerAdmin },
  {
    id: 'reports',
    label: 'Reports',
    href: '/performance',
    visible: repManagerAdmin,
  },
]

export const RELAY_SECTION_NAV: Record<RelayShellSection, RelaySectionNavItem[]> = {
  home: [
    { label: 'Today', href: '/dashboard', exact: true },
    { label: 'Command', href: '/admin/command', exact: true },
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
    { label: 'Profiles & identities', href: '/profile-intelligence' },
    { label: 'Manage profiles', href: '/manage-profiles', exact: true },
    { label: 'Proof', href: '/facts', exact: true },
  ],
  team: [
    { label: 'Overview', href: '/team', exact: true },
    { label: 'People', href: '/admin/people' },
    { label: 'Command', href: '/admin/command', exact: true },
    { label: 'Targets', href: '/admin/targets', exact: true },
    { label: 'My numbers', href: '/accountability', exact: true },
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
    { label: 'Activity', href: '/performance', exact: true },
    { label: 'Revenue', href: '/admin/revenue-intelligence', exact: true },
    { label: 'Team', href: '/team', exact: true },
    { label: 'AI usage', href: '/admin/ai-usage', exact: true },
  ],
}

const SALES_PREFIXES = ['/leads', '/prospect', '/upwork', '/archive', '/tasks']
const CONVERSATION_PREFIXES = ['/chats', '/relay', '/inbound']
const ACCOUNTS_PREFIXES = ['/profile-intelligence', '/profiles', '/manage-profiles', '/workspace', '/rep/assigned-profiles']
const TEAM_PREFIXES = ['/team', '/admin/command', '/admin/people', '/admin/targets', '/accountability']
const INTELLIGENCE_PREFIXES = ['/admin/scoring-qa', '/admin/qa', '/admin/dataset', '/admin/training-data']
const CONTENT_PREFIXES = ['/content', '/content-v2', '/facts', '/studio']
const REPORTS_PREFIXES = ['/performance', '/admin/revenue-intelligence', '/admin/ai-usage']

export function detectRelayShellSection(pathname: string): RelayShellSection {
  if (pathname === '/dashboard' || pathname === '/home' || pathname.startsWith('/admin/command')) {
    return 'home'
  }
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
  const items = RELAY_SECTION_NAV[section]
  if (section === 'team' && !role.isAdmin && !role.isOwner) {
    return items.filter((i) => !i.href.startsWith('/admin/'))
  }
  if (section === 'reports' && !role.isAdmin && !role.isOwner) {
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
