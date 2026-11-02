'use client'

/**
 * Admin / Owner Command Center V3.
 * Seven sections: command header, organization health, needs attention,
 * team execution, sales pulse, important activity, quick actions.
 */
import { useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import type { AdminCommandCenterData } from '@/lib/team/admin-command-summary'
import {
  buildAdminV3Activity,
  buildAdminV3Attention,
  buildAdminV3Health,
  buildAdminV3Pipeline,
  buildAdminV3QuickActions,
  buildAdminV3TeamRows,
} from '@/lib/admin/v3-command-present'
import {
  V3ActivityRow,
  V3AttentionRow,
  V3EmptyState,
  V3Metric,
  V3PageHeader,
  V3PersonRow,
  V3SectionError,
  V3SectionTitle,
  V3StageStrip,
} from '@/components/v3/primitives'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

export function AdminCommandCenterView({
  data,
  adminName,
  error,
}: {
  data: AdminCommandCenterData
  adminName: string
  error?: boolean
}) {
  const router = useRouter()
  const health = useMemo(() => buildAdminV3Health(data), [data])
  const attention = useMemo(() => buildAdminV3Attention(data.attention), [data.attention])
  const teamRows = useMemo(() => buildAdminV3TeamRows(data.rows), [data.rows])
  const pipeline = useMemo(() => buildAdminV3Pipeline(data.pipeline), [data.pipeline])
  const activity = useMemo(() => buildAdminV3Activity(data.activity), [data.activity])
  const quickActions = useMemo(() => buildAdminV3QuickActions(data.isOwner), [data.isOwner])

  return (
    <div className="space-y-8 pb-10">
      <V3PageHeader
        title="Command Center"
        subtitle={data.orgName}
        meta={
          <p className="text-[13px] text-graphite">
            Good <span suppressHydrationWarning>{greeting()}</span>, {adminName.split(' ')[0]}. Here&apos;s what needs attention across Relay.
          </p>
        }
        actions={
          <>
            <Link
              href="/prospect"
              className="inline-flex items-center gap-1.5 rounded-md bg-solid px-3.5 py-2 text-[13px] font-medium text-on-solid transition-transform active:scale-[0.98]"
            >
              Analyze Prospect
            </Link>
            <Link
              href="/tasks"
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-bone-raised px-3 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-bone"
            >
              Assign Task
            </Link>
            <Link
              href="/admin/people"
              className="hidden items-center gap-1.5 rounded-md border border-line bg-bone-raised px-3 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-bone sm:inline-flex"
            >
              Invite Person
            </Link>
          </>
        }
      />

      {error && <V3SectionError onRetry={() => router.refresh()} />}

      <section aria-label="Organization health" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {health.map((metric) => (
          <V3Metric key={metric.key} label={metric.label} value={metric.value} hint={metric.hint} href={metric.href} tone={metric.tone} />
        ))}
      </section>

      <section aria-label="Needs attention">
        <V3SectionTitle title="Needs attention" hint={`${data.attention.length} signals`} />
        {attention.length > 0 ? (
          <>
            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-bone-raised">
              {attention.map((row) => (
                <V3AttentionRow
                  key={row.id}
                  severity={row.severity}
                  name={row.name}
                  reason={row.reason}
                  ctaLabel={row.ctaLabel}
                  href={row.href}
                />
              ))}
            </ul>
            <Link
              href="/admin/command"
              className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-graphite transition-colors hover:text-ink"
            >
              View all attention
              <ChevronRight className="size-3.5" aria-hidden />
            </Link>
          </>
        ) : (
          <div className="mt-3">
            <V3EmptyState
              title="Organization is on track"
              body="No critical replies, follow-ups or attribution gaps need intervention right now."
            />
          </div>
        )}
      </section>

      <section aria-label="Team execution">
        <V3SectionTitle title="Team execution" hint={`${teamRows.length} people`} />
        {teamRows.length > 0 ? (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-bone-raised">
            {teamRows.map((row) => (
              <V3PersonRow
                key={row.id}
                name={row.name}
                role={row.role}
                stats={row.stats}
                progress={{ label: 'Target', pct: row.targetPct }}
                status={row.status}
                href={row.href}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-lg border border-line bg-bone-raised px-4 py-6 text-[13px] text-graphite">
            No team members have activity yet.
          </p>
        )}
      </section>

      <section aria-label="Sales pulse">
        <V3SectionTitle title="Sales pulse" hint="Open opportunities by stage" />
        <div className="mt-3">
          <V3StageStrip stages={pipeline} />
        </div>
      </section>

      <section aria-label="Important activity">
        <V3SectionTitle title="Important activity" hint="Meaningful operational events" />
        {activity.length > 0 ? (
          <ul className="mt-3 divide-y divide-line/70 overflow-hidden rounded-lg border border-line bg-bone-raised">
            {activity.map((item) => (
              <V3ActivityRow key={item.id} time={item.time} label={item.label} detail={item.detail ?? undefined} href={item.href ?? undefined} />
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-lg border border-line bg-bone-raised px-4 py-6 text-[13px] text-graphite">
            No meaningful organization events this week.
          </p>
        )}
      </section>

      <section aria-label="Quick actions">
        <V3SectionTitle title="Quick actions" />
        <ul className="mt-3 flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <li key={action.key}>
              <Link
                href={action.href}
                className="inline-flex items-center gap-1.5 rounded-md border border-line bg-bone-raised px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-bone"
              >
                {action.label}
                <ChevronRight className="size-3.5 text-stone" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
