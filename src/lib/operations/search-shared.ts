/** Client-safe search types + labels (the palette imports these). */
export type SearchGroupKey = 'people' | 'companies' | 'leads' | 'tasks' | 'conversations'

export interface SearchHit {
  id: string
  label: string
  detail: string | null
  href: string
}

export type SearchGroups = Record<SearchGroupKey, SearchHit[]>

export const SEARCH_GROUP_LABEL: Record<SearchGroupKey, string> = {
  people: 'People',
  companies: 'Companies',
  leads: 'Leads',
  tasks: 'Tasks',
  conversations: 'Conversations',
}

/** Commands only managers / admins / owners see. Admin-group commands need admin. */
export const MANAGER_ONLY_COMMANDS: ReadonlySet<string> = new Set([
  'create-task',
  'team',
  'team-tasks',
  'team-activity',
  'team-performance',
  // Profile configuration is a Team capability; reps reach their own
  // assignments through the Rep Home instead.
  'search-profile',
  'add-profile',
  'assign-profile',
  'open-coverage',
])

export function commandVisible(
  command: { id: string; group: string },
  role: { isAdmin: boolean; isManager: boolean },
): boolean {
  if (command.group === 'Admin') return role.isAdmin
  if (MANAGER_ONLY_COMMANDS.has(command.id)) return role.isAdmin || role.isManager
  return true
}
