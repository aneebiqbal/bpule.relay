import Link from 'next/link'
import { StatusBadge } from '@/components/ui/status-badge'
import { InterventionMenu } from '@/components/operations/intervention-menu'
import { AssignTaskButton } from '@/components/operations/assign-task-button'
import { NotesPanel } from '@/components/operations/notes-panel'
import { InlineEmpty, ageLabel, relativeTime } from '@/components/operations/ops-primitives'
import { CONVERSATION_STATE_LABEL } from '@/lib/operations/conversations'
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

/**
 * Right pane: who this is, where the deal stands and what to do next. Every
 * fact is canonical intelligence — nothing is recomputed here. Internal notes
 * render in their own panel, never inside the thread.
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
      <section className="rounded-lg border border-line bg-bone p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-medium tracking-[-0.01em] text-ink">{intel.person}</h2>
            <p className="mt-0.5 truncate text-[12px] text-graphite">
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
          {canIntervene && (
            <InterventionMenu
              repId={intel.ownerRepId}
              leadId={intel.leadId}
              companyKey={intel.companyKey}
              reps={reps}
              canAssign={tasksAvailable}
              notesAnchor="#chat-notes"
              label="Act"
            />
          )}
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
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
          <Fact label="Waiting">
            {c ? (
              <>
                {CONVERSATION_STATE_LABEL[c.state]}
                {c.ageHours !== null ? ` · ${ageLabel(c.ageHours)}` : ''}
              </>
            ) : (
              <span className="text-stone">No conversation yet</span>
            )}
          </Fact>
          <Fact label="Owner">{intel.ownerName ?? <span className="text-status-warning">Unassigned</span>}</Fact>
          <Fact label="Profile">{intel.profileName ?? <span className="text-status-warning">Not assigned</span>}</Fact>
        </dl>

        <p className="mt-3 rounded-md bg-bone-raised px-2.5 py-2 text-[12px] ring-1 ring-line/70">
          <span className="text-stone">Next action: </span>
          <span className="font-medium text-ink">{c?.nextAction ?? 'Start the conversation'}</span>
          {intel.ownerName && <span className="text-stone"> · owner {intel.ownerName}</span>}
        </p>
      </section>

      {intel.thesis && (
        <Section title="Sales thesis">
          <dl className="space-y-1.5 text-[12px]">
            {intel.thesis.whyThisAccount && <Row label="Why this account" value={intel.thesis.whyThisAccount} />}
            {intel.thesis.likelyOpportunity && <Row label="Opportunity" value={intel.thesis.likelyOpportunity} />}
            {intel.thesis.whyThisSender && <Row label="Why this sender" value={intel.thesis.whyThisSender} />}
            {intel.thesis.bestEntryPoint && <Row label="Entry point" value={intel.thesis.bestEntryPoint} />}
          </dl>
          <List title="Missing evidence" items={intel.thesis.missingEvidence} tone="warning" />
          <List title="Risks" items={intel.thesis.risks} tone="warning" />
          {intel.thesis.confidence && <p className="mt-2 text-[11px] text-stone">Confidence: {intel.thesis.confidence}</p>}
        </Section>
      )}

      {intel.facts && (
        <Section title="Conversation facts">
          <dl className="space-y-1.5 text-[12px]">
            <Row label="Need" value={intel.facts.need} />
            <Row label="Timeline" value={intel.facts.timeline} />
            <Row label="Budget" value={intel.facts.budget} />
            <Row label="Decision maker" value={intel.facts.decisionMaker} />
            {intel.facts.nextStepNotes && <Row label="Next step" value={intel.facts.nextStepNotes} />}
          </dl>
          <List title="Waiting for your answer" items={intel.facts.openQuestions} tone="orange" />
          <List title="Buying signals" items={intel.facts.buyingSignals} tone="success" />
          <List title="Objections" items={intel.facts.objections} tone="warning" />
        </Section>
      )}

      <Section title="Open tasks">
        {intel.openTasks === null ? (
          <p className="text-[12px] text-graphite">This feature is unavailable right now.</p>
        ) : intel.openTasks.length === 0 ? (
          <InlineEmpty>No open tasks on this lead.</InlineEmpty>
        ) : (
          <ul className="space-y-1">
            {intel.openTasks.map((t) => (
              <li key={t.id}>
                <Link href={`/tasks?task=assigned:${t.id}`} className="flex justify-between gap-2 text-[12px] hover:underline">
                  <span className="truncate text-ink">{t.title}</span>
                  <span className="shrink-0 text-stone">{t.dueAt ? relativeTime(t.dueAt, clock).replace(' ago', 'overdue') : t.priority.toLowerCase()}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {canIntervene && reps.length > 0 && (
          <div className="mt-2 border-t border-line/70 pt-2">
            <AssignTaskButton
              reps={reps}
              defaultLeadId={intel.leadId}
              defaultProfileId={intel.profileId ?? undefined}
              defaultTitle={intel.company ? `Follow up with ${intel.company}` : undefined}
            />
          </div>
        )}
      </Section>

      <div id="chat-notes" className="scroll-mt-20">
        <NotesPanel subjectType="LEAD" subjectId={intel.leadId} />
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
        <Link href={`/leads/${intel.leadId}`} className="font-medium text-graphite hover:text-ink">
          Open full lead →
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
        <a href="#chat-notes" className="text-graphite hover:text-ink">
          Add note →
        </a>
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
