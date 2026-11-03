'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  Search,
  Plus,
  Target,
  Briefcase,
  MessageSquare,
  Shuffle,
  PenLine,
  Sparkles,
  Users,
  Settings,
  Command,
  ArrowRight,
  Shield,
  BarChart3,
  UserCircle2,
  TrendingUp,
  Building2,
  ListChecks,
  Activity,
} from 'lucide-react'
import { cn } from 'cn'
import { SEARCH_GROUP_LABEL, commandVisible, type SearchGroupKey, type SearchGroups } from '@/lib/operations/search-shared'

const SEARCH_GROUP_ICON: Record<SearchGroupKey, React.ComponentType<{ className?: string }>> = {
  people: Users,
  companies: Building2,
  leads: Target,
  tasks: ListChecks,
  conversations: MessageSquare,
}

interface CommandItem {
  id: string
  label: string
  description?: string
  icon: React.ComponentType<{ className?: string }>
  shortcut?: string
  action: () => void
  group: string
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return { open, setOpen }
}

export function CommandPalette({
  open,
  onOpenChange,
  isAdmin = false,
  isManager = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isAdmin?: boolean
  isManager?: boolean
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const commands: CommandItem[] = useMemo(() => {
    const all: CommandItem[] = [
    {
      id: 'check-prospect',
      label: 'Analyze Prospect',
      description: 'Run a fit check instantly',
      icon: Search,
      shortcut: '',
      group: 'Relay',
      action: () => { router.push('/prospect'); onOpenChange(false) },
    },
    {
      id: 'find-leads',
      label: 'Open Leads',
      description: 'Open and filter lead pipeline',
      icon: Target,
      group: 'Relay',
      action: () => { router.push('/leads'); onOpenChange(false) },
    },
    {
      id: 'find-jobs',
      label: 'Open Upwork',
      description: 'Open Upwork opportunities',
      icon: Briefcase,
      group: 'Relay',
      action: () => { router.push('/upwork'); onOpenChange(false) },
    },
    {
      id: 'open-conversations',
      label: 'Open Inbox',
      description: 'Jump to active queue conversations',
      icon: MessageSquare,
      group: 'Relay',
      action: () => { router.push('/chats'); onOpenChange(false) },
    },
    {
      id: 'my-tasks',
      label: 'Open Tasks',
      description: 'Unified task workspace',
      icon: Target,
      group: 'Relay',
      action: () => { router.push('/tasks'); onOpenChange(false) },
    },
    {
      id: 'overdue-tasks',
      label: 'Open Overdue Tasks',
      description: 'Tasks past due',
      icon: Target,
      group: 'Relay',
      action: () => { router.push('/tasks?tab=overdue'); onOpenChange(false) },
    },
    {
      id: 'create-task',
      label: 'Create task',
      description: isAdmin ? 'Assign work to a teammate' : 'Open task workspace',
      icon: Plus,
      group: 'Relay',
      action: () => {
        router.push('/tasks?assign=1')
        onOpenChange(false)
      },
    },
    {
      id: 'search-lead',
      label: 'Search lead',
      description: 'Search lead and proof archive',
      icon: Search,
      group: 'Relay',
      action: () => { router.push('/archive'); onOpenChange(false) },
    },
    {
      id: 'add-upwork',
      label: 'Add Upwork job',
      description: 'Paste a new job posting',
      icon: Briefcase,
      group: 'Relay',
      action: () => { router.push('/upwork/new'); onOpenChange(false) },
    },
    {
      id: 'view-replies',
      label: 'Open Needs Reply',
      description: 'Leads with client replies waiting',
      icon: MessageSquare,
      group: 'Relay',
      action: () => { router.push('/chats?view=waiting_me'); onOpenChange(false) },
    },
    {
      id: 'view-followups',
      label: 'Open Follow-ups',
      description: 'Overdue follow-ups',
      icon: MessageSquare,
      group: 'Relay',
      action: () => { router.push('/chats?view=followups'); onOpenChange(false) },
    },
    {
      id: 'view-referred',
      label: 'View referred leads',
      description: 'Leads referred to you',
      icon: Shuffle,
      group: 'Relay',
      action: () => { router.push('/leads?filter=referred'); onOpenChange(false) },
    },
    {
      id: 'switch-identity',
      label: 'Switch profile',
      description: 'Choose an authorized identity',
      icon: Shuffle,
      group: 'Relay',
      action: () => { router.push('/rep/assigned-profiles'); onOpenChange(false) },
    },
    {
      id: 'quick-capture',
      label: 'Quick Capture',
      description: 'Turn a raw thought into angles',
      icon: PenLine,
      group: 'Studio',
      action: () => { router.push('/content'); onOpenChange(false) },
    },
    {
      id: 'studio-idea',
      label: 'Create Studio Idea',
      description: 'Open today\'s editorial directions',
      icon: Sparkles,
      group: 'Studio',
      action: () => { router.push('/content'); onOpenChange(false) },
    },
    {
      id: 'search-profile',
      label: 'Open Profiles',
      description: 'Open profile intelligence',
      icon: Users,
      group: 'Studio',
      action: () => { router.push('/profiles'); onOpenChange(false) },
    },
    {
      id: 'today',
      label: 'Today',
      description: 'Go to your daily decision engine',
      icon: Command,
      group: 'Navigation',
      action: () => { router.push('/dashboard'); onOpenChange(false) },
    },
    {
      id: 'new-lead',
      label: 'Add Lead',
      description: 'Add a company to your pipeline',
      icon: Plus,
      group: 'Navigation',
      action: () => { router.push('/leads/new'); onOpenChange(false) },
    },
    {
      id: 'studio',
      label: 'Studio',
      description: 'Go to create demand workspace',
      icon: PenLine,
      group: 'Navigation',
      action: () => { router.push('/content'); onOpenChange(false) },
    },
    {
      id: 'team',
      label: 'Open Team',
      description: 'People, tasks, activity and performance',
      icon: Users,
      group: 'Navigation',
      action: () => { router.push('/team'); onOpenChange(false) },
    },
    {
      id: 'reports',
      label: 'Open Sales Insights',
      description: 'Sales, pipeline, team, activity and revenue',
      icon: BarChart3,
      group: 'Navigation',
      action: () => { router.push('/reports/sales'); onOpenChange(false) },
    },
    {
      id: 'settings',
      label: 'Settings',
      description: 'Account, send budget and preferences',
      icon: Settings,
      group: 'Navigation',
      action: () => { router.push('/settings'); onOpenChange(false) },
    },
    {
      id: 'inbound',
      label: 'Inbound Desk',
      description: 'Messages from clients',
      icon: MessageSquare,
      group: 'Relay',
      action: () => { router.push('/inbound'); onOpenChange(false) },
    },
    {
      id: 'proof',
      label: 'Proof',
      description: 'Proof items and facts',
      icon: Shield,
      group: 'Studio',
      action: () => { router.push('/facts'); onOpenChange(false) },
    },
    {
      id: 'growth',
      label: 'Growth',
      description: 'Growth engine',
      icon: TrendingUp,
      group: 'Studio',
      action: () => { router.push('/content-v2/growth'); onOpenChange(false) },
    },
    {
      id: 'command-center',
      label: 'Command Center',
      description: 'Admin ops dashboard',
      icon: Shield,
      group: 'Admin',
      action: () => { router.push('/admin/command'); onOpenChange(false) },
    },
    {
      id: 'people',
      label: 'People & Roles',
      description: 'Org hierarchy',
      icon: Users,
      group: 'Admin',
      action: () => { router.push('/admin/people'); onOpenChange(false) },
    },
    {
      id: 'revenue',
      label: 'Revenue Intelligence',
      description: 'Revenue analytics',
      icon: BarChart3,
      group: 'Admin',
      action: () => { router.push('/admin/revenue-intelligence'); onOpenChange(false) },
    },
    {
      id: 'identities',
      label: 'Profiles',
      description: 'Profiles and the identities reps send as',
      icon: UserCircle2,
      group: 'Admin',
      action: () => { router.push('/profile-intelligence?tab=identities'); onOpenChange(false) },
    },
    {
      id: 'accounts',
      label: 'Accounts',
      description: 'Companies, people and account history',
      icon: Building2,
      group: 'Admin',
      action: () => { router.push('/accounts'); onOpenChange(false) },
    },
    {
      id: 'team-tasks',
      label: 'Team Tasks',
      description: 'Who has what work',
      icon: ListChecks,
      group: 'Navigation',
      action: () => { router.push('/team/tasks'); onOpenChange(false) },
    },
    {
      id: 'team-activity',
      label: 'Team Activity',
      description: 'Operational activity feed',
      icon: Activity,
      group: 'Navigation',
      action: () => { router.push('/team/activity'); onOpenChange(false) },
    },
    {
      id: 'team-performance',
      label: 'Team Performance',
      description: 'Execution, conversion and comparisons',
      icon: BarChart3,
      group: 'Navigation',
      action: () => { router.push('/team/performance'); onOpenChange(false) },
    },
    {
      id: 'targets',
      label: 'Targets',
      description: 'Daily targets',
      icon: Target,
      group: 'Admin',
      action: () => { router.push('/admin/targets'); onOpenChange(false) },
    },
    ]
    return all
  }, [router, onOpenChange])

  const visibleCommands = useMemo(
    () => commands.filter((c) => commandVisible(c, { isAdmin, isManager })),
    [commands, isAdmin, isManager],
  )

  // Record search (people, companies, leads, tasks, conversations) — debounced,
  // scoped server-side. Results render above commands, grouped.
  const [records, setRecords] = useState<{ query: string; groups: SearchGroups } | null>(null)
  useEffect(() => {
    const term = query.trim()
    if (!open || term.length < 2) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/search/ops?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then((json: { groups?: SearchGroups } | null) => {
          if (json?.groups) setRecords({ query: term, groups: json.groups })
        })
        .catch(() => {})
    }, 200)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, open])

  const recordItems: CommandItem[] = useMemo(() => {
    if (!records || records.query !== query.trim()) return []
    const items: CommandItem[] = []
    for (const key of Object.keys(SEARCH_GROUP_LABEL) as SearchGroupKey[]) {
      for (const hit of records.groups[key] ?? []) {
        items.push({
          id: `${key}:${hit.id}`,
          label: hit.label,
          description: hit.detail ?? undefined,
          icon: SEARCH_GROUP_ICON[key],
          group: SEARCH_GROUP_LABEL[key],
          action: () => { router.push(hit.href); onOpenChange(false) },
        })
      }
    }
    return items
  }, [records, query, router, onOpenChange])

  const filtered = useMemo(() => {
    if (!query.trim()) return visibleCommands
    const q = query.toLowerCase()
    return [
      ...recordItems,
      ...visibleCommands.filter(
        (c) =>
          c.label.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q) ||
          c.group.toLowerCase().includes(q),
      ),
    ]
  }, [visibleCommands, recordItems, query])

  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {}
    for (const item of filtered) {
      if (!groups[item.group]) groups[item.group] = []
      groups[item.group].push(item)
    }
    return groups
  }, [filtered])

  const [lastQuery, setLastQuery] = useState(query)
  if (query !== lastQuery) {
    setLastQuery(query)
    setSelectedIndex(0)
  }

  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) {
      setQuery('')
      setSelectedIndex(0)
    }
  }

  // Focus returns to whatever opened the palette once it closes.
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    return () => previous?.focus?.()
  }, [open])

  const execute = useCallback((item: CommandItem) => {
    item.action()
  }, [])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[selectedIndex]) {
        execute(filtered[selectedIndex])
      }
    }
  }

  let flatIndex = -1

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[15vh]">
      <div
        className="absolute inset-0 bg-ink/20 fade-in"
        style={{ backdropFilter: 'blur(4px)' }}
        aria-hidden="true"
        onClick={() => onOpenChange(false)}
      />
      <div
        className="relative w-full max-w-lg rounded-xl border border-line bg-bone-raised shadow-xl scale-in overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Command className="size-4 shrink-0 text-stone" aria-hidden="true" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search people, companies, leads, tasks — or a command"
            className="flex-1 bg-transparent text-[14px] text-ink placeholder:text-stone outline-none"
            autoFocus
            aria-label="Command search"
            role="combobox"
            aria-expanded={filtered.length > 0}
            aria-controls="command-palette-results"
            aria-activedescendant={filtered[selectedIndex] ? `cmd-${filtered[selectedIndex].id}` : undefined}
            aria-autocomplete="list"
          />
          <kbd className="rounded bg-bone px-1.5 py-0.5 text-mono-medium text-[10px] text-stone">ESC</kbd>
        </div>

        {/* Results */}
        <div id="command-palette-results" role="listbox" aria-label="Results" className="max-h-[320px] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-[13px] text-stone">No results</p>
            </div>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <div key={group} role="group" aria-label={group} className="mb-2">
                <p className="px-2 py-1 text-label text-stone" aria-hidden="true">{group}</p>
                {items.map((item) => {
                  flatIndex++
                  const isSelected = flatIndex === selectedIndex
                  return (
                    <button
                      key={item.id}
                      id={`cmd-${item.id}`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      tabIndex={-1}
                      onClick={() => execute(item)}
                      onMouseEnter={() => setSelectedIndex(flatIndex)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors',
                        isSelected ? 'bg-bone' : 'hover:bg-bone',
                      )}
                    >
                      <item.icon className="size-4 shrink-0 text-stone" aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-ink">{item.label}</p>
                        {item.description && (
                          <p className="truncate text-[11px] text-graphite">{item.description}</p>
                        )}
                      </div>
                      {isSelected && (
                        <ArrowRight className="size-3 shrink-0 text-stone" aria-hidden="true" />
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 border-t border-line px-4 py-2">
          <span className="text-mono-medium text-[10px] text-stone">
            <kbd className="rounded bg-bone px-1 py-0.5">↑↓</kbd> navigate
          </span>
          <span className="text-mono-medium text-[10px] text-stone">
            <kbd className="rounded bg-bone px-1 py-0.5">↵</kbd> select
          </span>
          <span className="text-mono-medium text-[10px] text-stone">
            <kbd className="rounded bg-bone px-1 py-0.5">esc</kbd> close
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
