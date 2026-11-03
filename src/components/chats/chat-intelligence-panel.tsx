import Link from 'next/link'
import { StatusBadge } from '@/components/ui/status-badge'
import { InterventionMenu } from '@/components/operations/intervention-menu'
import { NotesPanel } from '@/components/operations/notes-panel'
import { InlineEmpty, ageLabel, relativeTime } from '@/components/operations/ops-primitives'
import { CONVERSATION_STATE_LABEL } from '@/lib/operations/conversations'
import type { ChatIntelligence } from '@/lib/operations/chat-intelligence'

const INTENT_VARIANT: Record<string, 'success' | 'info' | 'neutral'> = { HIGH: 'success', MEDIUM: 'info', LOW: 'neutral', UNKNOWN: 'neutral' }

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 py-1 text-[12px]">
      <dt className="text-stone">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  )
}

function List({ title, items, tone }: { title: string; items: string[]; tone?: 'warning' | 'success' | 'orange' }) {
  if (items.length === 0) return null
  const color = tone === 'warning' ? 'text-status-warning' : tone === 'success' ? 'text-status-success' : tone === 'orange' ? 'text-orange' : 'text-stone'
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

/**
 * Right pane: who, what Relay knows, what should happen next and who owns it.
 * Facts, thesis and intent come from canonical intelligence; nothing here is
 * recomputed. Internal notes render in their own panel — never in the thread.
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
    <div className="space-y-3" aria-label="Lead intelligence">
      <section className="rounded-lg border border-line bg-bone-raised p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-[14px] font-medium text-ink">{intel.person}</h2>
            <p className="truncate text-[12px] text-graphite">
              {intel.title ?? 'No title'}
              {intel.company && (
                <>
                  {' · '}
                  {intel.companyKey ? (
                    <Link href={`/accounts/${encodeURIComponent(intel.companyKey)}`} className="hover:underline">
                      {intel.company}
                    </Link>
                  ) : (
                    intel.company
                  )}
                </>
              )}
            </p>
          </div>
          <InterventionMenu
            repId={intel.ownerRepId}
            leadId={intel.leadId}
            companyKey={intel.companyKey}
            reps={reps}
            canAssign={canIntervene && tasksAvailable}
            notesAnchor="#chat-notes"
            label="Act"
          />
        </div>
        <dl className="mt-2 divide-y divide-line/60">
          <Row label="Owner">{intel.ownerName ?? <span className="text-status-warning">Unassigned</span>}</Row>
          <Row label="Sending profile">{intel.profileName ?? <span className="text-status-warning">Not assigned</span>}</Row>
          <Row label="Opportunity score">
            {intel.score !== null ? `${intel.score}${intel.qualification ? ` · ${intel.qualification.replaceAll('_', ' ').toLowerCase()}` : ''}` : 'Not scored'}
          </Row>
          <Row label="Buyer intent">
            {intel.buyerIntent ? <StatusBadge status={intel.buyerIntent} variant={INTENT_VARIANT[intel.buyerIntent] ?? 'neutral'} /> : 'Unknown'}
          </Row>
          <Row label="Stage">{intel.stage ?? intel.status ?? '—'}</Row>
          <Row label="Waiting">
            {c ? `${CONVERSATION_STATE_LABEL[c.state]}${c.ageHours !== null ? ` · ${ageLabel(c.ageHours)}` : ''}` : 'No conversation yet'}
          </Row>
          <Row label="Last inbound">{relativeTime(c?.lastInboundAt, clock)}</Row>
          <Row label="Last outbound">{relativeTime(c?.lastOutboundAt, clock)}</Row>
          {intel.lastClientIntent && <Row label="Their last intent">{intel.lastClientIntent.replaceAll('_', ' ')}</Row>}
        </dl>
        <p className="mt-2 rounded-md bg-bone px-2 py-1.5 text-[12px]">
          <span className="text-stone">Next action: </span>
          <span className="font-medium text-ink">{c?.nextAction ?? 'Start the conversation'}</span>
          {intel.ownerName && <span className="text-stone"> · owner {intel.ownerName}</span>}
        </p>
      </section>

      <section className="rounded-lg border border-line bg-bone-raised p-3" aria-label="Sales thesis">
        <h3 className="text-[12px] font-medium text-ink">Sales thesis</h3>
        {intel.thesis ? (
          <>
            <dl className="mt-1 divide-y divide-line/60">
              {intel.thesis.whyThisAccount && <Row label="Why this account">{intel.thesis.whyThisAccount}</Row>}
              {intel.thesis.likelyOpportunity && <Row label="Opportunity">{intel.thesis.likelyOpportunity}</Row>}
              {intel.thesis.whyThisSender && <Row label="Why this sender">{intel.thesis.whyThisSender}</Row>}
              {intel.thesis.bestEntryPoint && <Row label="Entry point">{intel.thesis.bestEntryPoint}</Row>}
            </dl>
            <List title="Missing evidence" items={intel.thesis.missingEvidence} tone="warning" />
            <List title="Risks" items={intel.thesis.risks} tone="warning" />
            {intel.thesis.confidence && <p className="mt-2 text-[11px] text-stone">Confidence: {intel.thesis.confidence}</p>}
          </>
        ) : (
          <p className="mt-1 text-[12px] text-graphite">No sales thesis yet for this lead.</p>
        )}
      </section>

      <section className="rounded-lg border border-line bg-bone-raised p-3" aria-label="Conversation facts">
        <h3 className="text-[12px] font-medium text-ink">Conversation facts</h3>
        {intel.facts ? (
          <>
            <dl className="mt-1 divide-y divide-line/60">
              <Row label="Need">{intel.facts.need ?? 'Unknown'}</Row>
              <Row label="Timeline">{intel.facts.timeline ?? 'Unknown'}</Row>
              <Row label="Budget">{intel.facts.budget ?? 'Unknown'}</Row>
              <Row label="Decision maker">{intel.facts.decisionMaker ?? 'Unknown'}</Row>
              {intel.facts.nextStepNotes && <Row label="Next step">{intel.facts.nextStepNotes}</Row>}
            </dl>
            <List title="Waiting for your answer" items={intel.facts.openQuestions} tone="orange" />
            <List title="Buying signals" items={intel.facts.buyingSignals} tone="success" />
            <List title="Objections" items={intel.facts.objections} tone="warning" />
          </>
        ) : (
          <p className="mt-1 text-[12px] text-graphite">Facts appear once the conversation has been analysed.</p>
        )}
      </section>

      <section className="rounded-lg border border-line bg-bone-raised p-3" aria-label="Open tasks">
        <h3 className="text-[12px] font-medium text-ink">Open tasks</h3>
        {intel.openTasks === null ? (
          <p className="mt-1 text-[12px] text-graphite">This feature is unavailable right now.</p>
        ) : intel.openTasks.length === 0 ? (
          <InlineEmpty>No open tasks on this lead.</InlineEmpty>
        ) : (
          <ul className="mt-1 space-y-1">
            {intel.openTasks.map((t) => (
              <li key={t.id}>
                <Link href={`/tasks?task=assigned:${t.id}`} className="flex justify-between gap-2 text-[12px] hover:underline">
                  <span className="truncate text-ink">{t.title}</span>
                  <span className="shrink-0 text-stone">{t.dueAt ? relativeTime(t.dueAt, clock).replace(' ago', ' overdue') : t.priority.toLowerCase()}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div id="chat-notes" className="scroll-mt-20">
        <NotesPanel subjectType="LEAD" subjectId={intel.leadId} />
      </div>

      <div className="flex flex-wrap gap-3 text-[12px]">
        <Link href={`/leads/${intel.leadId}`} className="text-graphite hover:text-ink">
          Open lead →
        </Link>
        {intel.companyKey && (
          <Link href={`/accounts/${encodeURIComponent(intel.companyKey)}`} className="text-graphite hover:text-ink">
            Open account →
          </Link>
        )}
      </div>
    </div>
  )
}
