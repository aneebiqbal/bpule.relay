'use client'

/**
 * Admin Control Center — Profiles, Team and Issues & Data in one workspace.
 *
 * Profiles and Team embed the existing canonical workspaces (person cards with
 * nested channels; member cards with workload and tasks) so their numbers are
 * the same ones every other surface uses. Issues & Data embeds the assignment
 * reconciliation queue.
 */
import { useState } from 'react'
import { cn } from 'cn'
import { PersonProfilesWorkspace } from '@/components/team/person-profiles-workspace'
import { PeopleWorkspace } from '@/components/team/people-workspace'
import { IssuesData } from './issues-data'
import { DataManagement } from './data-management'
import type { ReconcileReport } from '@/lib/profiles/reconcile'
import type { PeopleDirectory } from '@/lib/operations/people'
import type { TeamProfileDirectoryRow } from '@/lib/team/profiles'

type Tab = 'profiles' | 'team' | 'issues' | 'data'

export function ControlCenter({
  profiles,
  businessDate,
  reps,
  people,
  report,
  isAdmin,
}: {
  profiles: TeamProfileDirectoryRow[]
  businessDate: string
  reps: Array<{ id: string; name: string; profiles: string[] }>
  people: PeopleDirectory
  report: ReconcileReport
  isAdmin: boolean
}) {
  const [tab, setTab] = useState<Tab>('profiles')
  const openIssues = report.findings.length

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.18em] text-stone">Admin / Control Center</p>
          <h1 className="mt-1 text-[24px] font-light tracking-[-0.02em] text-ink">Team &amp; Profiles</h1>
          <p className="mt-1 text-[13px] text-graphite">
            One workspace for people, channels, operators, targets and data issues.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {([
            { key: 'profiles', label: 'Profiles' },
            { key: 'team', label: 'Team' },
            { key: 'issues', label: `Issues & Data${openIssues ? ` (${openIssues})` : ''}` },
            { key: 'data', label: 'Data' },
          ] as Array<{ key: Tab; label: string }>).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              aria-pressed={tab === item.key}
              className={cn(
                'rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
                tab === item.key ? 'border-line bg-bone text-ink' : 'border-line/70 text-graphite hover:text-ink',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {tab === 'profiles' && (
        <PersonProfilesWorkspace
          profiles={profiles}
          businessDate={businessDate}
          reps={reps}
          canManageIdentities={isAdmin}
        />
      )}

      {tab === 'team' && (
        <PeopleWorkspace directory={people} businessDate={businessDate} canAssign={isAdmin} reps={reps} />
      )}

      {tab === 'issues' && <IssuesData report={report} isAdmin={isAdmin} />}
      {tab === 'data' && <DataManagement profiles={profiles} />}
    </div>
  )
}
