'use client'

import { useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Inbox, Plus } from 'lucide-react'
import { SalesHeader } from '@/components/sales/sales-header'
import { DataTable, type Column } from '@/components/ui/data-table'
import { Tabs } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { LeadScoreRing } from '@/components/score-ring'
import { formatRelativeTime } from '@/lib/ui/time'
import { ProspectAnalyze } from './prospect-analyze'
import { FreshProspectsView } from './fresh-prospects'
import {
  derivePipelineStage,
  leadIntentLevel,
  leadNextAction,
  leadPriority,
  LEAD_PRIORITY_LABELS,
  type LeadRow,
} from '@/components/leads/pipeline-utils'
import {
  PROSPECT_STATUS_LABELS,
  PROSPECT_STATUS_VARIANT,
  decisionLabelForScore,
} from '@/lib/prospect/display'
import type { ProspectTab, RecentProspect, ProspectsViewData } from '@/lib/prospect/prospects-view'

export function ProspectsWorkspace({
  tab,
  recent,
  saved,
  watchlist,
  fresh,
  workspaceName,
  orgView,
  profiles,
  now,
}: {
  tab: ProspectTab
  recent: RecentProspect[]
  saved: LeadRow[]
  watchlist: LeadRow[]
  fresh: ProspectsViewData['fresh']
  workspaceName: string | null
  orgView: boolean
  profiles: Record<string, string>
  now: number
}) {
  const router = useRouter()

  const selectTab = useCallback(
    (next: string) => {
      router.push(next === 'analyze' ? '/prospect' : `/prospect?tab=${next}`, { scroll: false })
    },
    [router],
  )

  const profileName = useCallback(
    (id: string | null) => (id ? profiles[id] ?? null : null),
    [profiles],
  )

  const recentColumns = useMemo<Column<RecentProspect>[]>(
    () => [
      {
        key: 'prospect',
        header: 'Prospect',
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-ink">{row.name ?? 'Unnamed prospect'}</p>
            {row.title || row.company ? (
              <p className="truncate text-[11px] text-graphite">{[row.title, row.company].filter(Boolean).join(' · ')}</p>
            ) : null}
          </div>
        ),
      },
      {
        key: 'decision',
        header: 'Decision',
        render: (row) => (
          <span className="text-[13px] text-ink">{decisionLabelForScore(row.score) ?? '—'}</span>
        ),
      },
      {
        key: 'profile',
        header: 'Analyzed for',
        hideBelow: 'xl',
        render: (row) => {
          const name = profileName(row.senderProfileId)
          return name ? (
            <span className="block truncate text-[13px] text-ink">{name}</span>
          ) : (
            <span className="text-[13px] font-medium text-status-warning">Not assigned</span>
          )
        },
      },
      {
        key: 'score',
        header: 'Score',
        align: 'right',
        hideBelow: 'sm',
        render: (row) => (
          <span className="text-[13px] tabular-nums text-ink">{row.score != null ? `${row.score}/10` : '—'}</span>
        ),
      },
      {
        key: 'analyzed',
        header: 'Analyzed',
        hideBelow: 'lg',
        render: (row) => (
          <span className="text-[13px] text-graphite">{formatRelativeTime(row.lastActivityAt, now)}</span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (row) => (
          <StatusBadge status={PROSPECT_STATUS_LABELS[row.outcome]} variant={PROSPECT_STATUS_VARIANT[row.outcome]} />
        ),
      },
    ],
    [now, profileName],
  )

  const recentCard = useCallback(
    (row: RecentProspect) => (
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="min-w-0 truncate text-[14px] font-medium text-ink">{row.name ?? 'Unnamed prospect'}</p>
          <StatusBadge status={PROSPECT_STATUS_LABELS[row.outcome]} variant={PROSPECT_STATUS_VARIANT[row.outcome]} />
        </div>
        {row.title || row.company ? (
          <p className="truncate text-[12px] text-graphite">{[row.title, row.company].filter(Boolean).join(' · ')}</p>
        ) : null}
        <p className="text-[12px] text-graphite">
          {decisionLabelForScore(row.score) ?? '—'}
          {row.score != null ? ` · ${row.score}/10` : ''}
          {' · '}
          {profileName(row.senderProfileId) ?? 'Not assigned'}
          {' · '}
          {formatRelativeTime(row.lastActivityAt, now)}
        </p>
      </div>
    ),
    [now, profileName],
  )

  const leadColumns = useMemo<Column<LeadRow>[]>(
    () => [
      {
        key: 'lead',
        header: 'Lead',
        render: (lead) => (
          <Link
            href={`/leads/${lead.id}`}
            className="block truncate text-[13px] font-medium text-ink transition-colors hover:text-orange"
          >
            {lead.contactName ?? 'Unnamed prospect'}
          </Link>
        ),
      },
      {
        key: 'company',
        header: 'Company',
        hideBelow: 'lg',
        render: (lead) => (
          <span className="block truncate text-[13px] text-graphite">{lead.company}</span>
        ),
      },
      {
        key: 'profile',
        header: 'Analyzed for',
        hideBelow: 'xl',
        render: (lead) => (
          <span className="block truncate text-[13px] text-ink">
            {lead.senderProfileName ?? 'Not assigned'}
          </span>
        ),
      },
      {
        key: 'stage',
        header: 'Status',
        render: (lead) => (
          <StatusBadge
            status={derivePipelineStage(lead) === 'observe' ? 'Watchlist' : 'Lead'}
            variant={derivePipelineStage(lead) === 'observe' ? 'cobalt' : 'success'}
          />
        ),
      },
      {
        key: 'priority',
        header: 'Priority',
        hideBelow: 'lg',
        render: (lead) => (
          <StatusBadge status={LEAD_PRIORITY_LABELS[leadPriority(lead)]} variant="neutral" />
        ),
      },
      {
        key: 'score',
        header: 'Score',
        align: 'right',
        hideBelow: 'sm',
        render: (lead) => <LeadScoreRing lead={lead} size={32} />,
      },
      {
        key: 'intent',
        header: 'Intent',
        hideBelow: 'xl',
        render: (lead) => (
          <span className="text-[13px] text-graphite">{leadIntentLevel(lead) ?? '—'}</span>
        ),
      },
      {
        key: 'next',
        header: 'Next action',
        render: (lead) => {
          const action = leadNextAction(lead)
          return (
            <Link
              href={action.href}
              className="inline-flex items-center gap-1 rounded-md bg-orange px-2.5 py-1 text-[12px] font-medium text-on-accent transition-colors hover:bg-orange-dark"
            >
              {action.label}
            </Link>
          )
        },
      },
    ],
    [],
  )

  const description = orgView
    ? 'Every profile in the organisation. Every check, every saved lead and every watchlist entry.'
    : workspaceName
      ? `Analyzed for ${workspaceName}. Every check, every saved lead and every watchlist entry for this profile.`
      : 'Analyze a person, company, message or opportunity and decide whether it is worth pursuing.'

  const empty = (title: string, hint: string) => (
    <EmptyState
      icon={Inbox}
      title={title}
      description={hint}
      action={
        <Link
          href="/prospect"
          className="inline-flex items-center gap-2 rounded-lg bg-orange px-4 py-2 text-[13px] font-medium text-on-accent transition-colors hover:bg-orange-dark"
        >
          <Plus className="size-4" aria-hidden="true" />
          Analyze Prospect
        </Link>
      }
    />
  )

  return (
    <div className="space-y-5">
      <SalesHeader
        title="Prospects"
        description={description}
        meta={
          <Tabs
            items={[
              { value: 'analyze', label: 'Analyze', hint: 'Check whether a prospect is worth your next outreach.' },
              { value: 'recent', label: 'Recent', hint: 'Every prospect you have analyzed, newest first.' },
              { value: 'saved', label: 'Saved', hint: 'Prospects that became active leads.' },
              { value: 'watchlist', label: 'Watchlist', hint: 'Observe — research_more and not-now cases. Not active outreach.' },
              { value: 'fresh', label: 'Fresh', hint: 'Provider-discovered prospects awaiting your decision.' },
            ]}
            value={tab}
            onChange={selectTab}
          />
        }
      />

      {tab === 'analyze' ? (
        <ProspectAnalyze />
      ) : tab === 'fresh' ? (
        <FreshProspectsView rows={fresh} orgView={orgView} workspace={workspaceName ? { identityName: workspaceName } : null} />
      ) : tab === 'recent' ? (
        <DataTable
          caption="Recent prospects"
          columns={recentColumns}
          rows={recent}
          rowKey={(row) => row.id}
          renderCard={recentCard}
          empty={empty(
            'No prospects analyzed yet.',
            'Paste a source above to find your first opportunity.',
          )}
          onRowClick={(row) => {
            if (row.convertedLeadId) router.push(`/leads/${row.convertedLeadId}`)
          }}
          footer={<p className="px-1 text-[12px] text-graphite">{recent.length} analyzed</p>}
        />
      ) : (
        <DataTable
          caption={tab === 'saved' ? 'Saved prospects' : 'Watchlist'}
          columns={leadColumns}
          rows={tab === 'saved' ? saved : watchlist}
          rowKey={(row) => row.id}
          empty={
            tab === 'saved'
              ? empty('No saved prospects yet.', 'Create a lead from an analysis and it appears here.')
              : empty('Your watchlist is clear.', 'Opportunities that are not a fit yet appear here — watch, do not contact.')
          }
          onRowClick={(row) => router.push(`/leads/${row.id}`)}
          footer={
            <p className="px-1 text-[12px] text-graphite">
              {tab === 'saved' ? `${saved.length} saved` : `${watchlist.length} watching`}
            </p>
          }
        />
      )}
    </div>
  )
}
