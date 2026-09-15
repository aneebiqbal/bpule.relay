import type { ComponentType } from 'react'
import Link from 'next/link'
import {
  MessageCircle,
  Clock,
  Target,
  Search,
  FileText,
  Snowflake,
  PenLine,
  Shield,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { buildRoleContext } from '@/lib/relay/role-intelligence'
import { buildRelayQueue, filterQueueByRole } from '@/lib/relay/queue-engine'
import type { RelayTask, RelayTaskKind } from '@/lib/domain/types'
import { cn } from 'cn'

export const dynamic = 'force-dynamic'

function kindLabel(kind: RelayTaskKind): string {
  switch (kind) {
    case 'reply_needed': return 'Reply needed'
    case 'followup_due': return 'Follow-up'
    case 'high_fit_lead': return 'High-fit'
    case 'new_opportunity': return 'Opportunity'
    case 'job_worth_apply': return 'Apply'
    case 'proposal_ready': return 'Proposal ready'
    case 'lead_going_cold': return 'Going cold'
    case 'content_opportunity': return 'Content'
    case 'admin_review': return 'Admin'
    case 'inbound_opportunity': return 'Inbound'
  }
}

function priorityColor(p: RelayTask['priority']): string {
  switch (p) {
    case 'urgent': return 'text-red-500'
    case 'high': return 'text-orange'
    case 'medium': return 'text-graphite'
    case 'low': return 'text-stone'
  }
}

function priorityBg(p: RelayTask['priority']): string {
  switch (p) {
    case 'urgent': return 'bg-red-500/10 border-red-500/20'
    case 'high': return 'bg-orange/10 border-orange/20'
    case 'medium': return 'bg-bone border-line'
    case 'low': return 'bg-bone-raised border-line'
  }
}

function entityHref(task: RelayTask): string {
  if (task.entityType === 'lead') return `/leads/${task.entityId}`
  if (task.entityType === 'job') return `/upwork/${task.entityId}`
  return '#'
}

const KIND_ICON_MAP: Record<RelayTaskKind, ComponentType<{ className?: string }>> = {
  reply_needed: MessageCircle,
  followup_due: Clock,
  high_fit_lead: Target,
  new_opportunity: Search,
  job_worth_apply: FileText,
  proposal_ready: PenLine,
  lead_going_cold: Snowflake,
  content_opportunity: PenLine,
  admin_review: Shield,
  inbound_opportunity: MessageCircle,
}

function TaskIcon({ kind, size = 'md', priority }: { kind: RelayTaskKind; size?: 'sm' | 'md'; priority: RelayTask['priority'] }) {
  const Icon = KIND_ICON_MAP[kind]
  return <Icon className={cn(size === 'md' ? 'size-5' : 'size-4', priorityColor(priority))} />
}

function TaskCard({ task, featured = false }: { task: RelayTask; featured?: boolean }) {
  return (
    <Link
      href={entityHref(task)}
      className={cn(
        'group block rounded-xl border p-4 transition-all hover:shadow-sm',
        featured ? priorityBg(task.priority) : 'border-line bg-bone-raised hover:bg-bone',
        task.stale && 'opacity-70',
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          'flex shrink-0 items-center justify-center rounded-lg',
          featured ? 'size-10' : 'size-8',
          task.priority === 'urgent' ? 'bg-red-500/10' : 'bg-bone',
        )}>
           <TaskIcon kind={task.kind} size={featured ? 'md' : 'sm'} priority={task.priority} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-medium',
              task.priority === 'urgent' ? 'bg-red-500/10 text-red-500' :
              task.priority === 'high' ? 'bg-orange/10 text-orange' :
              'bg-bone text-graphite',
            )}>
              {kindLabel(task.kind)}
            </span>
            {task.stale && (
              <span className="flex items-center gap-1 text-[10px] text-stone">
                <AlertTriangle className="size-3" />
                Stale
              </span>
            )}
            {task.recommendation.forbidsImpersonation && (
              <span className="flex items-center gap-1 text-[10px] text-stone">
                <Shield className="size-3" />
                Human only
              </span>
            )}
          </div>
          <h3 className={cn(
            'font-medium text-ink',
            featured ? 'mt-1.5 text-[16px]' : 'mt-1 text-[14px]',
          )}>
            {task.title}
          </h3>
          <p className={cn(
            'text-graphite',
            featured ? 'mt-0.5 text-[13px]' : 'text-[12px]',
          )}>
            {task.subtitle}
          </p>

          {/* What happened + why */}
          <div className={cn(
            'mt-2 space-y-1',
            !featured && 'hidden sm:block',
          )}>
            <p className="text-[12px] text-graphite">
              <span className="font-medium text-ink">What:</span> {task.whatHappened}
            </p>
            <p className="text-[12px] text-graphite">
              <span className="font-medium text-ink">Why:</span> {task.whyItMatters}
            </p>
          </div>

          {/* Evidence trail */}
          {featured && task.recommendation.evidence.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-[11px] font-medium text-stone uppercase tracking-wide">Evidence</p>
              {task.recommendation.evidence.map((e, i) => (
                <p key={i} className="flex items-start gap-1.5 text-[11px] text-graphite">
                  {e.verified ? (
                    <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-status-success" />
                  ) : (
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-stone" />
                  )}
                  <span className="line-clamp-1">{e.detail}</span>
                </p>
              ))}
            </div>
          )}

          {/* Prepared output */}
          {featured && task.recommendation.preparedOutput && (
            <div className="mt-3 rounded-lg bg-bone p-3 border border-line">
              <p className="text-[11px] font-medium text-stone uppercase tracking-wide">Prepared</p>
              <p className="mt-1 text-[12px] text-graphite line-clamp-3">
                {task.recommendation.preparedOutput}
              </p>
            </div>
          )}

          {/* Human action */}
          {featured && (
            <div className="mt-3 flex items-center justify-between">
              <p className="text-[12px] font-medium text-orange">
                Action: {task.humanAction}
              </p>
              <span className="inline-flex items-center gap-1 text-[12px] font-medium text-orange opacity-0 transition-opacity group-hover:opacity-100">
                Open <ChevronRight className="size-3" />
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

export default async function RelayPage() {
  const user = await getCurrentUser()
  if (!user) {
    return (
      <div className="rounded-lg border border-line p-8 text-center">
        <p className="text-[15px] font-medium text-ink">Not authenticated.</p>
      </div>
    )
  }
  const store = await createScoutStore()
  const roleContext = buildRoleContext(user.rep, user.organization)

  const [dash, relayData, allLeads] = await Promise.all([
    store.getTodayDashboard(),
    store.getRelayQueueData(),
    store.fetchLeadsAll(),
  ])

  const queue = buildRelayQueue({
    roleContext,
    queueData: dash.mine,
    followupsDue: dash.followupsDue,
    upwork: dash.upwork,
    conversations: relayData.conversations,
    messagesByLead: relayData.messagesByLead,
    messagesByJob: relayData.messagesByJob,
    assignedProfiles: relayData.assignedProfiles,
    allLeads,
  })

  const visibleTasks = filterQueueByRole(queue, roleContext.role)
  const [topAction, ...restQueue] = visibleTasks

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="reveal-up flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-label text-stone">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </p>
          <h1 className="text-display text-[28px] text-ink mt-1">
            Relay
          </h1>
          <p className="text-[14px] text-graphite mt-1">
            {queue.summary.total > 0
              ? `${queue.summary.total} ${queue.summary.total === 1 ? 'item' : 'items'} prepared for you${queue.summary.urgent > 0 ? ` · ${queue.summary.urgent} urgent` : ''}.`
              : 'Nothing needs your attention.'}
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-ink transition-all hover:bg-bone"
        >
          <ArrowRight className="size-4 rotate-180" />
          Back to Today
        </Link>
      </header>

      {/* Top Action Hero */}
      {topAction && (
        <section className="reveal-up stagger-1">
          <TaskCard task={topAction} featured />
        </section>
      )}

      {/* Queue list */}
      {restQueue.length > 0 && (
        <section className="reveal-up stagger-2 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-label text-stone">Queue</h2>
            <span className="text-mono-medium text-[11px] text-stone">
              {restQueue.length} more
            </span>
          </div>
          <div className="space-y-2">
            {restQueue.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {!topAction && restQueue.length === 0 && (
        <section className="reveal-up stagger-2 rounded-lg border border-dashed border-line py-12 text-center">
          <div className="mx-auto max-w-sm space-y-3">
            <p className="text-[15px] font-medium text-ink">
              Relay has nothing prepared right now.
            </p>
            <p className="text-[13px] leading-relaxed text-graphite">
              {roleContext.role === 'admin'
                ? 'Team is on track. Check back when new leads arrive or replies come in.'
                : 'All clear. Time to prospect, work on content, or refine your profiles.'}
            </p>
            <div className="flex items-center justify-center gap-2">
              <Link
                href="/prospect"
                className="inline-flex items-center gap-2 rounded-lg bg-orange px-4 py-2 text-[13px] font-medium text-bone transition-all hover:bg-orange-dark"
              >
                <Search className="size-4" />
                Check a prospect
              </Link>
              <Link
                href="/leads/new"
                className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-bone transition-all hover:bg-ink/90"
              >
                New lead
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Principle reminder */}
      <section className="reveal-up stagger-3 rounded-lg border border-line bg-bone-raised p-4">
        <div className="flex items-start gap-3">
          <Shield className="size-5 shrink-0 text-stone mt-0.5" />
          <div>
            <p className="text-[13px] font-medium text-ink">Relay prepares, you act.</p>
            <p className="mt-0.5 text-[12px] text-graphite">
              Every recommendation is traceable to its source. Relay never sends outreach,
              applies to jobs, or impersonates you. The human is always the final actor.
            </p>
          </div>
        </div>
      </section>

      <div className="h-4 lg:hidden" />
    </div>
  )
}
