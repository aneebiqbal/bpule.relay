'use client'

/**
 * Deterministic Inbox fixture — the visual-development surface used when
 * Neon Auth is unavailable. Renders the real queue list, a synthetic canonical
 * thread and the real context panel over fixed data.
 */
import { useMemo, useState } from 'react'
import { ArrowLeft, Lock, MessagesSquare, Send, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { cn } from 'cn'
import { ChatQueueList } from '@/components/chats/chat-queue-list'
import { ChatIntelligencePanel } from '@/components/chats/chat-intelligence-panel'
import { IntelligenceDrawer } from '@/components/chats/intelligence-drawer'
import { ageLabel } from '@/components/operations/ops-primitives'
import { CONVERSATION_STATE_LABEL } from '@/lib/operations/conversations'
import {
  INBOX_FIXTURE_MESSAGES,
  INBOX_FIXTURE_ROWS,
  INBOX_FIXTURE_SELECTED_ID,
  inboxFixtureIntelligence,
} from '@/lib/operations/inbox-fixtures'

/** Fixed display clock so the fixture hydrates identically on server and client. */
const FIXTURE_NOW = Date.parse('2026-11-03T09:00:00.000Z')

export function InboxFixture({ showOwner = false }: { showOwner?: boolean }) {
  const [selected, setSelected] = useState(INBOX_FIXTURE_SELECTED_ID)
  const rows = INBOX_FIXTURE_ROWS
  const row = rows.find((r) => r.leadId === selected) ?? rows[0]
  const intel = useMemo(() => inboxFixtureIntelligence(row.leadId), [row.leadId])

  return (
    <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_320px]">
      <aside
        aria-label="Conversation queue"
        className={cn(
          'min-w-0 overflow-hidden rounded-lg border border-line bg-bone-raised md:max-h-[calc(100dvh-14rem)] md:overflow-y-auto',
          selected ? 'hidden md:block' : '',
        )}
      >
        <ChatQueueList
          rows={rows}
          selectedLeadId={selected}
          hrefFor={() => '#'}
          showOwner={showOwner}
          emptyLabel="No conversations in this view."
          onSelect={(leadId) => setSelected(leadId)}
        />
      </aside>

      <section aria-label="Thread" className={cn('min-w-0', selected ? '' : 'hidden md:block')}>
        <div className="flex items-center justify-between gap-2 md:hidden">
          <span className="inline-flex items-center gap-1 text-[12px] text-graphite">
            <ArrowLeft className="size-3.5" aria-hidden /> All conversations
          </span>
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

        <header className="rounded-lg border border-line bg-bone-raised p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-medium text-ink">{row.person}</h2>
              <p className="truncate text-[12px] text-graphite">
                {[row.title, row.company].filter(Boolean).join(' · ')}
              </p>
              <p className="mt-1 text-[12px] text-graphite">
                {CONVERSATION_STATE_LABEL[row.state]}
                {row.ageHours !== null ? ` · waited ${ageLabel(row.ageHours)}` : ''}
              </p>
              <p className="text-[11px] text-stone">
                {row.profileName ?? 'No profile'}
                {showOwner && row.ownerName ? ` · owner ${row.ownerName}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Link
                href="/leads"
                className="rounded-md border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink"
              >
                Open Lead
              </Link>
              <Link
                href="/tasks"
                className="rounded-md bg-solid px-2.5 py-1.5 text-[12px] font-medium text-on-solid"
              >
                Task
              </Link>
            </div>
          </div>
        </header>

        <ol className="mt-3 space-y-2" aria-label="Messages">
          {INBOX_FIXTURE_MESSAGES.map((m) => {
            const mine = m.direction === 'outbound'
            return (
              <li
                key={m.id}
                className={cn('flex', mine ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[78%] rounded-lg border px-3 py-2',
                    mine ? 'border-line bg-bone' : 'border-line bg-bone-raised',
                  )}
                >
                  <p className={cn('text-[10px] uppercase tracking-[0.1em]', mine ? 'text-stone' : 'text-orange')}>
                    {mine ? 'You' : 'Client'} · {m.kind} · {ageLabel(Math.max(0.1, (FIXTURE_NOW - Date.parse(m.at)) / 3_600_000))}
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink">{m.body}</p>
                </div>
              </li>
            )
          })}
        </ol>

        <div className="mt-3 rounded-lg border border-line bg-bone-raised p-3">
          <label htmlFor="fixture-composer" className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">
            Reply
          </label>
          <textarea
            id="fixture-composer"
            rows={3}
            placeholder="Write a reply…"
            className="mt-1.5 w-full resize-none rounded-md border border-line bg-bone px-3 py-2 text-[13px] text-ink focus:border-orange/40 focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink"
            >
              <Sparkles className="size-3.5" aria-hidden /> Generate suggestion
            </button>
            <button
              type="button"
              className="ml-auto rounded-md border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink"
            >
              Save draft
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md bg-solid px-2.5 py-1.5 text-[12px] font-medium text-on-solid"
            >
              <Send className="size-3.5" aria-hidden /> Log sent
            </button>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-dashed border-line bg-bone p-3">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
            <Lock className="size-3.5 text-stone" aria-hidden /> Internal notes
            <span className="text-[11px] font-normal text-stone">Not visible to the client</span>
          </p>
          <p className="mt-1 text-[12px] text-graphite">Asked who else is in the evaluation before sending pricing.</p>
        </div>
      </section>

      <aside aria-label="Lead context" className="hidden min-w-0 xl:block xl:max-h-[calc(100dvh-14rem)] xl:overflow-y-auto">
        <ChatIntelligencePanel intel={intel} reps={[{ id: 'rep-mehak', name: 'Mehak' }]} canIntervene={showOwner} tasksAvailable now={FIXTURE_NOW} />
      </aside>
    </div>
  )
}
