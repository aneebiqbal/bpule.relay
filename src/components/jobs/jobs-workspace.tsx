'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Bookmark,
  Briefcase,
  Clock,
  ExternalLink,
  FileText,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { JobCard, JobFilters, JobsView, PreparedCard } from '@/lib/job-discovery/service'
import { isSafeApplicationUrl } from '@/lib/job-discovery/url'

interface ProfileOption {
  id: string
  label: string
  platform: string
}

interface JobsWorkspaceProps {
  initialView: JobsView
  views: JobsView[]
  jobs: JobCard[]
  hasMore: boolean
  offset: number
  limit: number
  search: string
  initialFilters: JobFilters
  profiles: ProfileOption[]
  activeProfileId: string | null
  applications: Array<Record<string, unknown>>
  documents: Array<Record<string, unknown>>
  prepared: PreparedCard[]
  sources: Array<Record<string, unknown>>
  isAdmin: boolean
}

const VIEW_LABELS: Record<JobsView, string> = {
  'for-you': 'For You',
  shortlist: 'Ready Today',
  prepared: 'Prepared',
  latest: 'Latest',
  'verified-remote': 'Verified Remote',
  saved: 'Saved',
  applications: 'Applications',
  documents: 'Documents',
  sources: 'Sources & Health',
}

