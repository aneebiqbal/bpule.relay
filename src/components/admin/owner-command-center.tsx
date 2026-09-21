'use client'

import { use, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  BarChart3,
  Briefcase,
  MessageSquare,
  PenLine,
  Settings,
  Shield,
  Target,
  TrendingUp,
  UserCircle2,
  Users,
} from 'lucide-react'
import { cn } from 'cn'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/ui/status-badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { OrgCommandSnapshot, PersonStatus, PersonWork } from '@/lib/admin/org-command-snapshot'

const CONTROL = [
  {
    label: 'Run the org',
    items: [
      { href: '/admin/revenue-identities', label: 'Identities', detail: 'Own who the company sells as', icon: UserCircle2 },
      { href: '/admin/targets', label: 'Targets', detail: 'Set daily expectations per person', icon: Target },
      { href: '/admin/people', label: 'People', detail: 'Roles, teams, and managers', icon: Users },
      { href: '/admin/revenue-intelligence', label: 'Revenue', detail: 'Funnel, cost, and quality', icon: BarChart3 },
    ],
  },
  {
    label: 'Work in motion',
    items: [
      { href: '/leads', label: 'Leads', detail: 'Every prospect the team captured', icon: Target },
      { href: '/inbound', label: 'Inbound', detail: 'Replies waiting on a human', icon: MessageSquare },
      { href: '/upwork', label: 'Jobs', detail: 'Upwork pipeline', icon: Briefcase },
      { href: '/relay', label: 'Conversations', detail: 'Live threads and follow-ups', icon: MessageSquare },
    ],
  },
  {
    label: 'Create and intelligence',
    items: [
      { href: '/content', label: 'Studio', detail: 'Write as the company', icon: PenLine },
      { href: '/content/growth', label: 'Relay Growth', detail: 'Editorial engine', icon: TrendingUp },
      { href: '/manage-profiles', label: 'Profiles', detail: 'Who each person writes as', icon: UserCircle2 },
      { href: '/facts', label: 'Proof', detail: 'Claims the team is allowed to make', icon: Shield },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/usage', label: 'Usage', detail: 'Quota and spend', icon: Target },
      { href: '/admin/ai-usage', label: 'AI runtime', detail: 'Provider health', icon: BarChart3 },
      { href: '/account', label: 'Settings', detail: 'Org and account', icon: Settings },
    ],
  },
]

function statusVariant(status: PersonStatus): 'success' | 'warning' | 'danger' | 'orange' | 'neutral' {
  if (status === 'completed') return 'success'
  if (status === 'at_risk') return 'warning'
  if (status === 'missed') return 'danger'
  if (status === 'on_track') return 'orange'
  return 'neutral'
}

function statusLabel(status: PersonStatus): string {
  if (status === 'no_target') return 'No target'
  if (status === 'at_risk') return 'At risk'
  if (status === 'on_track') return 'On track'
  return status.replace('_', ' ')
}

