'use client'

/**
 * Discovery sources — the saved searches that pull leads from the provider
 * APIs (Prospeo primary, Snov fallback, Apollo disabled).
 *
 * This is the only place a source is configured; discovery itself runs through
 * the canonical `operational_jobs` outbox. The Fresh Prospects tab is the
 * read-side of the same pipeline.
 */
import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { V4Chip, V4Panel, V4PanelHeader } from '@/components/v4/primitives'

interface SavedSearch {
  id: string
  name: string
  provider: string
  titles: string[]
  countries: string[]
  industries: string[]
  enabled: boolean
  pages_per_run: number
  daily_credit_budget: number
}

const PROVIDERS = [
  { value: 'prospeo', label: 'Prospeo', hint: 'Primary search + email reveal' },
  { value: 'snov', label: 'Snov.io', hint: 'Fallback finder + verifier' },
]

const EMPTY = {
  name: '',
  provider: 'prospeo',
  titles: '',
  countries: '',
  industries: '',
  pagesPerRun: 1,
  dailyCreditBudget: 25,
}

export function ProviderSourcesDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [searches, setSearches] = useState<SavedSearch[] | null>(null)
  const [form, setForm] = useState({ ...EMPTY })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/provider-searches', { cache: 'no-store' })
      const body = (await res.json().catch(() => ({}))) as { searches?: SavedSearch[]; error?: string }
      if (!res.ok) throw new Error(body.error ?? 'Could not load sources.')
      setSearches(body.searches ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load sources.')
    }
  }, [])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  if (!open) return null

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/provider-searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          provider: form.provider,
          titles: form.titles.split(',').map((s) => s.trim()).filter(Boolean),
          countries: form.countries.split(',').map((s) => s.trim()).filter(Boolean),
          industries: form.industries.split(',').map((s) => s.trim()).filter(Boolean),
          pagesPerRun: form.pagesPerRun,
          dailyCreditBudget: form.dailyCreditBudget,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'Could not create the source.')
      setForm({ ...EMPTY })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the source.')
    } finally {
      setBusy(false)
    }
  }

  async function toggle(row: SavedSearch) {
    await fetch(`/api/admin/provider-searches/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !row.enabled }),
    }).catch(() => {})
    await load()
  }

  async function remove(row: SavedSearch) {
    await fetch(`/api/admin/provider-searches/${row.id}`, { method: 'DELETE' }).catch(() => {})
    await load()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-[8vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Discovery sources"
      onClick={onClose}
    >
      <div
        className="w-[min(46rem,calc(100vw-2rem))] rounded-2xl border border-line bg-bone-raised shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <V4Panel>
          <V4PanelHeader
            eyebrow="Admin / Discovery"
            title="Lead sources"
            hint="Saved searches that pull new prospects from the provider APIs."
            action={
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-line px-2.5 py-1 text-[12px] font-medium text-graphite transition-colors hover:text-ink"
              >
                Close
              </button>
            }
          />

          {error && (
            <p role="alert" className="mt-3 rounded-lg border border-status-danger/30 bg-status-danger/5 px-3 py-2 text-[12px] text-status-danger">
              {error}
            </p>
          )}

          <div className="mt-4 space-y-2">
            {searches === null ? (
              <p className="py-6 text-center text-[13px] text-stone">Loading sources…</p>
            ) : searches.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[13px] text-stone">
                No sources yet. Add one below to start pulling prospects.
              </p>
            ) : (
              searches.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-line/70 bg-bone px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink">{row.name}</p>
                    <p className="truncate text-[11px] text-stone">
                      {[row.provider, ...row.titles].filter(Boolean).join(' · ') || row.provider}
                    </p>
                  </div>
                  <V4Chip tone={row.enabled ? 'success' : 'neutral'}>
                    {row.enabled ? 'Running' : 'Paused'}
                  </V4Chip>
                  <span className="text-[11px] tabular-nums text-stone">
                    {row.pages_per_run} page{row.pages_per_run === 1 ? '' : 's'}/day
                  </span>
                  <button
                    type="button"
                    onClick={() => void toggle(row)}
                    className="rounded-lg border border-line px-2.5 py-1 text-[12px] font-medium text-graphite transition-colors hover:text-ink"
                  >
                    {row.enabled ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(row)}
                    aria-label={`Delete ${row.name}`}
                    className="rounded-lg border border-line p-1.5 text-graphite transition-colors hover:text-status-danger"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="mt-5 border-t border-line/70 pt-4">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-stone">New source</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[11px] text-stone">Name</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Founders · US"
                  className="h-9 w-full rounded-lg border border-line bg-bone px-2.5 text-[13px] text-ink"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-stone">Provider</span>
                <select
                  value={form.provider}
                  onChange={(e) => setForm({ ...form, provider: e.target.value })}
                  className="h-9 w-full rounded-lg border border-line bg-bone px-2 text-[13px] text-ink"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-[11px] text-stone">Titles (comma separated)</span>
                <input
                  value={form.titles}
                  onChange={(e) => setForm({ ...form, titles: e.target.value })}
                  placeholder="Founder, CEO, CTO"
                  className="h-9 w-full rounded-lg border border-line bg-bone px-2.5 text-[13px] text-ink"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-stone">Countries</span>
                <input
                  value={form.countries}
                  onChange={(e) => setForm({ ...form, countries: e.target.value })}
                  placeholder="United States, Canada"
                  className="h-9 w-full rounded-lg border border-line bg-bone px-2.5 text-[13px] text-ink"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-stone">Daily credit budget</span>
                <input
                  type="number"
                  min={0}
                  value={form.dailyCreditBudget}
                  onChange={(e) => setForm({ ...form, dailyCreditBudget: Number(e.target.value) })}
                  className="h-9 w-full rounded-lg border border-line bg-bone px-2.5 text-[13px] text-ink"
                />
              </label>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[11px] text-stone">
                Apollo is not connected — no adapter is built for it.
              </p>
              <button
                type="button"
                onClick={() => void create()}
                disabled={busy || !form.name.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                <Plus className="size-3.5" aria-hidden />
                Add source
              </button>
            </div>
          </div>
        </V4Panel>
      </div>
    </div>
  )
}
