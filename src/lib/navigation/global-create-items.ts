/** Canonical Global Create destinations — shared by the header menu and its tests. */
export interface GlobalCreateItem {
  key: string
  label: string
  description: string
  href: string
  default?: boolean
}

const BASE_ITEMS: GlobalCreateItem[] = [
  { key: 'prospect', label: 'Analyze Prospect', description: 'Score a profile or source', href: '/prospect', default: true },
  { key: 'lead', label: 'Add Lead', description: 'Save a prospect to work', href: '/prospect?tab=saved' },
  { key: 'task', label: 'Create Task', description: 'Queue work for yourself or a rep', href: '/tasks' },
  { key: 'upwork', label: 'Add Upwork Job', description: 'Extract and score a job posting', href: '/upwork/new' },
  { key: 'studio', label: 'Create Studio Idea', description: 'Turn a raw thought into angles', href: '/content' },
]

export function buildGlobalCreateItems(isAdmin: boolean): GlobalCreateItem[] {
  if (!isAdmin) return [...BASE_ITEMS]
  return [
    ...BASE_ITEMS,
    { key: 'invite', label: 'Invite Person', description: 'Add someone to the organization', href: '/admin/people' },
  ]
}
