'use client'

import { use, useState } from 'react'
import { ChevronDown, ChevronRight, Shield, Target, Users } from 'lucide-react'
import { cn } from 'cn'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'

interface PeopleData {
  orgName: string
  teams: Array<{ id: string; name: string; description: string | null }>
  people: Array<{
    id: string
    name: string
    role: string
    managedTeams: Array<{ id: string; name: string }>
    memberTeams: Array<{ id: string; name: string }>
  }>
  owners: Array<{ id: string; name: string; role: string; managedTeams: any[]; memberTeams: any[] }>
  admins: Array<{ id: string; name: string; role: string; managedTeams: any[]; memberTeams: any[] }>
  managers: Array<{ id: string; name: string; role: string; managedTeams: any[]; memberTeams: any[] }>
  members: Array<{ id: string; name: string; role: string; managedTeams: any[]; memberTeams: any[] }>
  isOwner: boolean
}

export function PeopleView({ dataPromise }: { dataPromise: Promise<PeopleData> }) {
  const data = use(dataPromise)
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())

  const toggleTeam = (teamId: string) => {
    setExpandedTeams((prev) => {
      const next = new Set(prev)
      if (next.has(teamId)) {
        next.delete(teamId)
      } else {
        next.add(teamId)
      }
      return next
    })
  }

  return (
    <div className="space-y-6 pb-8">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
                Organization
              </p>
              <span className="size-1 rounded-full bg-line" />
              <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange">
                People
              </p>
            </div>
            <h1 className="text-display text-[28px] font-light tracking-[-0.02em] text-ink sm:text-[32px]">
              {data.orgName}
            </h1>
            <p className="text-[13px] text-graphite">
              {data.people.length} people · {data.teams.length} teams
            </p>
          </div>
          <BypassAllButton />
        </div>
      </header>

      {data.owners.length > 0 && (
        <section className="space-y-2">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-ststone">
            Owner
          </p>
          {data.owners.map((person) => (
            <PersonCard key={person.id} person={person} isOwner={data.isOwner} />
          ))}
        </section>
      )}

      {data.admins.length > 0 && (
        <section className="space-y-2">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-ststone">
            Admins
          </p>
          {data.admins.map((person) => (
            <PersonCard key={person.id} person={person} isOwner={data.isOwner} />
          ))}
        </section>
      )}

      {data.teams.map((team) => {
        const teamManagers = data.managers.filter((m) =>
          m.managedTeams.some((t) => t.id === team.id)
        )
        const teamMembers = data.members.filter((m) =>
          m.memberTeams.some((t) => t.id === team.id)
        )
        const isExpanded = expandedTeams.has(team.id)

        return (
          <section key={team.id} className="space-y-2">
            <button
              onClick={() => toggleTeam(team.id)}
              className="flex w-full items-center gap-2 rounded-lg border border-line bg-bone-raised px-4 py-3 text-left transition-colors hover:bg-bone"
            >
              {isExpanded ? (
                <ChevronDown className="size-4 text-stone" />
              ) : (
                <ChevronRight className="size-4 text-stone" />
              )}
              <div className="flex-1">
                <p className="text-[13px] font-medium text-ink">{team.name}</p>
                <p className="text-[11px] text-graphite">
                  {teamManagers.length} manager{teamManagers.length !== 1 ? 's' : ''} · {teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''}
                </p>
              </div>
            </button>

            {isExpanded && (
              <div className="ml-4 space-y-2 border-l border-line pl-4">
                {teamManagers.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-ststone">Managers</p>
                    {teamManagers.map((person) => (
                      <PersonCard key={person.id} person={person} isOwner={data.isOwner} />
                    ))}
                  </div>
                )}
                {teamMembers.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-ststone">Members</p>
                    {teamMembers.map((person) => (
                      <PersonCard key={person.id} person={person} isOwner={data.isOwner} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function BypassAllButton() {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null)

  async function handleBypass() {
    if (!confirm('Skip voice-calibration onboarding for every rep without a voice profile? This creates a default profile so they reach the dashboard.')) return
    setStatus('running')
    setResult(null)
    try {
      const res = await fetch('/api/admin/people/bypass-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      setResult({ created: json.created, skipped: json.skipped })
      setStatus('done')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={handleBypass}
        disabled={status === 'running'}
        className="rounded-md border border-orange/30 bg-orange/5 px-3 py-1.5 text-[12px] font-medium text-orange transition-colors hover:bg-orange/10 disabled:opacity-50"
      >
        {status === 'running' ? 'Bypassing…' : 'Bypass Onboarding for All'}
      </button>
      {status === 'done' && result ? (
        <p className="text-[10px] text-status-success">
          Done · {result.created} created · {result.skipped} already onboarded
        </p>
      ) : null}
      {status === 'error' ? (
        <p className="text-[10px] text-status-danger">Failed — check console</p>
      ) : null}
    </div>
  )
}

function PersonCard({ person, isOwner }: { person: any; isOwner: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-bone-raised p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-full bg-solid text-[11px] font-medium text-on-solid">
            {person.name.charAt(0)}
          </div>
          <div>
            <p className="text-[13px] font-medium text-ink">{person.name}</p>
            <div className="flex items-center gap-2">
              <StatusBadge status={person.role} variant={person.role === 'OWNER' ? 'orange' : person.role === 'ADMIN' ? 'cobalt' : 'neutral'} />
              {person.managedTeams.length > 0 && (
                <span className="text-[10px] text-graphite">
                  Manages: {person.managedTeams.map((t: any) => t.name).join(', ')}
                </span>
              )}
            </div>
          </div>
        </div>
        {isOwner && (
          <button className="rounded-md border border-line px-2 py-1 text-[11px] text-graphite hover:text-ink">
            Edit
          </button>
        )}
      </div>
    </div>
  )
}

export function PeopleViewSkeleton() {
  return (
    <div className="space-y-6 pb-8">
      <header className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-3.5 w-48" />
      </header>
      <div className="space-y-2">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    </div>
  )
}
