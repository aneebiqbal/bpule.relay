'use client'

/**
 * Deterministic Inbox fixture — the visual-development surface used when
 * Neon Auth is unavailable. Renders the real queue list, thread header,
 * intelligence panel and a synthetic canonical thread over fixed data, in the
 * same shell as /chats.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, SlidersHorizontal, Sparkles } from 'lucide-react'
import { cn } from 'cn'
import { Drawer } from '@/components/ui/drawer'
import { Select } from '@/components/ui/select'
import { ChatQueueList } from '@/components/chats/chat-queue-list'
import { ChatIntelligencePanel } from '@/components/chats/chat-intelligence-panel'
import { Collapsible } from '@/components/chats/collapsible'
import { IntelligenceDrawer } from '@/components/chats/intelligence-drawer'
import { ThreadHeader } from '@/components/chats/thread-header'
import { ageLabel } from '@/components/operations/ops-primitives'
import { CONVERSATION_STATE_LABEL } from '@/lib/operations/conversations'
import { chatViewMatches, countChatViews, type ChatView } from '@/lib/operations/chat-queue'
import { INBOX_PRIMARY_VIEWS } from '@/lib/navigation/inbox-nav'
import {
  INBOX_FIXTURE_CREATED_AT,
  INBOX_FIXTURE_MESSAGES,
  INBOX_FIXTURE_ROWS,
  inboxFixtureIntelligence,
} from '@/lib/operations/inbox-fixtures'

/** Fixed display clock so the fixture hydrates identically on server and client. */
const FIXTURE_NOW = Date.parse('2026-11-03T09:00:00.000Z')

// Internal notes live in the context panel (NotesPanel), never in the thread.

const TABS = INBOX_PRIMARY_VIEWS

