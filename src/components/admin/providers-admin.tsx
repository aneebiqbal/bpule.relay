'use client'

/**
 * Admin → Provider discovery (§33, §34).
 *
 * The one surface for provider status/budget and saved-search configuration.
 * Secrets are never shown — `configured` is a boolean from the server.
 */
import { useCallback, useEffect, useState } from 'react'
import { V4Panel, V4PanelHeader, V4Chip } from '@/components/v4/primitives'

interface ProviderRow {
  provider: string
  configured: boolean
  enabled: boolean
  dailyCreditBudget: number
  creditsUsedToday: number
  budgetDate: string | null
  lastRunAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
  lastErrorAt: string | null
  consecutiveFailures: number
  today: { credits: number; operations: number; failures: number }
}

interface SearchRow {
  id: string
  name: string
  provider: string
  titles: string[]
  seniority: string[]
  countries: string[]
  company_size: string[]
  industries: string[]
  exclude_titles: string[]
  enabled: boolean
  pages_per_run: number
  daily_credit_budget: number
  cursor_page: number
}

interface Analytics {
  funnel: {
    discovered: number
    qualified: number
    emailVerified: number
    leadCreated: number
    connectionSent: number
    linkedinReply: number
    emailSent: number
    emailReply: number
    meeting: number
    won: number
  }
  searches: Array<{
    searchId: string
    searchName: string
    provider: string
    discovered: number
    qualified: number
    leadCreated: number
    verifiedEmails: number
    creditsUsed: number
    costPerVerifiedEmail: number | null
  }>
}

const EMPTY_FORM = {
  id: '',
  name: '',
  provider: 'prospeo',
  titles: '',
  seniority: '',
  countries: '',
  companySize: '',
  industries: '',
  excludeTitles: '',
  pagesPerRun: 1,
  dailyCreditBudget: 0,
}

function commaList(value: string): string[] {
  return value.split(',').map((entry) => entry.trim()).filter(Boolean)
}

