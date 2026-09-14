'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  Search,
  Plus,
  Target,
  PenLine,
  Sparkles,
  Users,
  Settings,
  Command,
  ArrowRight,
} from 'lucide-react'
import { cn } from 'cn'

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

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const commands: CommandItem[] = useMemo(() => [
    {
      id: 'check-prospect',
      label: 'Check a prospect',
      description: 'Paste a LinkedIn profile to score',
      icon: Search,
      shortcut: '',
      group: 'Quick actions',
      action: () => { router.push('/prospect'); onOpenChange(false) },
    },
    {
      id: 'new-lead',
      label: 'New lead',
      description: 'Add a company to your pipeline',
      icon: Plus,
      group: 'Quick actions',
      action: () => { router.push('/leads/new'); onOpenChange(false) },
    },
    {
      id: 'find-opportunities',
      label: 'Find opportunities',
      description: 'Search across leads, jobs, and proof',
      icon: Target,
      group: 'Quick actions',
      action: () => { router.push('/archive'); onOpenChange(false) },
    },
    {
      id: 'capture-thought',
      label: 'Capture a thought',
      description: 'Turn a note into content angles',
      icon: PenLine,
      group: 'Quick actions',
      action: () => { router.push('/content'); onOpenChange(false) },
    },
    {
      id: 'generate-outreach',
      label: 'Generate outreach',
      description: 'Draft a message for a lead',
      icon: Sparkles,
      group: 'Quick actions',
      action: () => { router.push('/leads'); onOpenChange(false) },
    },
    {
      id: 'today',
      label: 'Today',
      description: 'Go to your command center',
      icon: Command,
      group: 'Navigation',
      action: () => { router.push('/dashboard'); onOpenChange(false) },
    },
    {
      id: 'leads',
      label: 'Leads',
      description: 'View all leads',
      icon: Target,
      group: 'Navigation',
      action: () => { router.push('/leads'); onOpenChange(false) },
    },
    {
      id: 'studio',
      label: 'Studio',
      description: 'Content workspace',
      icon: PenLine,
      group: 'Navigation',
      action: () => { router.push('/content'); onOpenChange(false) },
    },
    {
      id: 'team',
      label: 'Team',
      description: 'Team performance',
      icon: Users,
      group: 'Navigation',
      action: () => { router.push('/team'); onOpenChange(false) },
    },
    {
      id: 'settings',
      label: 'Settings',
      description: 'Account and preferences',
      icon: Settings,
      group: 'Navigation',
      action: () => { router.push('/account'); onOpenChange(false) },
    },
  ], [router, onOpenChange])

  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        c.group.toLowerCase().includes(q),
    )
  }, [commands, query])

  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {}
    for (const item of filtered) {
      if (!groups[item.group]) groups[item.group] = []
      groups[item.group].push(item)
    }
    return groups
  }, [filtered])

  // Reset selection when query changes
  const [lastQuery, setLastQuery] = useState(query)
  if (query !== lastQuery) {
    setLastQuery(query)
    setSelectedIndex(0)
  }

  // Reset state when palette closes
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) {
      setQuery('')
      setSelectedIndex(0)
    }
  }

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
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-[14px] text-ink placeholder:text-stone outline-none"
            autoFocus
            aria-label="Command search"
          />
          <kbd className="rounded bg-bone px-1.5 py-0.5 text-mono-medium text-[10px] text-stone">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[320px] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-[13px] text-stone">No results</p>
            </div>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <div key={group} className="mb-2">
                <p className="px-2 py-1 text-label text-stone">{group}</p>
                {items.map((item) => {
                  flatIndex++
                  const isSelected = flatIndex === selectedIndex
                  return (
                    <button
                      key={item.id}
                      type="button"
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