export function InboxFixture({ showOwner = false, className }: { showOwner?: boolean; className?: string }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [view, setView] = useState<ChatView>('waiting_me')
  const [condition, setCondition] = useState<ChatView | null>(null)
  const [q, setQ] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const effectiveView = condition ?? view
  const rows = INBOX_FIXTURE_ROWS
  const counts = useMemo(() => countChatViews(INBOX_FIXTURE_ROWS, showOwner), [showOwner])
  const visible = useMemo(() => {
    const filtered = INBOX_FIXTURE_ROWS.filter((r) => chatViewMatches(r, effectiveView))
    const term = q.trim().toLowerCase()
    if (!term) return filtered
    return filtered.filter((r) => r.person.toLowerCase().includes(term) || r.company?.toLowerCase().includes(term))
  }, [effectiveView, q])
  const row = rows.find((r) => r.leadId === selected) ?? visible[0] ?? rows[0]
  const intel = useMemo(() => inboxFixtureIntelligence(row.leadId), [row.leadId])

  // Mirror /chats: desktop auto-selects the first row; mobile is list-first.
  useEffect(() => {
    if (selected) return
    if (!window.matchMedia('(min-width: 768px)').matches) return
    const first = INBOX_FIXTURE_ROWS.find((r) => chatViewMatches(r, effectiveView)) ?? INBOX_FIXTURE_ROWS[0]
    setSelected(first.leadId)
  }, [selected, effectiveView])

  const moreRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!moreOpen) return
    const onDown = (event: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setMoreOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [moreOpen])

  return (
    <div className={cn('grid min-w-0 gap-3 md:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_320px]', className)}>
      <aside
        aria-label="Conversation queue"
        className={cn(
          'min-h-0 min-w-0 flex flex-col overflow-hidden rounded-lg border border-line bg-bone-raised h-dvh md:h-auto',
          selected ? 'hidden md:block' : '',
        )}
      >
        <div className="flex shrink-0 flex-col gap-2 border-b border-line p-3">
          <div className="flex items-baseline justify-between gap-2 sm:pr-24">
            <span className="text-[16px] font-medium tracking-[-0.01em] text-ink">Inbox</span>
            <span className="text-[12px] text-graphite">{counts.waiting_me ?? 0} need reply</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search conversations…"
                aria-label="Search conversations"
                className="w-full rounded-lg border border-line bg-bone py-2 pl-9 pr-3 text-[13px] text-ink placeholder:text-stone/50 focus:border-orange/40 focus:outline-none"
              />
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-stone" aria-hidden="true">⌕</span>
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              aria-haspopup="dialog"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-bone px-2.5 text-[13px] text-ink hover:bg-bone-raised"
            >
              <SlidersHorizontal className="size-3.5" aria-hidden="true" />
              Filters
            </button>
          </div>
          <nav aria-label="Conversation views" className="-mx-1 overflow-x-auto">
            <ul className="flex items-center gap-0.5 rounded-lg bg-bone p-0.5 ring-1 ring-line">
              {TABS.map((tab) => {
                const current = tab.value === view && !condition
                return (
                  <li key={tab.value}>
                    <button
                      type="button"
                      onClick={() => { setView(tab.value); setCondition(null) }}
                      aria-current={current ? 'page' : undefined}
                      className={cn(
                        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[12px] transition-colors',
                        current ? 'bg-bone-raised font-medium text-ink shadow-sm' : 'text-graphite hover:text-ink',
                      )}
                    >
                      {tab.label}
                      {counts[tab.value] !== undefined && (
                        <span className="rounded-full bg-bone px-1 text-[10px] tabular-nums text-stone">{counts[tab.value]}</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ChatQueueList
            rows={visible}
            selectedLeadId={selected}
            hrefFor={() => '#'}
            showOwner={showOwner}
            emptyLabel="No conversations in this view."
            onSelect={(leadId) => setSelected(leadId)}
          />
        </div>
      </aside>

      <Drawer open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters" side="right">
        <div className="space-y-4 p-4">
          {[
            { label: 'Team', options: ['All teams', 'Enterprise', 'SMB'] },
            { label: 'Rep', options: ['All reps', 'Mehak', 'Madiha'] },
            { label: 'Profile', options: ['All profiles', 'Mehak LinkedIn', 'Madiha LinkedIn'] },
            { label: 'Source', options: ['All sources', 'LinkedIn', 'Upwork', 'Other'] },
            { label: 'Age', options: ['Any age', 'Waiting ≥1h', 'Waiting ≥4h', 'Waiting ≥12h'] },
          ].map((f) => (
            <label key={f.label} className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{f.label}</span>
              <Select defaultValue="" className="h-9 text-[13px]">
                {f.options.map((o) => (
                  <option key={o} value={o === f.options[0] ? '' : o}>{o}</option>
                ))}
              </Select>
            </label>
          ))}
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Condition</span>
            <Select value={condition ?? ''} onChange={(e) => setCondition((e.target.value || null) as ChatView | null)} className="h-9 text-[13px]">
              <option value="">Any condition</option>
              <option value="meeting_requests">Meeting request</option>
              <option value="proposal_requests">Proposal request</option>
              <option value="closed">Closed</option>
              <option value="unassigned">Unassigned</option>
              <option value="review">Thread review</option>
            </Select>
          </label>
        </div>
      </Drawer>

      <section
        aria-label="Thread"
        className={cn('min-w-0 flex flex-col h-dvh md:h-auto', selected ? '' : 'hidden md:block')}
      >
        <div className="flex items-center justify-between gap-2 md:hidden">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="inline-flex items-center gap-1 text-[12px] text-graphite hover:text-ink"
          >
            <ArrowLeft className="size-3.5" aria-hidden /> All conversations
          </button>
        </div>

        <ThreadHeader
          row={row}
          reps={[{ id: 'rep-mehak', name: 'Mehak' }]}
          canIntervene={showOwner}
          tasksAvailable
          leadCreatedAt={INBOX_FIXTURE_CREATED_AT}
          contextAction={
            <div className="xl:hidden">
              <IntelligenceDrawer>
                <ChatIntelligencePanel
                  intel={intel}
                  reps={[{ id: 'rep-mehak', name: 'Mehak' }]}
                  canIntervene={showOwner}
                  tasksAvailable
                  now={FIXTURE_NOW}
                />
              </IntelligenceDrawer>
            </div>
          }
        />

        <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-bone-raised/20" aria-label="Conversation">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {INBOX_FIXTURE_MESSAGES.map((m) => {
              const mine = m.direction === 'outbound'
              return (
                <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                  <div className="max-w-[85%] min-w-0">
                    <div
                      className={cn(
                        'rounded-2xl px-3.5 py-2.5',
                        mine ? 'rounded-br-md border border-cobalt/20 bg-cobalt/10' : 'rounded-bl-md border border-line bg-bone',
                      )}
                    >
                      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{m.body}</p>
                    </div>
                    <p className={cn('mt-1 flex gap-1.5 px-1 text-[10px] text-stone', mine ? 'justify-end' : 'justify-start')}>
                      <span className="font-medium">{mine ? 'You' : row.person}</span>
                      <span>· {m.kind}</span>
                      <span>· {ageLabel(Math.max(0.1, (FIXTURE_NOW - Date.parse(m.at)) / 3_600_000))}</span>
                    </p>
                  </div>
                </div>
              )
            })}
            {row.state === 'closed' && (
              <div className="flex items-center gap-3 py-1" aria-label="Deal won">
                <span className="h-px flex-1 bg-line" aria-hidden="true" />
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-stone">
                  <span className="size-1 rounded-full bg-stone/60" aria-hidden="true" />
                  Deal won
                </span>
                <span className="h-px flex-1 bg-line" aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="border-t border-line bg-bone p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-bone-raised px-2.5 py-1 text-[12px] font-medium text-ink ring-1 ring-line">
                {CONVERSATION_STATE_LABEL[row.state] === 'Waiting on rep' ? 'Reply' : 'Message'}
                <span className="text-[10px] font-normal text-[#9e4517]">suggested</span>
              </span>
              <span className="inline-flex min-w-0 items-center gap-1 text-[11px] text-stone">
                Sending as <span className="truncate font-medium text-graphite">{row.profileName ?? 'No profile'}</span>
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  className="inline-flex h-8 items-center rounded-lg bg-orange px-2.5 text-[12px] font-medium text-on-accent transition-opacity hover:opacity-90"
                >
                  Reply now
                </button>
                <div ref={moreRef} className="relative">
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={moreOpen}
                    onClick={() => setMoreOpen((v) => !v)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-bone px-2.5 text-[12px] font-medium text-ink hover:bg-bone-raised"
                  >
                    More
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
                      <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                  {moreOpen && (
                    <div role="menu" aria-label="Composer options" className="absolute right-0 z-30 mb-1 w-56 rounded-lg border border-line bg-bone-raised p-1 shadow-lg">
                      {['Connection note', 'First message', 'Follow-up', 'Reply', 'Message'].map((label) => (
                        <button
                          key={label}
                          type="button"
                          role="menuitemradio"
                          aria-checked={label === 'Reply'}
                          className="block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-graphite hover:bg-bone focus-visible:bg-bone focus-visible:outline-none"
                          onClick={() => setMoreOpen(false)}
                        >
                          {label}
                        </button>
                      ))}
                      <div className="my-1 border-t border-line" />
                      {['Paste reply', 'Rewrite', 'Shorter', 'Warmer', 'More direct', 'Copy & log as sent'].map((label) => (
                        <button
                          key={label}
                          type="button"
                          role="menuitem"
                          className="block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-graphite hover:bg-bone focus-visible:bg-bone focus-visible:outline-none"
                          onClick={() => setMoreOpen(false)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <textarea
              rows={4}
              placeholder="Write a reply…"
              aria-label="Your message"
              className="mt-2 w-full resize-none rounded-md border border-line bg-bone px-3 py-2 text-[13px] text-ink focus:border-orange/40 focus:outline-none"
            />
            <Collapsible label="Why this reply?" className="mt-2">
              <div className="rounded-md border border-line/70 bg-bone-raised/50 p-2 text-[11px] text-graphite">
                <p><span className="font-medium text-ink">Goal:</span> Answer the client&apos;s pricing question with the two-seat pilot.</p>
                <p><span className="font-medium text-ink">Known facts:</span> Budget approved for two seats; start in January.</p>
                <p className="mt-1 text-stone">Evidence used: Their last message asked for MVP pricing.</p>
              </div>
            </Collapsible>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink hover:bg-bone-raised"
              >
                <Sparkles className="size-3.5" aria-hidden /> Generate with AI
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink hover:bg-bone-raised"
              >
                Log as sent
              </button>
            </div>
          </div>
        </div>

      </section>

      <aside aria-label="Lead intelligence pane" className="hidden min-h-0 min-w-0 overflow-y-auto rounded-lg border border-line bg-bone-raised xl:block">
        <ChatIntelligencePanel intel={intel} reps={[{ id: 'rep-mehak', name: 'Mehak' }]} canIntervene={showOwner} tasksAvailable now={FIXTURE_NOW} />
      </aside>
    </div>
  )
}
