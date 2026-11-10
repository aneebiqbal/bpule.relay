import Link from 'next/link'
import { StatusBadge } from '@/components/ui/status-badge'
import { AssignTaskButton } from '@/components/operations/assign-task-button'
import { NotesPanel } from '@/components/operations/notes-panel'
import { InlineEmpty } from '@/components/operations/ops-primitives'
import { Collapsible } from '@/components/chats/collapsible'
import type { ChatIntelligence } from '@/lib/operations/chat-intelligence'

const INTENT_VARIANT: Record<string, 'success' | 'info' | 'neutral'> = { HIGH: 'success', MEDIUM: 'info', LOW: 'neutral', UNKNOWN: 'neutral' }

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone">{label}</dt>
      <dd className="mt-0.5 truncate text-[12px] text-ink">{children}</dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line/70 bg-bone p-3">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  )
}

function List({ title, items, tone }: { title: string; items: string[]; tone?: 'warning' | 'success' | 'orange' }) {
  if (items.length === 0) return null
  const color = tone === 'warning' ? 'text-status-warning' : tone === 'success' ? 'text-status-success' : tone === 'orange' ? 'text-[#9e4517]' : 'text-stone'
  return (
    <div className="mt-2">
      <p className={`text-[10px] font-medium uppercase tracking-wider ${color}`}>{title}</p>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[12px] text-graphite">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  )
}

function dueLabel(iso: string | null, now: number): string {
  if (!iso) return 'No due date'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 'No due date'
  const days = Math.ceil((t - now) / 86_400_000)
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Tomorrow'
  return `Due in ${days}d`
}

function historyDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Right pane: a compact sales card. Overview, next action, related work,
 * internal notes and lead history. Every fact is canonical intelligence —
 * nothing is recomputed here. Deep thesis / facts stay collapsed; internal
 * notes render in their own panel, never inside the thread.
 */
export function ChatIntelligencePanel({
  intel,
  reps,
  canIntervene,
  tasksAvailable,
  now,
}: {
  intel: ChatIntelligence
  reps: Array<{ id: string; name: string }>
  canIntervene: boolean
  tasksAvailable: boolean
  /** Display clock, supplied by the server page so SSR and client agree. */
  now?: number
}) {
  const clock = now ?? Date.now()
  const c = intel.conversation
  return (
    <div className="space-y-3" aria-label="Lead context">
      <section className="rounded-lg border border-line bg-bone p-3">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Overview</h3>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
          <Fact label="Stage">{intel.stage ?? intel.status ?? '—'}</Fact>
          <Fact label="Score">
            {intel.score !== null ? (
              <>
                {intel.score}
                {intel.qualification ? <span className="text-stone"> · {intel.qualification.replaceAll('_', ' ').toLowerCase()}</span> : null}
              </>
            ) : (
              <span className="text-stone">Not scored</span>
            )}
          </Fact>
          <Fact label="Intent">
            {intel.buyerIntent ? (
              <StatusBadge
                status={intel.buyerIntent}
                variant={INTENT_VARIANT[intel.buyerIntent] ?? 'neutral'}
                className={intel.buyerIntent === 'HIGH' ? 'text-[#1f5e3c]' : intel.buyerIntent === 'MEDIUM' ? 'text-cobalt-dark' : undefined}
              />
            ) : (
              <span className="text-stone">Unknown</span>
            )}
          </Fact>
        </dl>
        <p className="mt-3 rounded-md bg-bone-raised px-2.5 py-2 text-[12px] ring-1 ring-line/70">
          <span className="text-stone">Next action: </span>
          <span className="font-medium text-ink">{c?.nextAction ?? 'Start the conversation'}</span>
        </p>
      </section>

      {(intel.thesis || intel.facts) && (
        <Section title="Sales context">
          <Collapsible label="Why this account" count={null}>
            {intel.thesis && (
              <dl className="space-y-1.5 text-[12px]">
                {intel.thesis.whyThisAccount && <Row label="Why this account" value={intel.thesis.whyThisAccount} />}
                {intel.thesis.likelyOpportunity && <Row label="Opportunity" value={intel.thesis.likelyOpportunity} />}
                {intel.thesis.whyThisSender && <Row label="Why this sender" value={intel.thesis.whyThisSender} />}
                {intel.thesis.bestEntryPoint && <Row label="Entry point" value={intel.thesis.bestEntryPoint} />}
              </dl>
            )}
            {intel.thesis && <List title="Missing evidence" items={intel.thesis.missingEvidence} tone="warning" />}
            {intel.thesis && <List title="Risks" items={intel.thesis.risks} tone="warning" />}
            {intel.facts && (
              <dl className="space-y-1.5 text-[12px]">
                <Row label="Need" value={intel.facts.need} />
                <Row label="Timeline" value={intel.facts.timeline} />
                <Row label="Budget" value={intel.facts.budget} />
                <Row label="Decision maker" value={intel.facts.decisionMaker} />
                {intel.facts.nextStepNotes && <Row label="Next step" value={intel.facts.nextStepNotes} />}
              </dl>
            )}
            {intel.facts && <List title="Waiting for your answer" items={intel.facts.openQuestions} tone="orange" />}
            {intel.facts && <List title="Buying signals" items={intel.facts.buyingSignals} tone="success" />}
            {intel.facts && <List title="Objections" items={intel.facts.objections} tone="warning" />}
          </Collapsible>
        </Section>
      )}

      <Section title="Related work">
        {intel.openTasks === null ? (
          <p className="text-[12px] text-graphite">Tasks could not be loaded. The conversation is still available.</p>
        ) : intel.openTasks.length === 0 ? (
          <InlineEmpty>No open tasks on this lead.</InlineEmpty>
        ) : (
          <ul className="space-y-1.5">
            {intel.openTasks.map((t) => (
              <li key={t.id}>
                <Link href={`/tasks?task=assigned:${t.id}`} className="block rounded-md px-1.5 py-1 text-[12px] transition-colors hover:bg-bone-raised">
                  <span className="block truncate text-ink">{t.title}</span>
                  <span className="mt-0.5 block text-[11px] text-stone">
                    {t.assigneeName ?? 'Unassigned'} · {dueLabel(t.dueAt, clock)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {canIntervene && tasksAvailable && reps.length > 0 && (
          <div className="mt-2 border-t border-line/70 pt-2">
            <AssignTaskButton
              reps={reps}
              defaultLeadId={intel.leadId}
              defaultProfileId={intel.profileId ?? undefined}
              defaultRevenueIdentityId={intel.revenueIdentityId ?? undefined}
              defaultTitle={intel.company ? `Follow up with ${intel.company}` : undefined}
            />
          </div>
        )}
      </Section>

      <section id="chat-notes" className="scroll-mt-20 rounded-lg border border-line/70 bg-bone p-3">
        <Collapsible label="Internal notes" count={intel.noteCount}>
          <NotesPanel subjectType="LEAD" subjectId={intel.leadId} title="Notes" />
        </Collapsible>
      </section>

      <section className="rounded-lg border border-line/70 bg-bone p-3">
        <Collapsible label="Lead history" count={intel.history.length || null}>
          {intel.history.length === 0 ? (
            <p className="px-2 text-[12px] text-graphite">No history recorded yet.</p>
          ) : (
            <ul className="space-y-1.5 px-2">
              {intel.history.map((h) => (
                <li key={h.id} className="flex items-baseline gap-2 text-[12px]">
                  <span className="w-12 shrink-0 tabular-nums text-stone">{historyDate(h.at)}</span>
                  <span className="min-w-0 flex-1 text-ink">{h.event}</span>
                  <span className="shrink-0 text-[11px] text-stone">{h.actorName ?? 'System'}</span>
                </li>
              ))}
            </ul>
          )}
        </Collapsible>
      </section>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
        <Link href={`/leads/${intel.leadId}`} className="font-medium text-graphite hover:text-ink">
          View full lead →
        </Link>
        {intel.companyKey && (
          <Link href={`/accounts/${encodeURIComponent(intel.companyKey)}`} className="text-graphite hover:text-ink">
            Open account →
          </Link>
        )}
        {intel.ownerRepId && (
          <Link href={`/team/${intel.ownerRepId}`} className="text-graphite hover:text-ink">
            Open rep →
          </Link>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-stone">{label}</dt>
      <dd className="min-w-0 text-ink">{value ?? '—'}</dd>
    </div>
  )
}
