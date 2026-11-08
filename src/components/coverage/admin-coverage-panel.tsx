'use client'

/**
 * Admin Home — the operational coverage layer.
 *
 * Team status, profile coverage and the exceptions that need an approval.
 * Everything else is unchanged: the daily plan only surfaces changes, so an
 * admin never reconfigures the whole team each morning.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { cn } from 'cn'
import type { CoverageStatusView } from '@/lib/coverage/load'
import type { CoverageApprovalItem } from '@/lib/coverage/engine'
import { Dialog, DialogActions } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  V4Avatar,
  V4Chip,
  V4Empty,
  V4Panel,
  V4PanelHeader,
} from '@/components/v4/primitives'

const STATUS_TONE: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  COVERED: 'success',
  BACKUP_ACTIVE: 'info',
  AT_RISK: 'warning',
  UNCOVERED: 'danger',
}

const STATUS_LABEL: Record<string, string> = {
  COVERED: 'Covered',
  BACKUP_ACTIVE: 'Backup active',
  AT_RISK: 'At risk',
  UNCOVERED: 'Uncovered',
}

export function AdminCoveragePanel({
  status,
  businessDate,
}: {
  status: CoverageStatusView | null | undefined
  businessDate?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showAllProfiles, setShowAllProfiles] = useState(false)
  const [restoreItem, setRestoreItem] = useState<CoverageApprovalItem | null>(null)
  const [restoreTasks, setRestoreTasks] = useState<Array<{ id: string; title: string; status: string }>>([])
  const [restoreSelected, setRestoreSelected] = useState<Set<string>>(new Set())
  const [restoreLoading, setRestoreLoading] = useState(false)

  async function openRestore(item: CoverageApprovalItem) {
    setRestoreItem(item)
    setRestoreTasks([])
    setRestoreSelected(new Set())
    setRestoreLoading(true)
    try {
      const res = await fetch(
        `/api/team/coverage/${item.profileId}/tasks?coveringRepId=${item.fromRepId}`,
      )
      const json = await res.json().catch(() => ({}))
      if (res.ok) setRestoreTasks(json.tasks ?? [])
    } catch {
      setRestoreTasks([])
    } finally {
      setRestoreLoading(false)
    }
  }

  function toggleRestoreTask(id: string) {
    setRestoreSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllRestoreTasks() {
    setRestoreSelected(new Set(restoreTasks.map((task) => task.id)))
  }

  async function approve(items: Array<{
    profileId: string
    kind: 'COVER' | 'RESTORE_PRIMARY'
    returnOpenTasks?: boolean
    returnTaskIds?: string[]
  }>) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/team/coverage/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 207) {
        const failed = (body.results ?? []).filter((row: { applied: boolean }) => !row.applied)
        setError(
          `Coverage partially applied — ${failed.length} of ${(body.results ?? []).length} changes failed. Review and retry.`,
        )
        router.refresh()
        return
      }
      if (!res.ok) {
        setError(body.error ?? 'Coverage could not be applied.')
        return
      }
      setNotice('Coverage plan applied.')
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!status) {
    return (
      <V4Panel>
        <V4PanelHeader eyebrow="Operations" title="Coverage" hint="Could not be loaded" />
        <p className="mt-3 text-[12px] text-stone">
          The coverage plan could not be loaded. Team progress above is unaffected.
        </p>
      </V4Panel>
    )
  }

  const { summary, plan } = status
  const exceptions = plan.requiresApproval
  // Uncovered profiles with no backup chain are an administrative gap, not a
  // clean state — never report them as "everything is covered".
  const needsConfiguration = plan.counts.UNCOVERED + plan.counts.AT_RISK

  return (
    <V4Panel>
      <V4PanelHeader
        eyebrow={`Autopilot · ${businessDate ?? plan.businessDate}`}
        title="Coverage"
        action={
          <Link
            href="/team/coverage"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite hover:text-ink"
          >
            Review coverage <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        }
      />

      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatusFact label="Covered" value={summary.covered} tone="text-status-success" />
        <StatusFact label="Backup active" value={summary.backupActive} tone="text-cobalt" />
        <StatusFact label="At risk" value={summary.atRisk + summary.uncovered} tone="text-[#8f2b1e]" />
      </div>

      {/* Readiness — the gate AUTO_COVER will require, visible now. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-bone px-3 py-2.5 ring-1 ring-line/70">
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone">Readiness</span>
        <span className="text-[12px] text-graphite">
          <span className="font-medium tabular-nums text-ink">{plan.profiles.filter((p) => p.primaryReady).length}/{plan.profiles.length}</span> primaries confirmed
        </span>
        <span className="text-[12px] text-graphite">
          <span className="font-medium tabular-nums text-ink">
            {plan.profiles.reduce((n, p) => n + p.backups.filter((b) => b.ready).length, 0)}
            /
            {plan.profiles.reduce((n, p) => n + p.backups.length, 0)}
          </span> backups confirmed
        </span>
        {plan.profiles.some((p) => !p.primaryReady) && (
          <Link href="/team/coverage" className="text-[12px] font-medium text-status-warning hover:underline">
            {plan.profiles.filter((p) => !p.primaryReady).length} need confirmation · Review readiness
          </Link>
        )}
      </div>

      <div className="mt-5 border-t border-line/70 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[13px] font-medium text-ink">
            Action required
            <span className="ml-2 text-[12px] font-normal text-stone">
              {exceptions.length === 0
                ? needsConfiguration > 0
                  ? `${needsConfiguration} profile${needsConfiguration === 1 ? '' : 's'} need${needsConfiguration === 1 ? 's' : ''} a primary or backup`
                  : `✓ ${plan.unchanged} profile${plan.unchanged === 1 ? '' : 's'} unchanged`
                : `${exceptions.length} change${exceptions.length === 1 ? '' : 's'} awaiting approval`}
            </span>
          </h3>
          {exceptions.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => approve(exceptions.map((item) => ({ profileId: item.profileId, kind: item.kind })))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              Approve all
            </button>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-lg border border-status-danger/30 bg-status-danger/5 px-3 py-2 text-[12px] text-graphite">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-3 rounded-lg border border-status-success/30 bg-status-success/5 px-3 py-2 text-[12px] text-graphite">
            {notice}
          </p>
        )}

        {exceptions.length === 0 ? (
          <div className="mt-3">
            {needsConfiguration > 0 ? (
              <V4Empty
                title="Profiles need a primary or backup"
                body={`${needsConfiguration} profile${needsConfiguration === 1 ? ' has' : 's have'} no coverage chain configured. Configure a primary and ordered backups to enable leave cover.`}
              />
            ) : (
              <V4Empty
                title="No coverage changes needed"
                body="Every profile is covered by its primary rep. Leave coverage will appear here automatically."
              />
            )}
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {exceptions.map((item) => (
              <li
                key={`${item.profileId}:${item.kind}`}
                className="rounded-xl bg-bone px-4 py-3 ring-1 ring-line/70"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <V4Avatar name={item.profileName} size="sm" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-ink">
                        {item.profileName}
                        <span className="ml-2 text-[11px] font-normal uppercase tracking-[0.12em] text-stone">
                          {item.channels.join(' + ')}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[12px] text-graphite">
                        {item.kind === 'RESTORE_PRIMARY'
                          ? `${item.fromRepName} → ${item.toRepName}`
                          : `${item.fromRepName} → ${item.toRepName}`}
                        {' · '}
                        {item.reason}
                      </p>
                      <p className="mt-1 text-[11px] text-stone">
                        {item.workPackage.replies} replies · {item.workPackage.followUps} follow-ups ·{' '}
                        {item.workPackage.tasks} task{item.workPackage.tasks === 1 ? '' : 's'}
                        {item.readinessRequired ? ' · device access not confirmed' : ''}
                      </p>
                      <p className="mt-1 text-[11px] text-graphite">
                        {item.kind === 'RESTORE_PRIMARY' ? 'Open temporary tasks: ' : 'Also moving: '}
                        <span className="font-medium text-ink">
                          {item.workPackage.tasks} profile task{item.workPackage.tasks === 1 ? '' : 's'}
                        </span>
                        {' · '}
                        {item.personalTaskCount > 0
                          ? `${item.personalTaskCount} personal task${item.personalTaskCount === 1 ? '' : 's'} stay`
                          : 'no personal tasks'}
                      </p>
                      {!item.readinessRequired && (
                        <p className="mt-1 text-[11px] text-status-success">✓ Covering rep confirmed on this device</p>
                      )}
                      <p className="mt-1 text-[11px] text-stone">
                        No lead ownership will change. Historical attribution will not change.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (item.kind !== 'RESTORE_PRIMARY') {
                        approve([{ profileId: item.profileId, kind: item.kind }])
                        return
                      }
                      // Manual restore: the admin decides which open tasks return.
                      void openRestore(item)
                    }}
                    className={cn(
                      'shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-transform active:scale-[0.98] disabled:opacity-60',
                      item.kind === 'RESTORE_PRIMARY'
                        ? 'border border-line bg-bone-raised text-ink hover:bg-bone'
                        : 'bg-solid text-on-solid',
                    )}
                  >
                    {item.kind === 'RESTORE_PRIMARY' ? 'Restore primary' : 'Approve coverage'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Full coverage status, collapsed by default — the daily plan is the
          management surface, the table is the drill-down. */}
      <div className="mt-5 border-t border-line/70 pt-4">
        <button
          type="button"
          onClick={() => setShowAllProfiles((v) => !v)}
          aria-expanded={showAllProfiles}
          className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
        >
          <h3 className="text-[13px] font-medium text-ink">
            Profile coverage
            <span className="ml-2 text-[12px] font-normal text-stone">
              {plan.profiles.length} profiles
            </span>
          </h3>
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite hover:text-ink">
            {showAllProfiles ? 'Hide' : 'Show all'}
            <ChevronRight className={cn('size-3.5 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]', showAllProfiles && 'rotate-90')} aria-hidden />
          </span>
        </button>
        {showAllProfiles && (
          <ul className="mt-2 space-y-1.5">
            {plan.profiles.map((profile) => (
              <li key={profile.profileId} className="flex flex-col gap-1 text-[12px] sm:flex-row sm:items-center sm:gap-x-3">
                <span className="min-w-0 flex-1 truncate text-ink">{profile.name}</span>
                <span className="text-graphite">
                  {profile.primaryRepName ?? 'No primary'}
                  {profile.activeCoveringRepName ? ` · covering ${profile.activeCoveringRepName}` : ''}
                </span>
                {profile.coverageExpiring && (
                  <V4Chip tone="warning" className="w-fit sm:shrink-0">Ends today</V4Chip>
                )}
                <V4Chip tone={STATUS_TONE[profile.status] ?? 'neutral'} className="w-fit sm:shrink-0">
                  {STATUS_LABEL[profile.status] ?? profile.status}
                </V4Chip>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={restoreItem !== null}
        onClose={() => setRestoreItem(null)}
        title={`Restore ${restoreItem?.profileName ?? ''}`}
        description={`Current cover: ${restoreItem?.fromRepName ?? '—'} → primary ${restoreItem?.toRepName ?? '—'}. Choose which open tasks return. Completed work stays with the covering rep.`}
        className="max-w-lg"
      >
        <div className="space-y-3">
          {restoreLoading ? (
            <p className="text-[13px] text-graphite">Loading open tasks…</p>
          ) : restoreTasks.length === 0 ? (
            <p className="text-[13px] text-graphite">
              No open profile tasks to return. Restoring only ends the coverage.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-graphite">
                  {restoreSelected.size} of {restoreTasks.length} selected
                </p>
                <button
                  type="button"
                  onClick={selectAllRestoreTasks}
                  className="text-[12px] font-medium text-ink hover:underline"
                >
                  Return all open profile tasks
                </button>
              </div>
              <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                {restoreTasks.map((task) => (
                  <li key={task.id}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-bone px-3 py-2">
                      <input
                        type="checkbox"
                        checked={restoreSelected.has(task.id)}
                        onChange={() => toggleRestoreTask(task.id)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] text-ink">{task.title}</span>
                        <span className="text-[11px] text-stone">{task.status}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <DialogActions className="mt-5">
          <Button type="button" variant="ghost" onClick={() => setRestoreItem(null)} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (!restoreItem) return
              const ids = [...restoreSelected]
              await approve([{
                profileId: restoreItem.profileId,
                kind: 'RESTORE_PRIMARY',
                returnOpenTasks: ids.length === restoreTasks.length && restoreTasks.length > 0,
                returnTaskIds: ids,
              }])
              setRestoreItem(null)
            }}
          >
            Restore primary
          </Button>
        </DialogActions>
      </Dialog>
    </V4Panel>
  )
}

function StatusFact({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl bg-bone px-3 py-2.5 ring-1 ring-line/70">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone">{label}</p>
      <p className={cn('mt-1 text-[18px] font-medium leading-none tabular-nums', tone)}>{value}</p>
    </div>
  )
}