const CATEGORY_LABEL: Record<string, string> = {
  excellent: 'Excellent match',
  strong: 'Strong match',
  possible: 'Possible match',
  stretch: 'Stretch opportunity',
  not_eligible: 'Not eligible',
  requires_verification: 'Requires verification',
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function relative(value: string | null, now: number = Date.now()): string {
  if (!value) return '—'
  const ms = now - new Date(value).getTime()
  if (!Number.isFinite(ms) || ms < 0) return 'just now'
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(value)
}

function salaryLabel(job: JobCard): string | null {
  if (!job.salaryMin && !job.salaryMax) return null
  const currency = job.salaryCurrency ?? 'USD'
  const min = job.salaryMin ?? job.salaryMax
  const max = job.salaryMax ?? job.salaryMin
  const period = job.salaryPeriod === 'hour' ? '/hr' : job.salaryPeriod === 'year' ? '/yr' : ''
  if (min === max) return `$${min}${period} ${currency}`
  return `$${min}–$${max}${period} ${currency}`
}

function eligibilityLabel(job: JobCard): { text: string; tone: 'success' | 'warning' | 'destructive' | 'outline' } {
  const eligibility = job.eligibility
  if (!eligibility) return { text: 'Eligibility unknown', tone: 'outline' }
  switch (eligibility.classification) {
    case 'worldwide':
      return { text: 'Worldwide remote', tone: 'success' }
    case 'country_restricted':
      return { text: `Restricted: ${eligibility.countries.join(', ')}`, tone: eligibility.confidence === 'confirmed' ? 'warning' : 'outline' }
    case 'region_restricted':
      return { text: `Region: ${eligibility.regions.join(', ')}`, tone: 'warning' }
    case 'timezone_restricted':
      return { text: `Timezone: ${eligibility.timezones.join(', ')}`, tone: 'warning' }
    case 'residency_required':
      return { text: 'Work authorization required', tone: 'destructive' }
    case 'employee_only':
      return { text: 'Employee only', tone: 'outline' }
    case 'contractor_allowed':
      return { text: 'Contractor allowed', tone: 'success' }
    default:
      return { text: 'Eligibility unknown', tone: 'outline' }
  }
}

function verificationLabel(status: string): { text: string; tone: 'success' | 'warning' | 'outline' | 'destructive' } {
  switch (status) {
    case 'verified_open':
      return { text: 'Verified open', tone: 'success' }
    case 'recently_seen':
      return { text: 'Recently seen', tone: 'warning' }
    case 'verification_needed':
      return { text: 'Verification needed', tone: 'outline' }
    case 'closed':
      return { text: 'Closed', tone: 'destructive' }
    case 'expired':
      return { text: 'Expired', tone: 'destructive' }
    case 'source_unavailable':
      return { text: 'Source unavailable', tone: 'outline' }
    default:
      return { text: status, tone: 'outline' }
  }
}

export function JobsWorkspace(props: JobsWorkspaceProps) {
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(props.search)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importForm, setImportForm] = useState({ title: '', company: '', url: '', location: '', description: '', remote: true })
  const [filters, setFilters] = useState<JobFilters>(props.initialFilters)
  const [showFilters, setShowFilters] = useState(false)
  const [savedFilters, setSavedFilters] = useState<Array<Record<string, unknown>>>([])

  useEffect(() => {
    fetch('/api/jobs/filters')
      .then((response) => (response.ok ? response.json() : { filters: [] }))
      .then((data: { filters: Array<Record<string, unknown>> }) => setSavedFilters(data.filters))
      .catch(() => {})
  }, [])
  const activeView = (searchParams.get('view') as JobsView) ?? props.initialView
  const profileId = searchParams.get('profileId') ?? props.activeProfileId ?? ''

  const basePath = useMemo(() => {
    const params = new URLSearchParams()
    params.set('view', activeView)
    if (profileId) params.set('profileId', profileId)
    return `/jobs?${params.toString()}`
  }, [activeView, profileId])

  function submitSearch(event: React.FormEvent) {
    event.preventDefault()
    const params = new URLSearchParams()
    params.set('view', activeView)
    if (profileId) params.set('profileId', profileId)
    if (search.trim()) params.set('search', search.trim())
    window.location.href = `/jobs?${params.toString()}`
  }

  async function toggleSave(job: JobCard) {
    setBusyId(job.id)
    try {
      await fetch(`/api/jobs/${job.id}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, saved: !job.saved }),
      })
      window.location.reload()
    } finally {
      setBusyId(null)
    }
  }

  function pushFilters(next: JobFilters) {
    const params = new URLSearchParams()
    params.set('view', activeView)
    if (profileId) params.set('profileId', profileId)
    if (search.trim()) params.set('search', search.trim())
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === null || value === '') continue
      if (Array.isArray(value)) {
        if (value.length > 0) params.set(key, value.join(','))
      } else {
        params.set(key, String(value))
      }
    }
    window.location.href = `/jobs?${params.toString()}`
  }

  function submitFilters(event: React.FormEvent) {
    event.preventDefault()
    pushFilters(filters)
  }

  async function saveFilter() {
    const name = window.prompt('Name this filter set?')
    if (!name?.trim()) return
    const response = await fetch('/api/jobs/filters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), filters }),
    })
    if (response.ok) {
      const data = (await response.json()) as { id: string }
      setSavedFilters((rows) => [{ id: data.id, name: name.trim(), filters }, ...rows])
    }
  }

  function applySavedFilter(id: string) {
    const row = savedFilters.find((item) => item.id === id)
    if (!row) return
    const next = (row.filters ?? {}) as JobFilters
    setFilters(next)
    pushFilters(next)
  }

  const inputClass = 'h-8 w-full rounded-md border border-line bg-bone px-2 text-xs text-ink outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'
  const update = <K extends keyof JobFilters>(key: K, value: JobFilters[K]) => {
    setFilters((previous) => ({ ...previous, [key]: value }))
  }

  async function submitImport(event: React.FormEvent) {
    event.preventDefault()
    setImportBusy(true)
    setImportError(null)
    try {
      const response = await fetch('/api/jobs/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(importForm),
      })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'Could not save the job.')
      }
      setImportOpen(false)
      setImportForm({ title: '', company: '', url: '', location: '', description: '', remote: true })
      window.location.reload()
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not save the job.')
    } finally {
      setImportBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 lg:py-12">
      <div className="mb-8 flex flex-col gap-5 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-stone">Job Intelligence</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Jobs</h1>
          <p className="mt-2 max-w-xl text-sm text-graphite">
            Genuinely available remote roles, matched to verified profile evidence — never invented fit.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>Add job</Button>
          <form onSubmit={submitSearch} className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone" aria-hidden />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, company, skill…"
              className="h-9 w-64 rounded-lg border border-line bg-bone-raised pl-9 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-stone focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
          </form>
          <select
            value={profileId}
            onChange={(event) => {
              const params = new URLSearchParams()
              params.set('view', activeView)
              if (event.target.value) params.set('profileId', event.target.value)
              window.location.href = `/jobs?${params.toString()}`
            }}
            className="h-9 rounded-lg border border-line bg-bone-raised px-3 text-sm text-ink outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            aria-label="Profile"
          >
            {props.profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setShowFilters((value) => !value)}>
          Filters
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={saveFilter}>Save filter</Button>
        {savedFilters.length > 0 && (
          <select
            value=""
            onChange={(event) => {
              if (event.target.value) applySavedFilter(event.target.value)
            }}
            className="h-8 rounded-md border border-line bg-bone-raised px-2 text-xs text-ink outline-none"
            aria-label="Saved filters"
          >
            <option value="">Saved filters…</option>
            {savedFilters.map((row) => (
              <option key={String(row.id)} value={String(row.id)}>{String(row.name)}</option>
            ))}
          </select>
        )}
      </div>

      {showFilters && (
        <form onSubmit={submitFilters} className="mb-6 grid grid-cols-2 gap-3 rounded-2xl border border-line bg-bone-raised p-4 sm:grid-cols-4">
          <label className="block text-[11px] font-medium text-stone">Title<input className={inputClass} value={filters.title ?? ''} onChange={(event) => update('title', event.target.value)} /></label>
          <label className="block text-[11px] font-medium text-stone">Skills<input className={inputClass} value={filters.skills?.join(', ') ?? ''} onChange={(event) => update('skills', event.target.value.split(',').map((s) => s.trim()).filter(Boolean))} placeholder="rails, react" /></label>
          <label className="block text-[11px] font-medium text-stone">Company<input className={inputClass} value={filters.company ?? ''} onChange={(event) => update('company', event.target.value)} /></label>
          <label className="block text-[11px] font-medium text-stone">Location<input className={inputClass} value={filters.location ?? ''} onChange={(event) => update('location', event.target.value)} /></label>
          <label className="block text-[11px] font-medium text-stone">Employment
            <select className={inputClass} value={filters.employmentType ?? ''} onChange={(event) => update('employmentType', event.target.value)}>
              <option value="">Any</option>
              <option value="full-time">Full-time</option>
              <option value="part-time">Part-time</option>
              <option value="contract">Contract</option>
            </select>
          </label>
          <label className="block text-[11px] font-medium text-stone">Seniority
            <select className={inputClass} value={filters.seniority ?? ''} onChange={(event) => update('seniority', event.target.value)}>
              <option value="">Any</option>
              <option value="junior">Junior</option>
              <option value="mid-level">Mid-level</option>
              <option value="senior">Senior</option>
              <option value="lead">Lead</option>
              <option value="principal">Principal</option>
            </select>
          </label>
          <label className="block text-[11px] font-medium text-stone">Min salary<input type="number" className={inputClass} value={filters.minSalary ?? ''} onChange={(event) => update('minSalary', event.target.value === '' ? undefined : Number(event.target.value))} /></label>
          <label className="block text-[11px] font-medium text-stone">Max salary<input type="number" className={inputClass} value={filters.maxSalary ?? ''} onChange={(event) => update('maxSalary', event.target.value === '' ? undefined : Number(event.target.value))} /></label>
          <label className="block text-[11px] font-medium text-stone">Freshness
            <select className={inputClass} value={filters.freshnessDays ?? ''} onChange={(event) => update('freshnessDays', event.target.value === '' ? undefined : Number(event.target.value))}>
              <option value="">Any</option>
              <option value="1">Today</option>
              <option value="3">3 days</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </select>
          </label>
          <label className="block text-[11px] font-medium text-stone">Verification
            <select className={inputClass} value={filters.verificationStatus ?? ''} onChange={(event) => update('verificationStatus', event.target.value)}>
              <option value="">Any</option>
              <option value="verified_open">Verified open</option>
              <option value="recently_seen">Recently seen</option>
              <option value="verification_needed">Verification needed</option>
            </select>
          </label>
          <label className="block text-[11px] font-medium text-stone">Match
            <select className={inputClass} value={filters.matchCategory ?? ''} onChange={(event) => update('matchCategory', event.target.value)}>
              <option value="">Any</option>
              <option value="excellent">Excellent</option>
              <option value="strong">Strong</option>
              <option value="possible">Possible</option>
              <option value="stretch">Stretch</option>
              <option value="not_eligible">Not eligible</option>
              <option value="requires_verification">Requires verification</option>
            </select>
          </label>
          <label className="block text-[11px] font-medium text-stone">Sort
            <select className={inputClass} value={filters.sort ?? ''} onChange={(event) => update('sort', event.target.value === '' ? undefined : event.target.value as JobFilters['sort'])}>
              <option value="">Default</option>
              <option value="posted_desc">Newest</option>
              <option value="posted_asc">Oldest</option>
              <option value="match_desc">Best match</option>
              <option value="freshness_desc">Recently refreshed</option>
              <option value="salary_desc">Highest salary</option>
            </select>
          </label>
          <div className="col-span-full flex justify-end gap-2">
            <button
              type="submit"
              onClick={() => pushFilters(filters)}
              className="inline-flex h-8 items-center justify-center rounded-md bg-orange px-3 text-[0.8rem] font-medium text-on-orange transition-colors hover:bg-orange-dark"
            >
              Apply filters
            </button>
          </div>
        </form>
      )}

      <div className="mb-6 overflow-x-auto">
        <nav aria-label="Job views" className="flex min-w-max items-center gap-0.5 rounded-xl bg-bone-raised p-1 ring-1 ring-line">
          {props.views.filter((view) => props.isAdmin || view !== 'sources').map((view) => (
            <Link
              key={view}
              href={(() => {
                const params = new URLSearchParams()
                params.set('view', view)
                if (profileId) params.set('profileId', profileId)
                if (view === activeView && props.search) params.set('search', props.search)
                return `/jobs?${params.toString()}`
              })()}
              aria-current={activeView === view ? 'page' : undefined}
              className={cn(
                'rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
                activeView === view ? 'bg-bone text-ink shadow-sm ring-1 ring-line' : 'text-graphite hover:text-ink',
              )}
            >
              {VIEW_LABELS[view]}
            </Link>
          ))}
        </nav>
      </div>

      {activeView === 'prepared' ? (
        <PreparedView prepared={props.prepared} />
      ) : activeView === 'applications' ? (
        <ApplicationsView applications={props.applications} />
      ) : activeView === 'documents' ? (
        <DocumentsView documents={props.documents} profileId={profileId} />
      ) : activeView === 'sources' && props.isAdmin ? (
        <SourcesView sources={props.sources} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {props.jobs.map((job) => (
            <JobCardView key={job.id} job={job} profileId={profileId} busy={busyId === job.id} onSave={() => toggleSave(job)} />
          ))}
          {props.jobs.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-line bg-bone-raised/50 p-10 text-center">
              <Briefcase className="mx-auto mb-3 size-5 text-stone" aria-hidden />
              <p className="text-sm font-medium text-ink">No jobs in this view yet.</p>
              <p className="mt-1 text-xs text-graphite">Run discovery, or widen the view. Saved jobs persist across refreshes.</p>
            </div>
          )}
        </div>
      )}

      {activeView !== 'applications' && activeView !== 'documents' && activeView !== 'sources' && props.hasMore && (
        <div className="mt-6 text-center">
          <Link href={`${basePath}&offset=${props.offset + props.limit}`} className="text-sm font-medium text-orange-ink hover:underline">
            Load more jobs
          </Link>
        </div>
      )}

      <dialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        className="rounded-2xl border border-line bg-bone-raised p-0 shadow-2xl backdrop:bg-ink/40"
      >
        <form onSubmit={submitImport} className="w-[min(560px,92vw)] p-6">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-stone">Manual import</p>
          <h2 className="mb-4 text-lg font-semibold text-ink">Add a job you found</h2>
          <p className="mb-4 text-xs text-graphite">
            Paste a posting you can already see. Relay stores it as <strong>verification needed</strong>; it never scrapes LinkedIn or claims the job is verified.
          </p>
          <div className="space-y-3">
            <label className="block text-xs font-medium text-stone">Title<input required value={importForm.title} onChange={(e) => setImportForm({ ...importForm, title: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-line bg-bone px-2 text-sm text-ink outline-none" /></label>
            <label className="block text-xs font-medium text-stone">Company<input value={importForm.company} onChange={(e) => setImportForm({ ...importForm, company: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-line bg-bone px-2 text-sm text-ink outline-none" /></label>
            <label className="block text-xs font-medium text-stone">Posting URL<input value={importForm.url} onChange={(e) => setImportForm({ ...importForm, url: e.target.value })} placeholder="https://…" className="mt-1 h-9 w-full rounded-md border border-line bg-bone px-2 text-sm text-ink outline-none" /></label>
            <label className="block text-xs font-medium text-stone">Location<input value={importForm.location} onChange={(e) => setImportForm({ ...importForm, location: e.target.value })} placeholder="Remote, Berlin, US only…" className="mt-1 h-9 w-full rounded-md border border-line bg-bone px-2 text-sm text-ink outline-none" /></label>
            <label className="block text-xs font-medium text-stone">Description<textarea required rows={6} value={importForm.description} onChange={(e) => setImportForm({ ...importForm, description: e.target.value })} className="mt-1 w-full rounded-md border border-line bg-bone px-2 py-2 text-sm text-ink outline-none" /></label>
            <label className="flex items-center gap-2 text-xs text-graphite"><input type="checkbox" checked={importForm.remote} onChange={(e) => setImportForm({ ...importForm, remote: e.target.checked })} /> Remote role</label>
          </div>
          {importError && <p className="mt-3 rounded-lg bg-status-danger/10 px-3 py-2 text-xs text-status-danger">{importError}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button type="submit" variant="orange" disabled={importBusy}>{importBusy ? 'Saving…' : 'Save job'}</Button>
          </div>
        </form>
      </dialog>
    </div>
  )
}

function RelativeTime({ value }: { value: string | null }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return <>{relative(value, now)}</>
}

function JobCardView({ job, profileId, busy, onSave }: { job: JobCard; profileId: string; busy: boolean; onSave: () => void }) {
  const eligibility = eligibilityLabel(job)
  const verification = verificationLabel(job.verificationStatus)
  const salary = salaryLabel(job)
  return (
    <article className="group flex flex-col rounded-2xl border border-line bg-bone-raised p-4 shadow-[0_1px_2px_rgba(28,28,26,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-12px_rgba(28,28,26,0.18)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {job.companyLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={job.companyLogo} alt="" className="size-8 shrink-0 rounded-lg border border-line object-contain" />
          ) : (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-bone text-stone ring-1 ring-line">
              <Briefcase className="size-4" aria-hidden />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-graphite">{job.company ?? 'Unknown company'}</p>
            <p className="flex items-center gap-1 text-[11px] text-stone">
              <MapPin className="size-3" aria-hidden />
              <span className="truncate">{job.locationRaw ?? (job.remote ? 'Remote' : 'Onsite')}</span>
            </p>
          </div>
        </div>
        <Badge variant={verification.tone} className="shrink-0">{verification.text}</Badge>
      </div>

      <h3 className="mb-2 text-[15px] font-semibold leading-snug text-ink">
        <Link href={`/jobs/${job.id}?profileId=${profileId}`} className="transition-colors hover:text-orange-ink">
          {job.title}
        </Link>
      </h3>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Badge variant={eligibility.tone}>{eligibility.text}</Badge>
        {job.match && (
          <Badge variant={job.match.category === 'not_eligible' ? 'destructive' : job.match.category === 'requires_verification' ? 'warning' : 'cobalt'}>
            {CATEGORY_LABEL[job.match.category] ?? job.match.category}
          </Badge>
        )}
        {job.saved && <Badge variant="orange"><Bookmark className="size-3" aria-hidden /> Saved</Badge>}
      </div>

      {job.match && (
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-[11px] text-stone">
            <span>Fit (heuristic)</span>
            <span className="tabular-nums">{job.match.score}/100</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className={cn('h-full rounded-full transition-all duration-500', job.match.score >= 65 ? 'bg-status-success' : job.match.score >= 45 ? 'bg-status-warning' : 'bg-status-danger')}
              style={{ width: `${job.match.score}%` }}
            />
          </div>
        </div>
      )}

      {job.skills.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {job.skills.slice(0, 5).map((skill) => (
            <span key={skill} className="rounded-md bg-bone px-1.5 py-0.5 text-[10px] font-medium text-graphite ring-1 ring-line">
              {skill}
            </span>
          ))}
          {job.skills.length > 5 && <span className="text-[10px] text-stone">+{job.skills.length - 5}</span>}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2 text-[11px] text-stone">
        <span className="flex items-center gap-1"><Clock className="size-3" aria-hidden /> Posted <RelativeTime value={job.postedAt} /></span>
        <span className="flex items-center gap-1"><ShieldCheck className="size-3" aria-hidden /> Checked <RelativeTime value={job.lastVerifiedAt ?? job.lastSeenAt} /></span>
        <span className="col-span-2">First seen {formatDate(job.firstSeenAt)} · last seen <RelativeTime value={job.lastSeenAt} /></span>
        {salary && <span className="col-span-2 text-graphite">{salary}</span>}
      </div>

      <div className="mt-auto flex items-center gap-2">
        <Button size="sm" variant="orange" className="flex-1" disabled={!isSafeApplicationUrl(job.applyUrl ?? job.sourceUrl)} onClick={() => window.open(job.applyUrl ?? job.sourceUrl ?? '#', '_blank', 'noopener,noreferrer')}>
          <ExternalLink className="size-3.5" aria-hidden /> Apply
        </Button>
        <Button size="sm" variant="outline" onClick={onSave} disabled={busy} aria-pressed={job.saved}>
          <Bookmark className={cn('size-3.5', job.saved && 'fill-current')} aria-hidden />
          {job.saved ? 'Saved' : 'Save'}
        </Button>
        <Link
          href={`/jobs/${job.id}?profileId=${profileId}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-bone-raised px-3 text-[0.8rem] font-medium text-ink transition-colors hover:bg-line"
        >
          <Sparkles className="size-3.5" aria-hidden /> Tailor CV
        </Link>
      </div>
    </article>
  )
}

function ApplicationsView({ applications }: { applications: Array<Record<string, unknown>> }) {
  if (applications.length === 0) {
    return <EmptyState icon={FileText} title="No applications yet" body="Save a job, tailor your CV, then record the real outcome." />
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-bone-raised">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-[11px] uppercase tracking-wide text-stone">
          <tr>
            <th className="px-4 py-3 font-medium">Job</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Method</th>
            <th className="px-4 py-3 font-medium">Updated</th>
            <th className="px-4 py-3 font-medium">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {applications.map((row) => (
            <tr key={String(row.id)} className="border-b border-line/60 last:border-0">
              <td className="px-4 py-3">
                <Link href={`/jobs/${row.job_id}?profileId=${row.profile_id}`} className="font-medium text-ink hover:text-orange-ink">
                  {String(row.job_title ?? 'Job')}
                </Link>
                <p className="text-xs text-stone">{String(row.job_company ?? '')}</p>
              </td>
              <td className="px-4 py-3"><StatusBadge status={String(row.status)} /></td>
              <td className="px-4 py-3 text-graphite">{String(row.method)}</td>
              <td className="px-4 py-3 text-graphite">{relative(String(row.updated_at ?? ''))}</td>
              <td className="px-4 py-3 text-graphite">{row.submitted_at ? `Submitted ${relative(String(row.submitted_at))}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === 'hired' || status === 'offer' ? 'success' : status === 'rejected' || status === 'withdrawn' ? 'destructive' : status === 'interview' ? 'cobalt' : 'secondary'
  return <Badge variant={tone}>{status.replace('_', ' ')}</Badge>
}

function PreparedView({ prepared }: { prepared: PreparedCard[] }) {
  if (prepared.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-bone-raised/50 p-10 text-center">
        <FileText className="mx-auto mb-3 size-5 text-stone" aria-hidden />
        <p className="text-sm font-medium text-ink">No prepared applications yet.</p>
        <p className="mt-1 text-xs text-graphite">
          When a verified, Pakistan-eligible, high-fit job appears, Relay prepares a tailored CV and cover letter here.
        </p>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {prepared.map((item) => (
        <Link
          key={item.id}
          href={`/jobs/${item.jobId}?profileId=${item.profileId}&view=prepared`}
          className="rounded-2xl border border-line bg-bone-raised p-4 transition-colors hover:ring-1 hover:ring-line"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-ink">{item.title}</p>
              <p className="text-xs text-graphite">{item.company ?? 'Company'}</p>
            </div>
            <Badge variant={item.status === 'ready' ? 'success' : 'outline'}>{item.status}</Badge>
          </div>
          <div className="mb-2 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-bone p-1.5 ring-1 ring-line">
              <p className="text-[9px] uppercase tracking-wide text-stone">Match</p>
              <p className="text-xs font-semibold text-ink">{item.matchScore ?? '—'}</p>
            </div>
            <div className="rounded-lg bg-bone p-1.5 ring-1 ring-line">
              <p className="text-[9px] uppercase tracking-wide text-stone">Document</p>
              <p className="text-xs font-semibold text-ink">{item.documentQuality ?? '—'}</p>
            </div>
            <div className="rounded-lg bg-bone p-1.5 ring-1 ring-line">
              <p className="text-[9px] uppercase tracking-wide text-stone">Readiness</p>
              <p className="text-xs font-semibold text-ink">{item.readiness ?? '—'}</p>
            </div>
          </div>
          <p className="text-[10px] text-stone">Prepared <RelativeTime value={item.createdAt} /> · review the CV, then open the official application.</p>
        </Link>
      ))}
    </div>
  )
}

function DocumentsView({ documents, profileId }: { documents: Array<Record<string, unknown>>; profileId: string }) {
  if (documents.length === 0) {
    return <EmptyState icon={FileText} title="No documents yet" body="Open a job and choose Tailor CV to generate a truthful, ATS-safe package." />
  }
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {documents.map((row) => (
        <div key={String(row.id)} className="rounded-2xl border border-line bg-bone-raised p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-ink">{String(row.kind).replace('_', ' ')}</p>
            <span className="text-[11px] text-stone">v{String(row.version)}</span>
          </div>
          <p className="mb-3 line-clamp-2 text-xs text-graphite">{String(row.text ?? '').slice(0, 180)}</p>
          <div className="flex gap-2">
            <a href={`/api/jobs/${row.job_id}/documents/${row.kind}?profileId=${profileId}&format=pdf`} className="text-xs font-medium text-orange-ink hover:underline">PDF</a>
            <a href={`/api/jobs/${row.job_id}/documents/${row.kind}?profileId=${profileId}&format=docx`} className="text-xs font-medium text-orange-ink hover:underline">DOCX</a>
            <a href={`/api/jobs/${row.job_id}/documents/${row.kind}?profileId=${profileId}&format=txt`} className="text-xs font-medium text-orange-ink hover:underline">TXT</a>
          </div>
        </div>
      ))}
    </div>
  )
}

function SourcesView({ sources }: { sources: Array<Record<string, unknown>> }) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function updateSource(id: string, patch: { enabled?: boolean; config?: Record<string, unknown> }) {
    setBusyId(id)
    setNotice(null)
    try {
      const response = await fetch('/api/jobs/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      })
      if (!response.ok) throw new Error('Save failed')
      setNotice('Source updated.')
    } catch {
      setNotice('Could not update the source.')
    } finally {
      setBusyId(null)
    }
  }

  async function refreshSource(id: string) {
    setBusyId(id)
    setNotice(null)
    try {
      const response = await fetch('/api/jobs/sources/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceIds: [id] }),
      })
      const data = (await response.json()) as { ok: boolean; summaries?: Array<Record<string, unknown>> }
      setNotice(data.ok ? `Refreshed ${data.summaries?.length ?? 0} source(s).` : 'Refresh skipped (worker busy).')
    } catch {
      setNotice('Refresh failed.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-3">
      {notice && <p className="rounded-lg bg-bone px-3 py-2 text-xs text-graphite ring-1 ring-line">{notice}</p>}
      <div className="overflow-hidden rounded-2xl border border-line bg-bone-raised">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-wide text-stone">
            <tr>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Jobs</th>
              <th className="px-4 py-3 font-medium">Last run</th>
              <th className="px-4 py-3 font-medium">Failures</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((row) => {
              const config = (row.config ?? {}) as Record<string, unknown>
              const isAts = String(row.kind) === 'ats'
              return (
                <tr key={String(row.id)} className="border-b border-line/60 align-top last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{String(row.name)}</p>
                    <p className="text-xs text-stone">{String(row.kind)} · every {Math.round(Number(row.interval_secs) / 60)}m</p>
                    {isAts && (
                      <div className="mt-2 flex flex-col gap-1">
                        <input
                          defaultValue={String(config.slug ?? '')}
                          placeholder="board slug"
                          id={`slug-${String(row.id)}`}
                          className="h-7 w-40 rounded-md border border-line bg-bone px-2 text-[11px] text-ink outline-none"
                        />
                        <input
                          defaultValue={String(config.company ?? '')}
                          placeholder="company"
                          id={`company-${String(row.id)}`}
                          className="h-7 w-40 rounded-md border border-line bg-bone px-2 text-[11px] text-ink outline-none"
                        />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <label className="flex items-center gap-2 text-xs text-graphite">
                      <input
                        type="checkbox"
                        checked={Boolean(row.enabled)}
                        onChange={(event) => updateSource(String(row.id), { enabled: event.target.checked })}
                      />
                      {row.enabled ? 'enabled' : 'disabled'}
                    </label>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-graphite">{Number(row.jobCount ?? 0)}</td>
                  <td className="px-4 py-3 text-graphite"><RelativeTime value={String(row.last_run_at ?? '')} /></td>
                  <td className="px-4 py-3 text-graphite">{Number(row.consecutive_failures ?? 0)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={busyId === String(row.id)}
                        onClick={() => {
                          const slug = (document.getElementById(`slug-${String(row.id)}`) as HTMLInputElement | null)?.value ?? ''
                          const company = (document.getElementById(`company-${String(row.id)}`) as HTMLInputElement | null)?.value ?? ''
                          updateSource(String(row.id), { config: { ...config, slug, company } })
                        }}
                      >
                        Save
                      </Button>
                      <Button size="xs" variant="secondary" disabled={busyId === String(row.id)} onClick={() => refreshSource(String(row.id))}>
                        Refresh
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EmptyState({ icon: Icon, title, body }: { icon: typeof Briefcase; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-bone-raised/50 p-10 text-center">
      <Icon className="mx-auto mb-3 size-5 text-stone" aria-hidden />
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 text-xs text-graphite">{body}</p>
    </div>
  )
}
