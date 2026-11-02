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
import {
  derivePipelineStage,
  leadIntentLevel,
  leadNextAction,
  leadPriority,
  LEAD_PRIORITY_LABELS,
  type LeadRow,
} from '@/components/leads/pipeline-utils'
import type { CapturedProspect } from '@/lib/domain/types'

export type ProspectsTab = 'analyze' | 'recent' | 'saved' | 'watchlist'

export function isProspectsTab(value: string | undefined): value is ProspectsTab {
  return value === 'recent' || value === 'saved' || value === 'watchlist'
}

export const STATUS_LABELS: Record<CapturedProspect['status'], string> = {
  captured: 'Not saved',
  converted: 'Lead created',
  discarded: 'Skipped',
}

export const STATUS_VARIANT: Record<CapturedProspect['status'], 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'orange' | 'cobalt'> = {
  captured: 'neutral',
  converted: 'success',
  discarded: 'warning',
}

export const RECOMMENDATION_LABELS: Record<string, string> = {
  strong: 'Strong opportunity',
  worth_pursuing: 'Worth pursuing',
  maybe: 'Needs more signal',
  low: 'Low priority',
  skip: 'Probably skip',
}

export function recommendationFor(row: CapturedProspect): string | null {
  const qualification = row.canonicalIntelligence?.qualification
  if (typeof qualification !== 'string') return null
  return RECOMMENDATION_LABELS[qualification] ?? qualification.replaceAll('_', ' ')
}

export function intentFor(row: CapturedProspect): string | null {
  const intelligence = row.canonicalIntelligence as
    | { buyerIntent?: { buyerIntentLevel?: unknown } }
    | null
  const level = intelligence?.buyerIntent?.buyerIntentLevel
  return typeof level === 'string' && level.trim() ? level.trim().toUpperCase() : null
}

export function ProspectsWorkspace({
  tab,
  recent,
  saved,
  watchlist,
  workspaceName,
  orgView,
  profiles,
  now,
}: {
  tab: ProspectsTab
  recent: CapturedProspect[]
  saved: LeadRow[]
  watchlist: LeadRow[]
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

  const recentColumns = useMemo<Column<CapturedProspect>[]>(
    () => [
      {
        key: 'prospect',
        header: 'Prospect',
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-ink">
              {row.extractedName ?? 'Unnamed prospect'}
            </p>
            {row.extractedTitle ? (
              <p className="truncate text-[11px] text-graphite">{row.extractedTitle}</p>
            ) : null}
          </div>
        ),
      },
      {
        key: 'company',
        header: 'Company',
        hideBelow: 'lg',
        render: (row) => (
          <span className="block truncate text-[13px] text-graphite">{row.extractedCompany ?? '—'}</span>
        ),
      },
      {
        key: 'profile',
        header: 'Source profile',
        hideBelow: 'xl',
        render: (row) => {
          const name = row.senderProfileId ? profiles[row.senderProfileId] : null
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
          <span className="text-[13px] text-ink">{row.canonicalScore != null ? `${row.canonicalScore}/10` : '—'}</span>
        ),
      },
      {
        key: 'intent',
        header: 'Intent',
        hideBelow: 'xl',
        render: (row) => (
          <span className="text-[13px] text-graphite">{intentFor(row) ?? '—'}</span>
        ),
      },
      {
        key: 'recommendation',
        header: 'Recommendation',
        hideBelow: 'md',
        render: (row) => (
          <span className="text-[13px] text-graphite">{recommendationFor(row) ?? '—'}</span>
        ),
      },
      {
        key: 'analyzed',
        header: 'Analyzed',
        hideBelow: 'lg',
        render: (row) => (
          <span className="text-[13px] text-graphite">{formatRelativeTime(row.createdAt, now)}</span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (row) => (
          <StatusBadge status={STATUS_LABELS[row.status]} variant={STATUS_VARIANT[row.status]} />
        ),
      },
    ],
    [now, profiles],
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
        header: 'Profile',
        hideBelow: 'xl',
        render: (lead) => (
          <span className="block truncate text-[13px] text-ink">
            {lead.senderProfileName ?? 'Not assigned'}
          </span>
        ),
      },
      {
        key: 'stage',
        header: 'Stage',
        render: (lead) => (
          <StatusBadge
            status={derivePipelineStage(lead) === 'observe' ? 'Watch' : 'Active'}
            variant={derivePipelineStage(lead) === 'observe' ? 'warning' : 'cobalt'}
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
      : 'Every check, every saved lead and every watchlist entry for the selected profile.'

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
          Analyze a prospect
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
            ]}
            value={tab}
            onChange={selectTab}
          />
        }
      />

      {tab === 'analyze' ? (
        <ProspectAnalyze />
      ) : tab === 'recent' ? (
        <DataTable
          caption="Recent prospects"
          columns={recentColumns}
          rows={recent}
          rowKey={(row) => row.id}
          empty={empty(
            'No prospects analyzed yet.',
            'Paste a LinkedIn profile or job to start.',
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
