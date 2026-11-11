'use client'

/**
 * Fresh Prospects — provider-discovered candidates awaiting a human decision.
 *
 * Operational, not a data-table dump: each row says who they are, who they fit,
 * whether a verified email exists, and offers Review / Create lead / Dismiss.
 * Filtering is by suggested profile (§18); once promoted, the canonical Leads
 * filter takes over.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Mail, Search } from 'lucide-react'
import { V4Chip, V4Panel, V4PanelHeader } from '@/components/v4/primitives'
import type { FreshProspectRow } from '@/lib/enrichment/fresh-prospects'

const TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
  VERIFIED: 'success',
  LIKELY_VALID: 'info',
  RISKY: 'warning',
  INVALID: 'neutral',
  UNKNOWN: 'neutral',
}

function relative(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000))
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

export function FreshProspectsView({
  rows: initialRows,
  orgView,
  workspace,
}: {
  rows: FreshProspectRow[]
  orgView: boolean
  workspace: { identityName: string | null } | null
}) {
  const router = useRouter()
  const [rows, setRows] = useState<FreshProspectRow[]>(initialRows)
  const [profileFilter, setProfileFilter] = useState('')
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (profile: string) => {
    const params = profile ? `?profile=${encodeURIComponent(profile)}` : ''
    try {
      const response = await fetch(`/api/prospect/fresh${params}`, { cache: 'no-store' })
      const body = (await response.json().catch(() => ({}))) as { prospects?: FreshProspectRow[]; error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Could not load fresh prospects.')
      setRows(body.prospects ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load fresh prospects.')
    }
  }, [])

  useEffect(() => {
    if (initialRows.length === 0) void load(profileFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileFilter])

  const profileOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of rows) {
      if (row.bestProfileId && row.bestProfileName) map.set(row.bestProfileId, row.bestProfileName)
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((row) =>
      [row.displayName, row.title, row.company, row.location, row.bestProfileName]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(needle)),
    )
  }, [rows, query])

  async function promote(candidateId: string) {
    setBusyId(candidateId)
    setError(null)
    try {
      const response = await fetch(`/api/prospect/fresh/${candidateId}/promote`, { method: 'POST' })
      const body = (await response.json().catch(() => ({}))) as { leadId?: string; error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Could not create the lead.')
      if (body.leadId) router.push(`/leads/${body.leadId}`)
      else setRows((current) => current.filter((row) => row.candidateId !== candidateId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the lead.')
    } finally {
      setBusyId(null)
    }
  }

  async function dismiss(candidateId: string) {
    setBusyId(candidateId)
    setError(null)
    try {
      const response = await fetch(`/api/prospect/fresh/${candidateId}/dismiss`, { method: 'POST' })
      if (!response.ok) throw new Error('Could not dismiss the prospect.')
      setRows((current) => current.filter((row) => row.candidateId !== candidateId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not dismiss the prospect.')
    } finally {
      setBusyId(null)
    }
  }

  const verifiedCount = rows.filter((row) => row.emailStatus === 'VERIFIED' || row.emailStatus === 'LIKELY_VALID').length

  return (
    <div className="space-y-4">
      <V4Panel>
        <V4PanelHeader
          eyebrow="Sales / Prospect"
          title="Fresh prospects"
          hint={`${rows.length} awaiting review · ${verifiedCount} with a verified email`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <span className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-stone" aria-hidden />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search"
                  aria-label="Search fresh prospects"
                  className="h-9 w-40 rounded-lg border border-line bg-bone-raised pl-8 pr-3 text-[12px] text-ink"
                />
              </span>
              <select
                value={profileFilter}
                onChange={(event) => setProfileFilter(event.target.value)}
                aria-label="Filter by suggested profile"
                className="h-9 rounded-lg border border-line bg-bone-raised px-2 text-[12px] text-ink"
              >
                <option value="">All profiles</option>
                {profileOptions.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
          }
        />

        {error && (
          <p role="alert" className="mt-3 rounded-lg border border-status-danger/30 bg-status-danger/5 px-3 py-2 text-[12px] text-graphite">
            {error}
          </p>
        )}

        {filtered.length === 0 ? (
          <p className="mt-4 text-[13px] text-graphite">
            {rows.length === 0
              ? 'No fresh prospects yet. Configure a saved search and let discovery run.'
              : 'No prospects match this filter.'}
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {filtered.map((row) => (
              <li key={row.candidateId} className="rounded-xl bg-bone p-4 ring-1 ring-line/70">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-ink">{row.displayName || 'Unnamed prospect'}</p>
                    <p className="truncate text-[12px] text-graphite">
                      {[row.title, row.company].filter(Boolean).join(' · ')}
                    </p>
                    {row.location && <p className="text-[11px] text-stone">{row.location}</p>}
                  </div>
                  {row.emailStatus && (
                    <V4Chip tone={TONE[row.emailStatus] ?? 'neutral'}>
                      <Mail className="size-3" aria-hidden />
                      {row.emailStatus === 'VERIFIED' ? 'Verified email' : row.emailStatus === 'LIKELY_VALID' ? 'Likely valid' : 'No verified email'}
                    </V4Chip>
                  )}
                </div>

                <dl className="mt-3 space-y-1 border-t border-line/60 pt-3 text-[12px]">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-stone">Best fit</dt>
                    <dd className="text-right text-ink">
                      {row.bestProfileName
                        ? `${row.bestProfileName} · ${row.bestProfileMatch ?? 0}%${row.matchAmbiguous ? ' (ambiguous)' : ''}`
                        : 'No confident profile match'}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-stone">Score</dt>
                    <dd className="tabular-nums text-ink">{row.canonicalScore}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-stone">Source</dt>
                    <dd className="text-graphite">
                      {row.provider ? row.provider.charAt(0).toUpperCase() + row.provider.slice(1) : '—'}
                      {' · '}
                      {row.discoveredAt ? relative(row.discoveredAt) : '—'}
                    </dd>
                  </div>
                  {row.emailStatus === 'VERIFIED' && (
                    <div className="flex items-center gap-1.5 text-[12px] text-status-success">
                      <CheckCircle2 className="size-3.5" aria-hidden />
                      Sendable email available
                    </div>
                  )}
                </dl>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busyId === row.candidateId}
                    onClick={() => void promote(row.candidateId)}
                    className="rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:opacity-60"
                  >
                    Create lead
                  </button>
                  {row.linkedinUrl && (
                    <a
                      href={row.linkedinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-graphite transition-colors hover:text-ink"
                    >
                      Review
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={busyId === row.candidateId}
                    onClick={() => void dismiss(row.candidateId)}
                    className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-graphite transition-colors hover:text-status-danger disabled:opacity-60"
                  >
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </V4Panel>
    </div>
  )
}
