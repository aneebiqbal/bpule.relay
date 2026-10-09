'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronRight,
  Eye,
  MessageSquare,
  Target,
  Users,
  Zap,
  Briefcase,
  UserCircle2,
  BarChart3,
  Settings,
  PenLine,
  TrendingUp,
} from 'lucide-react'
import { cn } from 'cn'
import { StatusBadge } from '@/components/ui/status-badge'
import { EventsDrilldown } from '@/components/admin/events-drilldown'
import type { CommandCenterData, TeamRow, ExceptionItem, OpportunityFeedItem, TeamMemberStatus, ExceptionSeverity } from '@/lib/admin/command-center-v2'


function today(): string {
  return new Date().toISOString().split('T')[0]
}

function yesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

function formatDateLabel(date: string): string {
  const d = new Date(date + 'T00:00:00')
  const todayDate = today()
  if (date === todayDate) return 'Today'
  const yestDate = yesterday()
  if (date === yestDate) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatMinutesAgo(min: number | null): string {
  if (min === null) return '—'
  if (min < 60) return `${min}m ago`
  if (min < 1440) return `${Math.floor(min / 60)}h ago`
  return `${Math.floor(min / 1440)}d ago`
}


function statusConfig(status: TeamMemberStatus): { label: string; variant: 'success' | 'warning' | 'danger' | 'orange' | 'neutral' } {
  switch (status) {
    case 'active': return { label: 'Active', variant: 'success' }
    case 'waiting': return { label: 'Waiting', variant: 'neutral' }
    case 'needs_attention': return { label: 'Needs attention', variant: 'warning' }
    case 'inactive': return { label: 'Inactive', variant: 'danger' }
  }
}

function severityConfig(severity: ExceptionSeverity): { label: string; variant: 'warning' | 'danger' | 'orange' } {
  switch (severity) {
    case 'attention': return { label: 'Attention', variant: 'warning' }
    case 'urgent': return { label: 'Urgent', variant: 'orange' }
    case 'critical': return { label: 'Critical', variant: 'danger' }
  }
}


const OPERATE_NAV = [
  { href: '/admin/revenue-identities', label: 'Identities', icon: UserCircle2, detail: 'Sender identities' },
  { href: '/admin/targets', label: 'Targets', icon: Target, detail: 'Daily expectations' },
  { href: '/admin/people', label: 'People', icon: Users, detail: 'Roles and teams' },
  { href: '/admin/revenue-intelligence', label: 'Revenue', icon: BarChart3, detail: 'Funnel analytics' },
  { href: '/leads', label: 'Leads', icon: Target, detail: 'All prospects' },
  { href: '/inbound', label: 'Inbound', icon: MessageSquare, detail: 'Replies waiting' },
  { href: '/upwork', label: 'Jobs', icon: Briefcase, detail: 'Upwork pipeline' },
  { href: '/relay', label: 'Conversations', icon: MessageSquare, detail: 'Live threads' },
  { href: '/content', label: 'Studio', icon: PenLine, detail: 'Content engine' },
  { href: '/content-v2/growth', label: 'Growth', icon: TrendingUp, detail: 'Editorial' },
  { href: '/profiles', label: 'Profiles', icon: UserCircle2, detail: 'Team profiles' },
  { href: '/admin/ai-usage', label: 'AI Runtime', icon: Settings, detail: 'Provider health' },
]


export function CommandCenterV2() {
  const [date, setDate] = useState(today())
  const [data, setData] = useState<CommandCenterData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedRep, setExpandedRep] = useState<string | null>(null)
  const [drilldown, setDrilldown] = useState<{ action: string; repId: string | null } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/command-center-v2?date=${date}`)
        if (res.ok && !cancelled) {
          const json = await res.json()
          setData(json)
        }
      } catch (err) {
        if (!cancelled) console.error('Failed to load command center:', err)
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [date])

  return (
    <div className="min-h-screen bg-bone pb-10">
      {/* Header */}
      <header className="border-b border-line bg-bone-raised">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-6">
          <div>
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange-light">
              Command Center
            </p>
            <h1 className="mt-1 text-[22px] font-medium tracking-[-0.02em] text-ink">
              {formatDateLabel(date)}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <DateNavigator date={date} onChange={setDate} />
          </div>
        </div>
      </header>

      {/* Events drill-down drawer */}
      {drilldown && (
        <EventsDrilldown
          date={date}
          actionType={drilldown.action}
          repId={drilldown.repId}
          onClose={() => setDrilldown(null)}
        />
      )}

      <main className="mx-auto max-w-6xl px-5 py-6 sm:px-6">
        {loading ? (
          <div className="space-y-4">
            <div className="h-24 animate-pulse rounded-lg bg-bone-raised" />
            <div className="h-48 animate-pulse rounded-lg bg-bone-raised" />
          </div>
        ) : data ? (
          <div className="space-y-6">
            {/* Since Yesterday */}
            {data.sinceYesterday && (
              <SinceYesterdaySection diff={data.sinceYesterday} />
            )}

            {/* Daily Brief */}
            <DailyBriefSection brief={data.brief} date={date} onDrilldown={(action) => setDrilldown({ action, repId: null })} />

            {/* Exceptions */}
            {data.exceptions.length > 0 && (
              <ExceptionSection exceptions={data.exceptions} />
            )}

            {/* Team */}
            <TeamSection
              team={data.team}
              expandedRep={expandedRep}
              onToggleExpand={(id) => setExpandedRep(expandedRep === id ? null : id)}
              date={date}
            />

            {/* Opportunities */}
            {data.opportunities.length > 0 && (
              <OpportunitySection opportunities={data.opportunities} />
            )}

            {/* Navigation */}
            <OperateSection />
          </div>
        ) : (
          <p className="py-12 text-center text-graphite">No data available.</p>
        )}
      </main>
    </div>
  )
}


function DateNavigator({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(yesterday())}
        className="rounded-md border border-line px-2 py-1 text-[12px] text-graphite hover:border-ink/20 hover:text-ink"
      >
        ← Prev
      </button>
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 rounded-md border border-line bg-bone-raised px-3 py-1 text-[12px] text-ink hover:border-ink/20"
        >
          <Calendar className="size-3" />
          {formatDateLabel(date)}
          <ChevronDown className="size-3" />
        </button>
        {open && (
          <div className="absolute right-0 top-full z-10 mt-1 rounded-md border border-line bg-bone-raised p-1 shadow-lg">
            {[
              { label: 'Today', value: today() },
              { label: 'Yesterday', value: yesterday() },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className={cn(
                  'block w-full rounded px-3 py-1.5 text-left text-[12px] hover:bg-bone',
                  date === opt.value ? 'text-orange font-medium' : 'text-ink',
                )}
              >
                {opt.label}
              </button>
            ))}
            <div className="border-t border-line/60 px-2 py-1">
              <input
                type="date"
                value={date}
                onChange={e => { onChange(e.target.value); setOpen(false) }}
                className="w-full rounded border border-line bg-bone px-2 py-1 text-[12px] text-ink"
              />
            </div>
          </div>
        )}
      </div>
      <button
        onClick={() => onChange(today())}
        className="rounded-md border border-line px-2 py-1 text-[12px] text-graphite hover:border-ink/20 hover:text-ink"
      >
        Today
      </button>
    </div>
  )
}


function SinceYesterdaySection({ diff }: { diff: NonNullable<CommandCenterData['sinceYesterday']> }) {
  const items: Array<{ label: string; positive: boolean }> = []

  if (diff.newLeads > 0) items.push({ label: `${diff.newLeads} new lead${diff.newLeads === 1 ? '' : 's'}`, positive: true })
  if (diff.newReplies > 0) items.push({ label: `${diff.newReplies} new repl${diff.newReplies === 1 ? 'y' : 'ies'}`, positive: true })
  if (diff.opportunitiesAdvanced > 0) items.push({ label: `${diff.opportunitiesAdvanced} opportun${diff.opportunitiesAdvanced === 1 ? 'ity' : 'ies'} advanced`, positive: true })
  if (diff.wins > 0) items.push({ label: `${diff.wins} win${diff.wins === 1 ? '' : 's'}`, positive: true })
  if (diff.leadsWentStale > 0) items.push({ label: `${diff.leadsWentStale} lead${diff.leadsWentStale === 1 ? '' : 's'} went stale`, positive: false })
  if (diff.referralsUntouched > 0) items.push({ label: `${diff.referralsUntouched} referral${diff.referralsUntouched === 1 ? '' : 's'} untouched`, positive: false })
  if (diff.repsWentInactive > 0) items.push({ label: `${diff.repsWentInactive} rep${diff.repsWentInactive === 1 ? '' : 's'} inactive`, positive: false })

  if (items.length === 0) return null

  return (
    <section className="rounded-lg border border-line bg-bone-raised p-5">
      <div className="flex items-center gap-2">
        <Zap className="size-4 text-orange" />
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
          Since yesterday
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        {items.map((item, i) => (
          <span key={i} className={item.positive ? 'text-status-success' : 'text-status-warning'}>
            {item.positive ? '+' : ''}{item.label}
          </span>
        ))}
      </div>
    </section>
  )
}


function DailyBriefSection({ brief, date, onDrilldown }: { brief: CommandCenterData['brief']; date: string; onDrilldown: (action: string) => void }) {
  const isToday = date === today()

  return (
    <section className="rounded-lg border border-line bg-bone-raised p-5">
      <div className="flex items-center gap-2">
        <Zap className="size-4 text-orange" />
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
          {isToday ? 'Operating Brief' : `Operating Brief — ${formatDateLabel(date)}`}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink">
        <span><strong>{brief.activeReps}</strong> {isToday ? 'active' : 'active'} reps</span>
        {brief.connectionsSent > 0 && (
          <button onClick={() => onDrilldown('CONNECTION_SENT')} className="hover:text-orange">
            <strong>{brief.connectionsSent}</strong> connections
          </button>
        )}
        {brief.dmsSent > 0 && (
          <button onClick={() => onDrilldown('DM_SENT')} className="hover:text-orange">
            <strong>{brief.dmsSent}</strong> DMs
          </button>
        )}
        {brief.followupsSent > 0 && (
          <button onClick={() => onDrilldown('FOLLOWUP_SENT')} className="hover:text-orange">
            <strong>{brief.followupsSent}</strong> follow-ups
          </button>
        )}
        {brief.repliesReceived > 0 && (
          <button onClick={() => onDrilldown('REPLY_RECEIVED')} className="hover:text-orange">
            <strong>{brief.repliesReceived}</strong> replies
          </button>
        )}
        {brief.leadsExtracted > 0 && (
          <button onClick={() => onDrilldown('LEAD_EXTRACTED')} className="hover:text-orange">
            <strong>{brief.leadsExtracted}</strong> leads
          </button>
        )}
        {brief.opportunities > 0 && (
          <button onClick={() => onDrilldown('OPPORTUNITY_CREATED')} className="text-orange hover:text-orange-light">
            <strong>{brief.opportunities}</strong> opportunities
          </button>
        )}
      </div>
    </section>
  )
}


function ExceptionSection({ exceptions }: { exceptions: ExceptionItem[] }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? exceptions : exceptions.slice(0, 6)

  return (
    <section className="rounded-lg border border-line bg-bone-raised">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-status-warning" />
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
            Exceptions · {exceptions.length}
          </p>
        </div>
        {exceptions.length > 6 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-[12px] text-graphite hover:text-ink"
          >
            {showAll ? 'Show less' : `Show all ${exceptions.length}`}
          </button>
        )}
      </div>
      <div className="divide-y divide-line/60">
        {visible.map(item => {
          const sev = severityConfig(item.severity)
          return (
            <div key={item.id} className="flex items-start gap-3 px-5 py-3">
              <StatusBadge status={sev.label} variant={sev.variant} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink">{item.title}</p>
                <p className="text-[12px] text-graphite">{item.detail}</p>
              </div>
              {item.leadId && (
                <Link
                  href={`/leads/${item.leadId}`}
                  className="shrink-0 rounded-md border border-line px-2 py-1 text-[11px] text-graphite hover:border-ink/20 hover:text-ink"
                >
                  Open
                </Link>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}


function TeamSection({
  team,
  expandedRep,
  onToggleExpand,
  date,
}: {
  team: TeamRow[]
  expandedRep: string | null
  onToggleExpand: (id: string) => void
  date: string
}) {
  return (
    <section className="rounded-lg border border-line bg-bone-raised">
      <div className="flex items-center gap-2 border-b border-line px-5 py-3">
        <Users className="size-4 text-stone" />
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
          Team · {team.length}
        </p>
      </div>
      <div className="divide-y divide-line/60">
        {team.map(row => {
          const cfg = statusConfig(row.status)
          const isExpanded = expandedRep === row.repId
          return (
            <div key={row.repId}>
              <div
                className="flex cursor-pointer items-center gap-3 px-5 py-3 hover:bg-bone/50"
                onClick={() => onToggleExpand(row.repId)}
              >
                <ChevronRight className={cn('size-3.5 text-stone transition-transform', isExpanded && 'rotate-90')} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/team/${row.repId}?date=${date}`}
                      className="text-[13px] font-medium text-ink hover:underline"
                      onClick={e => e.stopPropagation()}
                    >
                      {row.repName}
                    </Link>
                    <StatusBadge status={cfg.label} variant={cfg.variant} />
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[12px] text-graphite">
                  {row.actionsToday > 0 && (
                    <span className="hidden sm:flex items-center gap-3">
                      {row.connectionsSent > 0 && <span>{row.connectionsSent} conn</span>}
                      {row.dmsSent > 0 && <span>{row.dmsSent} DM</span>}
                      {row.followupsSent > 0 && <span>{row.followupsSent} follow</span>}
                      {row.repliesReceived > 0 && <span>{row.repliesReceived} reply</span>}
                    </span>
                  )}
                  {row.pendingReplies > 0 && (
                    <span className="text-status-warning">{row.pendingReplies} waiting</span>
                  )}
                  <span className="w-16 text-right text-stone">
                    {formatMinutesAgo(row.lastActivityMinutes)}
                  </span>
                </div>
              </div>
              {isExpanded && (
                <div className="border-t border-line/40 bg-bone/30 px-5 py-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <MiniStat label="Actions" value={row.actionsToday} />
                    <MiniStat label="Assigned" value={row.assignedLeads} />
                    <MiniStat label="Pending replies" value={row.pendingReplies} highlight={row.pendingReplies > 0} />
                    <MiniStat label="Last active" value={formatMinutesAgo(row.lastActivityMinutes)} isText />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Link
                      href={`/team/${row.repId}?date=${date}`}
                      className="rounded-md border border-line px-3 py-1.5 text-[12px] text-ink hover:border-ink/20"
                    >
                      View timeline
                    </Link>
                    {row.pendingReplies > 0 && (
                      <Link
                        href={`/inbound?repId=${row.repId}`}
                        className="rounded-md border border-status-warning/30 bg-status-warning/5 px-3 py-1.5 text-[12px] text-status-warning hover:bg-status-warning/10"
                      >
                        View replies
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function MiniStat({ label, value, highlight, isText }: { label: string; value: number | string; highlight?: boolean; isText?: boolean }) {
  return (
    <div>
      <p className="text-mono-medium text-[9px] uppercase tracking-[0.12em] text-stone">{label}</p>
      <p className={cn(
        'mt-0.5 text-[14px] font-medium',
        highlight ? 'text-status-warning' : 'text-ink',
      )}>
        {isText ? value : (typeof value === 'number' ? value.toLocaleString() : value)}
      </p>
    </div>
  )
}


function OpportunitySection({ opportunities }: { opportunities: OpportunityFeedItem[] }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? opportunities : opportunities.slice(0, 5)

  return (
    <section className="rounded-lg border border-line bg-bone-raised">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <div className="flex items-center gap-2">
          <Eye className="size-4 text-orange" />
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
            Opportunities · {opportunities.length}
          </p>
        </div>
        {opportunities.length > 5 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-[12px] text-graphite hover:text-ink"
          >
            {showAll ? 'Show less' : `Show all ${opportunities.length}`}
          </button>
        )}
      </div>
      <div className="divide-y divide-line/60">
        {visible.map(opp => {
          const hasWeakProfile = opp.recommendedProfileScore !== null &&
            opp.currentProfileScore !== null &&
            opp.recommendedProfileScore > opp.currentProfileScore + 15

          return (
            <div key={opp.leadId} className="flex items-start gap-3 px-5 py-3">
              <div className="mt-0.5 shrink-0 rounded bg-orange/10 px-2 py-0.5 text-mono-medium text-[11px] font-medium text-orange">
                {opp.score}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link href={`/leads/${opp.leadId}`} className="text-[13px] font-medium text-ink hover:underline">
                    {opp.company}
                  </Link>
                  {opp.contactName && (
                    <span className="text-[11px] text-stone">{opp.contactName}</span>
                  )}
                </div>
                <p className="text-[12px] text-graphite">
                  {opp.repName} · {opp.currentStage}
                  {opp.daysSinceAction !== null && opp.daysSinceAction > 3 && (
                    <span className="text-status-warning"> · {opp.daysSinceAction}d idle</span>
                  )}
                </p>
                {hasWeakProfile && (
                  <p className="mt-1 text-[11px] text-orange">
                    <AlertTriangle className="mr-1 inline size-3" />
                    Best profile: {opp.recommendedProfileName} ({opp.recommendedProfileScore}) vs current {opp.currentProfileName} ({opp.currentProfileScore})
                  </p>
                )}
              </div>
              <Link
                href={`/leads/${opp.leadId}`}
                className="shrink-0 rounded-md border border-line px-2 py-1 text-[11px] text-graphite hover:border-ink/20 hover:text-ink"
              >
                Open
              </Link>
            </div>
          )
        })}
      </div>
    </section>
  )
}


function OperateSection() {
  return (
    <section>
      <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Operate</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {OPERATE_NAV.map(item => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 rounded-md border border-line bg-bone-raised px-3 py-2.5 transition-colors hover:border-ink/20"
            >
              <Icon className="size-3.5 shrink-0 text-stone" />
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-ink">{item.label}</p>
                <p className="truncate text-[10px] text-graphite">{item.detail}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
