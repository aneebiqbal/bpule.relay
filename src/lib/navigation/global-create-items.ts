/** Canonical Global Create destinations — shared by the header menu and its tests. */
export interface GlobalCreateItem {
  key: string
  label: string
  description: string
  href: string
  default?: boolean
}

/**
 * Role-aware creation. Every role gets a short, relevant list — an admin is
 * never shown rep-only creation, and a rep never sees org configuration.
 * Capped at five so the menu stays a shortcut, not a sitemap.
 */
const REP_ITEMS: GlobalCreateItem[] = [
  { key: 'prospect', label: 'Analyze Prospect', description: 'Score a profile or source', href: '/prospect', default: true },
  { key: 'task', label: 'Create Task', description: 'Queue work for yourself', href: '/tasks' },
  { key: 'upwork', label: 'Add Upwork Job', description: 'Extract and score a job posting', href: '/upwork/new' },
  { key: 'studio', label: 'Create Studio Idea', description: 'Turn a raw thought into angles', href: '/content' },
]

const MANAGER_EXTRA: GlobalCreateItem[] = [
  { key: 'assign-task', label: 'Assign Task', description: 'Queue work for a specific rep', href: '/tasks?assign=1' },
]

const ADMIN_ITEMS: GlobalCreateItem[] = [
  { key: 'prospect', label: 'Analyze Prospect', description: 'Score a profile or source', href: '/prospect', default: true },
  { key: 'assign-task', label: 'Assign Task', description: 'Queue work for a specific rep', href: '/tasks?assign=1' },
  { key: 'add-profile', label: 'Add Profile', description: 'Create a profile and its sending identities', href: '/team/profiles?add=1' },
  { key: 'assign-profile', label: 'Assign Profile', description: 'Give an unassigned profile to a rep', href: '/team/profiles?view=unassigned' },
  { key: 'invite', label: 'Invite Person', description: 'Add someone to the organization', href: '/admin/people' },
]

export function buildGlobalCreateItems(isAdmin: boolean, isManager = false): GlobalCreateItem[] {
  if (isAdmin) return ADMIN_ITEMS
  if (isManager) return [...REP_ITEMS, ...MANAGER_EXTRA]
  return REP_ITEMS
}