function relative(iso: string | null): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return '—'
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000))
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export function ProvidersAdmin() {
  const [providers, setProviders] = useState<ProviderRow[]>([])
  const [searches, setSearches] = useState<SearchRow[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [providerRes, searchRes, analyticsRes] = await Promise.all([
        fetch('/api/admin/providers', { cache: 'no-store' }),
        fetch('/api/admin/provider-searches', { cache: 'no-store' }),
        fetch('/api/admin/provider-analytics?days=7', { cache: 'no-store' }),
      ])
      const providerBody = (await providerRes.json().catch(() => ({}))) as { providers?: ProviderRow[] }
      const searchBody = (await searchRes.json().catch(() => ({}))) as { searches?: SearchRow[] }
      const analyticsBody = (await analyticsRes.json().catch(() => ({}))) as Analytics
      if (!providerRes.ok) throw new Error('Could not load provider health.')
      setProviders(providerBody.providers ?? [])
      setSearches(searchBody.searches ?? [])
      if (analyticsRes.ok) setAnalytics(analyticsBody)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load provider configuration.')
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  async function saveProvider(provider: string, patch: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/providers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, ...patch }),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Could not save provider settings.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save provider settings.')
    } finally {
      setBusy(false)
    }
  }

  async function saveSearch() {
    setBusy(true)
    setError(null)
    try {
      const editing = Boolean(form.id)
      const response = await fetch(editing ? `/api/admin/provider-searches/${form.id}` : '/api/admin/provider-searches', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          provider: form.provider,
          titles: commaList(form.titles),
          seniority: commaList(form.seniority),
          countries: commaList(form.countries),
          companySize: commaList(form.companySize),
          industries: commaList(form.industries),
          excludeTitles: commaList(form.excludeTitles),
          pagesPerRun: form.pagesPerRun,
          dailyCreditBudget: form.dailyCreditBudget,
        }),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Could not save the search.')
      setForm({ ...EMPTY_FORM })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the search.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteSearch(id: string) {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/provider-searches/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Could not delete the search.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the search.')
    } finally {
      setBusy(false)
    }
  }

  function editSearch(row: SearchRow) {
    setForm({
      id: row.id,
      name: row.name,
      provider: row.provider,
      titles: row.titles.join(', '),
      seniority: row.seniority.join(', '),
      countries: row.countries.join(', '),
      companySize: row.company_size.join(', '),
      industries: row.industries.join(', '),
      excludeTitles: row.exclude_titles.join(', '),
      pagesPerRun: row.pages_per_run,
      dailyCreditBudget: row.daily_credit_budget,
    })
  }

  async function saveProviderSearch(id: string, patch: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/provider-searches/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Could not save the search.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the search.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.18em] text-stone">Admin / Prospect</p>
        <h1 className="mt-1 text-[24px] font-light tracking-[-0.02em] text-ink">Provider discovery</h1>
        <p className="mt-1 text-[13px] text-graphite">
          Provider status, daily credit budgets and the saved searches that feed Fresh Prospects.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-status-danger/30 bg-status-danger/5 px-3 py-2 text-[12px] text-graphite">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {providers.map((row) => (
          <V4Panel key={row.provider}>
            <V4PanelHeader
              eyebrow="Provider"
              title={row.provider.charAt(0).toUpperCase() + row.provider.slice(1)}
              hint={`${row.configured ? 'Connected' : 'Not configured on the server'} · ${row.today.operations} calls today`}
              action={<V4Chip tone={row.configured ? 'success' : 'neutral'}>{row.configured ? 'Connected' : 'No key'}</V4Chip>}
            />
            <dl className="mt-3 space-y-1 border-t border-line/60 pt-3 text-[12px]">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-stone">Credits used today</dt>
                <dd className="tabular-nums text-ink">{row.creditsUsedToday} / {row.dailyCreditBudget > 0 ? row.dailyCreditBudget : '∞'}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-stone">Telemetry spend today</dt>
                <dd className="tabular-nums text-ink">{row.today.credits}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-stone">Failures today</dt>
                <dd className={`tabular-nums ${row.today.failures > 0 ? 'text-status-danger' : 'text-ink'}`}>{row.today.failures}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-stone">Last run</dt>
                <dd className="text-graphite">{relative(row.lastRunAt)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-stone">Consecutive failures</dt>
                <dd className="tabular-nums text-graphite">{row.consecutiveFailures}</dd>
              </div>
              {row.lastError && (
                <p className="pt-1 text-[11px] text-status-danger">{row.lastError}</p>
              )}
            </dl>
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line/60 pt-3">
              <label className="flex items-center gap-2 text-[12px] text-graphite">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  disabled={busy || !row.configured}
                  onChange={(event) => void saveProvider(row.provider, { enabled: event.target.checked })}
                  className="size-4 accent-ink"
                />
                Enabled
              </label>
              <label className="flex items-center gap-2 text-[12px] text-graphite">
                Daily budget
                <input
                  type="number"
                  min={0}
                  defaultValue={row.dailyCreditBudget}
                  disabled={busy}
                  onBlur={(event) => {
                    const value = Number(event.target.value)
                    if (Number.isInteger(value) && value >= 0 && value !== row.dailyCreditBudget) {
                      void saveProvider(row.provider, { dailyCreditBudget: value })
                    }
                  }}
                  className="h-8 w-20 rounded-lg border border-line bg-bone-raised px-2 text-[12px] text-ink"
                />
              </label>
            </div>
          </V4Panel>
        ))}
      </div>

      <V4Panel>
        <V4PanelHeader
          eyebrow="Daily discovery"
          title={form.id ? 'Edit saved search' : 'New saved search'}
          hint="One search per region or motion. Overlapping searches dedupe by provider person."
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-[12px] text-graphite">
            Name
            <input
              type="text"
              value={form.name}
              disabled={busy}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="mt-1 h-9 w-full rounded-lg border border-line bg-bone-raised px-3 text-[12px] text-ink"
            />
          </label>
          <label className="block text-[12px] text-graphite">
            Provider
            <select
              value={form.provider}
              disabled={busy}
              onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))}
              className="mt-1 h-9 w-full rounded-lg border border-line bg-bone-raised px-2 text-[12px] text-ink"
            >
              <option value="prospeo">Prospeo</option>
              <option value="snov">Snov.io</option>
            </select>
          </label>
          <label className="block text-[12px] text-graphite">
            Titles (comma separated)
            <input
              type="text"
              value={form.titles}
              disabled={busy}
              onChange={(event) => setForm((current) => ({ ...current, titles: event.target.value }))}
              className="mt-1 h-9 w-full rounded-lg border border-line bg-bone-raised px-3 text-[12px] text-ink"
            />
          </label>
          <label className="block text-[12px] text-graphite">
            Seniority
            <input
              type="text"
              value={form.seniority}
              disabled={busy}
              onChange={(event) => setForm((current) => ({ ...current, seniority: event.target.value }))}
              className="mt-1 h-9 w-full rounded-lg border border-line bg-bone-raised px-3 text-[12px] text-ink"
            />
          </label>
          <label className="block text-[12px] text-graphite">
            Countries
            <input
              type="text"
              value={form.countries}
              disabled={busy}
              onChange={(event) => setForm((current) => ({ ...current, countries: event.target.value }))}
              className="mt-1 h-9 w-full rounded-lg border border-line bg-bone-raised px-3 text-[12px] text-ink"
            />
          </label>
          <label className="block text-[12px] text-graphite">
            Company size
            <input
              type="text"
              value={form.companySize}
              disabled={busy}
              onChange={(event) => setForm((current) => ({ ...current, companySize: event.target.value }))}
              className="mt-1 h-9 w-full rounded-lg border border-line bg-bone-raised px-3 text-[12px] text-ink"
            />
          </label>
          <label className="block text-[12px] text-graphite">
            Industries
            <input
              type="text"
              value={form.industries}
              disabled={busy}
              onChange={(event) => setForm((current) => ({ ...current, industries: event.target.value }))}
              className="mt-1 h-9 w-full rounded-lg border border-line bg-bone-raised px-3 text-[12px] text-ink"
            />
          </label>
          <label className="block text-[12px] text-graphite">
            Exclude titles
            <input
              type="text"
              value={form.excludeTitles}
              disabled={busy}
              onChange={(event) => setForm((current) => ({ ...current, excludeTitles: event.target.value }))}
              className="mt-1 h-9 w-full rounded-lg border border-line bg-bone-raised px-3 text-[12px] text-ink"
            />
          </label>
          <label className="block text-[12px] text-graphite">
            Pages per run
            <input
              type="number"
              min={1}
              max={10}
              value={form.pagesPerRun}
              disabled={busy}
              onChange={(event) => setForm((current) => ({ ...current, pagesPerRun: Number(event.target.value) }))}
              className="mt-1 h-9 w-full rounded-lg border border-line bg-bone-raised px-3 text-[12px] text-ink"
            />
          </label>
          <label className="block text-[12px] text-graphite">
            Daily credit budget (0 = inherit)
            <input
              type="number"
              min={0}
              value={form.dailyCreditBudget}
              disabled={busy}
              onChange={(event) => setForm((current) => ({ ...current, dailyCreditBudget: Number(event.target.value) }))}
              className="mt-1 h-9 w-full rounded-lg border border-line bg-bone-raised px-3 text-[12px] text-ink"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || !form.name.trim()}
            onClick={() => void saveSearch()}
            className="rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {form.id ? 'Save changes' : 'Create search'}
          </button>
          {form.id && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setForm({ ...EMPTY_FORM })}
              className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-graphite"
            >
              Cancel
            </button>
          )}
        </div>
      </V4Panel>

      <V4Panel>
        <V4PanelHeader eyebrow="Saved searches" title={`${searches.length} configured`} hint="Disabled searches are not planned by the daily job." />
        {searches.length === 0 ? (
          <p className="mt-4 text-[13px] text-graphite">No saved searches yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {searches.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-bone p-3 ring-1 ring-line/70">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink">{row.name}</p>
                  <p className="text-[12px] text-graphite">
                    {row.provider} · {row.titles.slice(0, 3).join(', ') || 'Any title'} · {row.countries.slice(0, 3).join(', ') || 'Any region'}
                  </p>
                  <p className="text-[11px] text-stone">
                    {row.pages_per_run} page{row.pages_per_run === 1 ? '' : 's'}/run · budget {row.daily_credit_budget > 0 ? row.daily_credit_budget : 'inherit'} · cursor {row.cursor_page}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 text-[12px] text-graphite">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      disabled={busy}
                      onChange={(event) => void saveProviderSearch(row.id, { enabled: event.target.checked })}
                      className="size-4 accent-ink"
                    />
                    Enabled
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => editSearch(row)}
                    className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-graphite"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void deleteSearch(row.id)}
                    className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-graphite transition-colors hover:text-status-danger"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </V4Panel>

      {analytics && (
        <V4Panel>
          <V4PanelHeader
            eyebrow="Last 7 days"
            title="Discovery funnel"
            hint="Canonical events only — discovered, qualified, verified, promoted, executed."
          />
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {([
              ['Discovered', analytics.funnel.discovered],
              ['Qualified', analytics.funnel.qualified],
              ['Verified emails', analytics.funnel.emailVerified],
              ['Leads created', analytics.funnel.leadCreated],
              ['Connections sent', analytics.funnel.connectionSent],
              ['LinkedIn replies', analytics.funnel.linkedinReply],
              ['Emails sent', analytics.funnel.emailSent],
              ['Email replies', analytics.funnel.emailReply],
              ['Meetings', analytics.funnel.meeting],
              ['Won', analytics.funnel.won],
            ] as Array<[string, number]>).map(([label, value]) => (
              <div key={label} className="rounded-lg bg-bone-raised px-3 py-2.5 ring-1 ring-line/70">
                <dt className="text-[11px] text-graphite">{label}</dt>
                <dd className="mt-1 text-[20px] font-medium tabular-nums text-ink">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[12px]">
              <caption className="sr-only">Saved search quality for the last 7 days</caption>
              <thead>
                <tr className="border-b border-line/70 text-[11px] text-stone">
                  <th scope="col" className="py-2 pr-3 font-medium">Search</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Provider</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Discovered</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Qualified</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Leads</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Verified</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Credits</th>
                  <th scope="col" className="py-2 text-right font-medium">Cost / verified</th>
                </tr>
              </thead>
              <tbody>
                {analytics.searches.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-3 text-graphite">No discovery in this window.</td>
                  </tr>
                ) : (
                  analytics.searches.map((row) => (
                    <tr key={row.searchId} className="border-b border-line/40 last:border-0">
                      <td className="py-2 pr-3 text-ink">{row.searchName}</td>
                      <td className="py-2 pr-3 text-graphite">{row.provider}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ink">{row.discovered}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ink">{row.qualified}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ink">{row.leadCreated}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ink">{row.verifiedEmails}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ink">{row.creditsUsed}</td>
                      <td className="py-2 text-right tabular-nums text-ink">
                        {row.costPerVerifiedEmail == null ? '—' : row.costPerVerifiedEmail.toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </V4Panel>
      )}
    </div>
  )
}