function workLabel(person: PersonWork): string {
  const parts = [
    person.profiles ? `${person.profiles} profiles` : null,
    person.leads ? `${person.leads} leads` : null,
    person.extractions ? `${person.extractions} extractions` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'No recorded work yet'
}

export function OwnerCommandCenter({ dataPromise }: { dataPromise: Promise<OrgCommandSnapshot> }) {
  const data = use(dataPromise)
  const [query, setQuery] = useState('')

  const filteredPeople = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return data.people
    return data.people.filter((person) =>
      [person.repName, person.orgRole, person.productRole, ...person.teamNames, ...person.identityNames]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [data.people, query])

  const dateLabel = new Date(data.today + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="space-y-6 pb-10">
      <section className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange-light">
          {data.isOwner ? 'Owner' : 'Admin'} / Command
        </p>
        <h1 className="mt-2 text-[30px] leading-[1.05] tracking-[-0.03em] text-[color:var(--console-text)]">
          {data.orgName}
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] text-[color:var(--console-mute)]">
          {dateLabel}. Everyone’s work, identities, and daily progress in one place.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <Metric label="People" value={data.totals.people} />
          <Metric label="With work" value={data.totals.peopleWithWork} />
          <Metric label="Profiles" value={data.totals.profiles} />
          <Metric label="Leads" value={data.totals.leads} />
          <Metric label="Extractions" value={data.totals.extractions} />
          <Metric label="Identities" value={data.totals.identities} />
          <Metric label="Plays" value={data.totals.plays} />
          <Metric label="Remaining" value={data.totals.remaining} warn={data.totals.remaining > 0} />
        </div>
      </section>

      {data.attention.length > 0 && (
        <section className="rounded-lg border border-status-warning/25 bg-status-warning/5 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-status-warning" />
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-status-warning">
              Needs you · {data.attention.length}
            </p>
          </div>
          <div className="mt-3 space-y-2">
            {data.attention.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="flex items-start justify-between gap-3 rounded-md border border-line/70 bg-bone px-3 py-2 hover:border-ink/20"
              >
                <div>
                  <p className="text-[13px] font-medium text-ink">{item.title}</p>
                  <p className="text-[12px] text-graphite">{item.detail}</p>
                </div>
                <StatusBadge
                  status={item.severity}
                  variant={item.severity === 'critical' ? 'danger' : 'warning'}
                />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Operate</p>
        <div className="grid gap-4 lg:grid-cols-2">
          {CONTROL.map((group) => (
            <div key={group.label} className="rounded-lg border border-line bg-bone-raised p-4">
              <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">{group.label}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {group.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="rounded-md border border-line/80 bg-bone px-3 py-2.5 transition-colors hover:border-ink/25 hover:bg-bone-raised"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="size-3.5 text-stone" />
                        <p className="text-[13px] font-medium text-ink">{item.label}</p>
                      </div>
                      <p className="mt-1 text-[11px] text-graphite">{item.detail}</p>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Everyone</p>
            <p className="mt-1 text-[13px] text-graphite">
              Profiles, leads, and extractions the team already produced — not just today’s target counters.
            </p>
          </div>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a person, team, or identity"
            className="sm:max-w-xs"
          />
        </div>
        {filteredPeople.length === 0 ? (
          <p className="rounded-lg border border-line bg-bone-raised px-4 py-5 text-[13px] text-graphite">
            No people match that search.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-line bg-bone-raised">
            {filteredPeople.map((person) => {
              const pct = person.totalTarget > 0
                ? Math.round((person.totalCompleted / person.totalTarget) * 100)
                : 0
              return (
                <div key={person.repId} className="border-b border-line/70 px-4 py-3 last:border-b-0">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/team/${person.repId}`} className="text-[14px] font-medium text-ink hover:underline">
                          {person.repName}
                        </Link>
                        <StatusBadge status={person.orgRole} variant="neutral" />
                        <StatusBadge status={statusLabel(person.status)} variant={statusVariant(person.status)} />
                      </div>
                      <p className="mt-1 text-[12px] text-graphite">{workLabel(person)}</p>
                      {(person.teamNames.length > 0 || person.identityNames.length > 0) && (
                        <p className="mt-0.5 text-[11px] text-stone">
                          {[...person.teamNames, ...person.identityNames].join(' · ')}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="w-36">
                        <div className="flex items-center justify-between text-[11px] text-graphite">
                          <span>{person.totalCompleted}/{person.totalTarget || '—'}</span>
                          <span>{person.totalTarget > 0 ? `${pct}%` : '—'}</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded bg-line/70">
                          <div
                            className={cn(
                              'h-full rounded',
                              person.status === 'completed' ? 'bg-status-success' :
                              person.status === 'at_risk' || person.status === 'missed' ? 'bg-status-warning' :
                              person.totalTarget > 0 ? 'bg-orange' : 'bg-line',
                            )}
                            style={{ width: `${person.totalTarget > 0 ? Math.min(100, Math.max(4, pct)) : 0}%` }}
                          />
                        </div>
                      </div>
                      <Link href="/admin/targets" className="text-[12px] font-medium text-ink hover:underline">
                        Target
                      </Link>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Identities</p>
          <Link href="/admin/revenue-identities" className="text-[12px] font-medium text-ink hover:underline">
            Manage
          </Link>
        </div>
        {data.identities.length === 0 ? (
          <p className="rounded-lg border border-line bg-bone-raised px-4 py-5 text-[13px] text-graphite">
            No revenue identities yet. Create one to assign work.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {data.identities.map((identity) => (
              <div key={identity.id} className="rounded-lg border border-line bg-bone-raised px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[13px] font-medium text-ink">{identity.name}</p>
                    <p className="mt-0.5 text-[11px] capitalize text-stone">{identity.channel}</p>
                  </div>
                  <StatusBadge
                    status={identity.assignedRepNames.length > 0 ? `${identity.assignedRepNames.length} assigned` : 'Unassigned'}
                    variant={identity.assignedRepNames.length > 0 ? 'orange' : 'warning'}
                  />
                </div>
                <p className="mt-2 text-[12px] text-graphite">
                  {identity.assignedRepNames.length > 0
                    ? identity.assignedRepNames.join(', ')
                    : 'Nobody can execute this identity yet.'}
                </p>
                <p className="mt-1 text-[11px] text-stone">
                  {identity.targetCount > 0 ? `${identity.targetCount} daily targets` : 'No daily target'}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Teams</p>
        {data.teams.length === 0 && data.unteamed.length === 0 ? (
          <p className="rounded-lg border border-line bg-bone-raised px-4 py-5 text-[13px] text-graphite">
            No teams configured yet. People still appear above.
          </p>
        ) : (
          <div className="space-y-2">
            {data.teams.map((team) => (
              <div key={team.teamId} className="rounded-lg border border-line bg-bone-raised p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Users className="size-4 text-stone" />
                    <p className="text-[13px] font-medium text-ink">{team.teamName}</p>
                    <span className="text-[11px] text-graphite">{team.people.length} people</span>
                  </div>
                  {team.needsAttention > 0 && (
                    <span className="rounded-full bg-status-warning/10 px-2 py-0.5 text-[10px] font-medium text-status-warning">
                      {team.needsAttention} behind
                    </span>
                  )}
                </div>
                {team.managerNames.length > 0 && (
                  <p className="mt-1 text-[11px] text-stone">Manager: {team.managerNames.join(', ')}</p>
                )}
                <div className="mt-3 space-y-1.5">
                  {team.people.map((person) => (
                    <div key={person.repId} className="flex items-center justify-between gap-2">
                      <Link href={`/team/${person.repId}`} className="text-[12px] text-ink hover:underline">
                        {person.repName}
                      </Link>
                      <span className="text-[11px] text-graphite">{workLabel(person)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {data.unteamed.length > 0 && (
              <div className="rounded-lg border border-line bg-bone-raised p-4">
                <p className="text-[13px] font-medium text-ink">Unassigned to a team</p>
                <div className="mt-2 space-y-1.5">
                  {data.unteamed.map((person) => (
                    <div key={person.repId} className="flex items-center justify-between gap-2">
                      <span className="text-[12px] text-ink">{person.repName}</span>
                      <span className="text-[11px] text-graphite">{workLabel(person)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

function Metric({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={cn(
      'rounded border px-3 py-2',
      warn ? 'border-orange/25 bg-orange/5' : 'border-orange/20 bg-orange/5',
    )}>
      <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-orange-light/80">{label}</p>
      <p className="mt-1 text-[18px] font-medium text-[color:var(--console-text)]">{value}</p>
    </div>
  )
}

export function OwnerCommandCenterSkeleton() {
  return (
    <div className="space-y-6 pb-8">
      <section className="srf-console srf-console-edge overflow-hidden px-5 py-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-8 w-64" />
        <Skeleton className="mt-2 h-3.5 w-80" />
        <div className="mt-4 grid grid-cols-4 gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </section>
      <Skeleton className="h-40" />
      <Skeleton className="h-64" />
    </div>
  )
}
