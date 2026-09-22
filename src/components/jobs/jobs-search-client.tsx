'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  Search,
  MapPin,
  Building2,
  DollarSign,
  ExternalLink,
  X,
  Loader2,
  Clock,
  Globe,
  Briefcase,
  Sparkles,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  SlidersHorizontal,
  Info,
  Star,
  Upload,
  FileText,
  UserRound,
  RefreshCw,
  ListFilter,
  CalendarDays,
} from 'lucide-react'
import { cn } from 'cn'
import type { JobSearchResponse, JobWithMatch, ProviderStatus, SalaryInfo, SalaryPeriod, SourceHealth } from '@/lib/jobs/types'

type StatusStyle = { dot: string; label: string; style: 'ok' | 'warn' | 'muted' }

const STATUS_STYLE: Record<ProviderStatus, StatusStyle> = {
  success: { dot: 'bg-status-success', label: 'Live', style: 'ok' },
  not_configured: { dot: 'bg-stone/40', label: 'Not configured', style: 'muted' },
  failed: { dot: 'bg-slate', label: 'Failed', style: 'warn' },
  rate_limited: { dot: 'bg-status-warning', label: 'Rate limited', style: 'warn' },
  unauthorized: { dot: 'bg-status-warning', label: 'Needs API key', style: 'warn' },
  timeout: { dot: 'bg-status-warning', label: 'Timed out', style: 'warn' },
  unavailable: { dot: 'bg-slate', label: 'Unavailable', style: 'warn' },
  invalid_response: { dot: 'bg-slate', label: 'Bad response', style: 'warn' },
}

const SOURCE_NAMES: Record<string, string> = {
  himalayas: 'Himalayas',
  remoteok: 'RemoteOK',
  jobicy: 'Jobicy',
  remotive: 'Remotive',
  arbeitnow: 'Arbeitnow',
  adzuna: 'Adzuna',
  themuse: 'The Muse',
  usajobs: 'USAJOBS',
}

type SavedProfile = { id: string; label: string | null; headline: string | null; platform: string | null }

interface ParsedProfile {
  role: string
  seniority?: string
  skills: string[]
  company?: string
  summary?: string
  label: string
  viaUpload: boolean
  profileId?: string
}

type WorkPref = 'remote' | 'remote_hybrid' | 'onsite' | 'any'
type Stage = 'cv' | 'prefs' | 'results'

export function JobsSearchExperience() {
  const [stage, setStage] = useState<Stage>('cv')
  const [profile, setProfile] = useState<ParsedProfile | null>(null)
  const [savedProfiles, setSavedProfiles] = useState<SavedProfile[]>([])

  const [roleInput, setRoleInput] = useState('')
  const [location, setLocation] = useState('')
  const [minimumSalary, setMinimumSalary] = useState<number | undefined>(undefined)
  const [salaryCurrency, setSalaryCurrency] = useState('USD')
  const [workPref, setWorkPref] = useState<WorkPref>('remote')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [minScore, setMinScore] = useState(0)

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<JobSearchResponse | null>(null)
  const [selected, setSelected] = useState<JobWithMatch | null>(null)
  const [revealCount, setRevealCount] = useState(20)
  const [sort, setSort] = useState<'match' | 'newest' | 'salary'>('match')
  const [hiddenSources, setHiddenSources] = useState<Set<string>>(new Set())
  const [ageFilter, setAgeFilter] = useState<'any' | 'week' | 'month' | 'older'>('any')
  const [elapsed, setElapsed] = useState(0)
  const [searchCompletedAt, setSearchCompletedAt] = useState(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!loading) return
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [loading])

  useEffect(() => {
    fetch('/api/profiles')
      .then((res) => (res.ok ? (res.json() as Promise<{ profiles?: SavedProfile[] }>) : Promise.resolve({ profiles: [] })))
      .then((data) => setSavedProfiles(data.profiles ?? []))
      .catch(() => setSavedProfiles([]))
  }, [])

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/jobs/cv', { method: 'POST', body: fd })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error ?? `CV upload failed (${res.status})`)
      }
      const data = (await res.json()) as { cv: { role: string; seniority?: string; skills: string[]; company?: string; summary?: string }; parsed: { label: string } }
      setProfile({
        role: data.cv.role,
        seniority: data.cv.seniority,
        skills: data.cv.skills ?? [],
        company: data.cv.company,
        summary: data.cv.summary,
        label: data.parsed.label,
        viaUpload: true,
      })
      setRoleInput(data.cv.role)
      setStage('prefs')
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not read the CV.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [])

  const selectSavedProfile = useCallback((saved: SavedProfile) => {
    const role = saved.headline ?? saved.label ?? 'Professional'
    setProfile({
      role,
      label: saved.label ?? saved.headline ?? role,
      skills: [],
      viaUpload: false,
      profileId: saved.id,
    })
    setRoleInput(role.split(' at ')[0] ?? role)
    setStage('prefs')
  }, [])

  const runSearch = useCallback(async () => {
    const body: Record<string, unknown> = {
      role: roleInput.trim() || undefined,
      location: location.trim() || undefined,
      minimumSalary: minimumSalary ?? undefined,
      salaryCurrency,
      remote: workPref === 'remote' || workPref === 'remote_hybrid',
      hybrid: workPref === 'remote_hybrid',
      onsite: workPref === 'onsite',
    }
    if (profile?.viaUpload) {
      body.cv = {
        role: profile.role,
        seniority: profile.seniority,
        skills: profile.skills,
        company: profile.company,
        summary: profile.summary,
      }
    } else if (profile?.profileId) {
      body.profileId = profile.profileId
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setElapsed(0)
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/jobs/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error ?? `Search failed (${res.status})`)
      }
      const data = (await res.json()) as JobSearchResponse
      setResult(data)
      setSearchCompletedAt(Date.now())
      setSelected(null)
      setRevealCount(20)
      setSort('match')
      setHiddenSources(new Set())
      setAgeFilter('any')
      setStage('results')
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Search failed.')
    } finally {
      setLoading(false)
    }
  }, [roleInput, location, minimumSalary, salaryCurrency, workPref, profile])

  const resetToCv = useCallback(() => {
    abortRef.current?.abort()
    setProfile(null)
    setResult(null)
    setError(null)
    setSelected(null)
    setUploadError(null)
    setRoleInput('')
    setStage('cv')
  }, [])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const displayName = useMemo(() => {
    const raw = (profile?.label ?? '').split(',')[0]?.trim()
    if (raw && raw !== 'Browse all roles') return raw
    return profile?.viaUpload ? 'your CV' : 'this search'
  }, [profile])

  const resultHeader = useMemo(() => {
    if (profile?.viaUpload) return 'Best matches for your CV'
    const name = (profile?.label ?? '').split(',')[0]?.trim()
    if (name && name !== 'Browse all roles') return `${name}’s profile`
    return `Best matches for ${(profile?.role ?? '').trim() || 'you'}`
  }, [profile])

  const filteredJobs = useMemo(() => {
    if (!result) return []
    const jobs = result.jobs
    const now = searchCompletedAt
    return jobs.filter((job) => {
      if (job.match.score < minScore) return false
      if (hiddenSources.has(job.source)) return false
      if (ageFilter !== 'any' && job.postedAt) {
        const ageDays = (now - Date.parse(job.postedAt)) / 86_400_000
        if (ageFilter === 'week' && ageDays > 7) return false
        if (ageFilter === 'month' && ageDays > 30) return false
        if (ageFilter === 'older' && ageDays < 30) return false
      }
      return true
    })
  }, [result, minScore, hiddenSources, ageFilter, searchCompletedAt])

  const visibleJobs = useMemo(() => {
    const sorted = [...filteredJobs]
    if (sort === 'newest') sorted.sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''))
    if (sort === 'salary') sorted.sort((a, b) => (b.salary?.min ?? 0) - (a.salary?.min ?? 0))
    return sorted.slice(0, revealCount)
  }, [filteredJobs, sort, revealCount])

  const activeSources = useMemo(
    () => Object.entries(result?.sources ?? {}).filter(([, health]) => health.status === 'success' && (health.raw ?? health.count) > 0).map(([source]) => source),
    [result],
  )

  const sourceChips = useMemo(() => Object.entries(result?.sources ?? {}) as Array<[string, SourceHealth]>, [result])

  return (
    <div className="space-y-5">
      <input ref={fileInputRef} type="file" accept=".pdf,.txt,text/plain,application/pdf" className="hidden" onChange={(e) => void handleFile(e.target.files?.[0])} />
      {stage !== 'results' && (
        <CvOrPrefsStage
          stage={stage}
          profile={profile}
          savedProfiles={savedProfiles}
          role={roleInput}
          location={location}
          minimumSalary={minimumSalary}
          salaryCurrency={salaryCurrency}
          workPref={workPref}
          advancedOpen={advancedOpen}
          minScore={minScore}
          uploading={uploading}
          uploadError={uploadError}
          loading={loading}
          fileInputRef={fileInputRef}
          onSelectSaved={selectSavedProfile}
          onBrowseAll={() => {
            setProfile({ role: 'software engineer', label: 'Browse all roles', skills: [], viaUpload: false })
            setRoleInput('software engineer')
            setStage('prefs')
          }}
          onRoleChange={setRoleInput}
          onLocationChange={setLocation}
          onMinSalaryChange={setMinimumSalary}
          onCurrencyChange={setSalaryCurrency}
          onWorkPrefChange={setWorkPref}
          onToggleAdvanced={() => setAdvancedOpen((open) => !open)}
          onMinScoreChange={setMinScore}
          onSubmit={(e) => {
            e.preventDefault()
            void runSearch()
          }}
        />
      )}

      {/* Results header */}
      {result && stage === 'results' && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-orange/10 text-orange" aria-hidden="true">
              <Sparkles className="size-4" />
            </div>
            <div>
              <h2 className="text-lg font-medium tracking-[-0.01em] text-ink">{resultHeader}</h2>
              <p className="text-xs text-slate">
                <strong className="font-medium text-ink">{result.meta.afterFilters.toLocaleString()}</strong> roles found · showing the top{' '}
                {result.jobs.length}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary strip */}
      {result && stage === 'results' && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-slate">
          <span className="text-ink">{result.jobs.length} ranked</span>
          <span className="text-line">·</span>
          <span>{result.meta.afterFilters.toLocaleString()} after filters</span>
          <span className="text-line">·</span>
          <span>{result.meta.afterDedupe.toLocaleString()} after dedupe</span>
          <span className="text-line">·</span>
          <span>{result.meta.totalRaw.toLocaleString()} raw listings</span>
          {result.meta.dedupeRemoved > 0 && (
            <>
              <span className="text-line">·</span>
              <span>{result.meta.dedupeRemoved.toLocaleString()} duplicates removed</span>
            </>
          )}
          <span className="text-line">·</span>
          <span>{result.meta.elapsedMs}ms</span>
          {result.meta.aiMatchingUsed && (
            <>
              <span className="text-line">·</span>
              <span className="inline-flex items-center gap-1 text-status-success">
                <Sparkles className="size-3" aria-hidden="true" />
                AI-ranked
              </span>
            </>
          )}
          {result.meta.mock && (
            <>
              <span className="text-line">·</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-status-warning/10 px-2 py-0.5 font-medium text-status-warning">
                <Info className="size-3" aria-hidden="true" />
                Mock data
              </span>
            </>
          )}
        </div>
      )}

      {/* Queries used */}
      {result && result.meta.queriesUsed.length > 0 && stage === 'results' && (
        <div className="flex flex-wrap items-center gap-1.5 px-1 text-xs text-slate">
          <span className="text-stone">Searched for:</span>
          {result.meta.queriesUsed.map((q) => (
            <span key={q} className="rounded-full border border-line bg-paper px-2 py-0.5 text-[11px] text-graphite">
              {q}
            </span>
          ))}
        </div>
      )}

      {result && stage === 'results' && filteredJobs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <label className="inline-flex items-center gap-1.5 rounded-md border border-line bg-paper px-2.5 py-1.5 text-xs text-slate">
            <ListFilter className="size-3.5 text-stone" aria-hidden="true" />
            <span className="sr-only">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as 'match' | 'newest' | 'salary')}
              className="bg-transparent text-sm font-medium text-ink outline-none"
            >
              <option value="match">Best match</option>
              <option value="newest">Newest first</option>
              <option value="salary">Salary (high to low)</option>
            </select>
          </label>

          <span className="inline-flex items-center gap-1 rounded-md border border-line bg-paper px-2.5 py-1.5 text-xs text-slate">
            <CalendarDays className="size-3.5 text-stone" aria-hidden="true" />
            <select
              value={ageFilter}
              onChange={(e) => setAgeFilter(e.target.value as 'any' | 'week' | 'month' | 'older')}
              className="bg-transparent text-sm font-medium text-ink outline-none"
            >
              <option value="any">Any age</option>
              <option value="week">Posted this week</option>
              <option value="month">Posted this month</option>
              <option value="older">Posted 30+ days ago</option>
            </select>
          </span>

          {activeSources.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setHiddenSources((prev) => (prev.size === 0 ? new Set(activeSources) : new Set()))
                }
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  hiddenSources.size === 0 ? 'border-orange/50 bg-orange/10 text-orange-light' : 'border-line text-slate hover:border-orange/30',
                )}
              >
                All
              </button>
              {activeSources.map((source) => {
                const hidden = hiddenSources.has(source)
                return (
                  <button
                    key={source}
                    type="button"
                    onClick={() =>
                      setHiddenSources((prev) => {
                        const next = new Set(prev)
                        if (next.has(source)) next.delete(source)
                        else next.add(source)
                        return next
                      })
                    }
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                      !hidden ? 'border-line text-graphite hover:border-orange/30' : 'border-line text-slate opacity-50 line-through',
                    )}
                  >
                    {SOURCE_NAMES[source] ?? source}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {error && stage === 'results' && (
        <div className="flex items-center gap-2.5 rounded-xl border border-status-warning/30 bg-status-warning/10 px-4 py-3 text-sm text-status-warning">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {loading && !result ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2 px-1 text-xs text-slate">
            <Loader2 className="size-3.5 animate-spin text-orange" aria-hidden="true" />
            Searching 8 job sources — {elapsed}s elapsed
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="rounded-2xl border border-line bg-paper p-5">
                <div className="h-4 w-3/4 rounded bg-bone" />
                <div className="mt-2 h-3 w-1/2 rounded bg-bone" />
                <div className="mt-4 space-y-2">
                  <div className="h-2.5 w-full rounded bg-bone" />
                  <div className="h-2.5 w-5/6 rounded bg-bone" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : result && stage === 'results' && visibleJobs.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-line bg-paper/50 p-10 text-center">
          <div className="mx-auto max-w-sm space-y-2">
            <Briefcase className="mx-auto size-6 text-stone" aria-hidden="true" />
            <p className="text-sm font-medium text-ink">No roles passed the filters.</p>
            <p className="text-sm text-slate">Try widening the location, lowering the salary floor, or clearing the match-score slider.</p>
          </div>
        </section>
      ) : result && stage === 'results' ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleJobs.map((job) => (
            <button
              key={job.id}
              type="button"
              onClick={() => setSelected(job)}
              className="group flex flex-col rounded-2xl border border-line bg-paper p-5 text-left transition-all hover:border-orange/40 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink transition-colors group-hover:text-orange">{job.title}</p>
                  <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-slate">
                    <Building2 className="size-3 shrink-0" aria-hidden="true" />
                    {job.company}
                  </p>
                </div>
                <div
                  className={cn(
                    'flex shrink-0 flex-col items-center gap-0.5 rounded-full px-2.5 py-1',
                    job.match.score >= 85
                      ? 'bg-status-success/10 text-status-success'
                      : job.match.score >= 70
                        ? 'bg-orange/10 text-orange-light'
                        : 'bg-bone text-stone',
                  )}
                  title={`${job.match.score}% match for ${displayName}`}
                >
                  <span className="flex items-center gap-1 font-mono text-xs font-semibold">
                    <Star className="size-3" aria-hidden="true" />
                    {job.match.score}%
                  </span>
                  <span className="text-[8px] font-semibold uppercase tracking-[0.08em] opacity-70">
                    match · {displayName}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate">
                {job.remote && (
                  <span className="inline-flex items-center gap-1 text-status-success">
                    <Globe className="size-3" aria-hidden="true" /> Remote
                  </span>
                )}
                {job.hybrid && (
                  <span className="inline-flex items-center gap-1 text-orange-light">
                    <Globe className="size-3" aria-hidden="true" /> Hybrid
                  </span>
                )}
                {!job.remote && !job.hybrid && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3" aria-hidden="true" /> {job.location || 'Onsite'}
                  </span>
                )}
                {job.salary?.min ? (
                  <span className="inline-flex items-center gap-1 font-medium text-ink">
                    <DollarSign className="size-3" aria-hidden="true" />
                    {displaySalary(job.salary)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-stone">
                    <DollarSign className="size-3" aria-hidden="true" />
                    Salary not listed
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" aria-hidden="true" />
                  {ageLabel(job.postedAt)}
                </span>
              </div>

              <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-slate">{job.match.summary}</p>

              {Array.isArray(job.match.matchedSkills) && job.match.matchedSkills.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {job.match.matchedSkills.slice(0, 4).map((skill) => (
                    <span key={skill} className="rounded-full bg-orange/10 px-2 py-0.5 text-[11px] font-medium text-orange-light">
                      {skill}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs">
                <span className="inline-flex items-center gap-1.5 text-stone">
                  <span className="size-1.5 rounded-full bg-status-success" aria-hidden="true" />
                  {SOURCE_NAMES[job.source] ?? job.source}
                  {Array.isArray(job.alsoListedOn) && job.alsoListedOn.length > 0 && <span className="text-slate">+{job.alsoListedOn.length}</span>}
                </span>
                <span className="inline-flex items-center gap-0.5 font-medium text-graphite transition-colors group-hover:text-orange">
                  Details <ArrowUpRight className="size-3" aria-hidden="true" />
                </span>
              </div>
            </button>
          ))}
        </section>
      ) : null}

      {result && stage === 'results' && filteredJobs.length > revealCount && (
        <div className="flex items-center justify-center gap-3 px-1">
          <button
            type="button"
            onClick={() => setRevealCount((n) => n + 20)}
            className="inline-flex items-center gap-2 rounded-md border border-line bg-paper px-4 py-2 text-sm font-medium text-graphite transition-colors hover:bg-bone"
          >
            Show {Math.min(20, filteredJobs.length - revealCount)} more
            <span className="text-stone">({filteredJobs.length - revealCount} remaining)</span>
          </button>
        </div>
      )}

      {/* Results toolbar */}
      {result && stage === 'results' && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <button
            type="button"
            onClick={() => setStage('prefs')}
            className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-medium text-graphite transition-colors hover:bg-bone"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Tune & re-run
          </button>
          <button
            type="button"
            onClick={resetToCv}
            className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-medium text-graphite transition-colors hover:bg-bone"
          >
            <FileText className="size-4" aria-hidden="true" />
            Different CV
          </button>
        </div>
      )}

      {/* Provider health */}
      {result && stage === 'results' && (
        <section className="overflow-hidden rounded-2xl border border-line bg-paper">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Source health</p>
            <span className="text-xs text-slate">
              {Object.values(result.sources).filter((s) => s.status === 'success').length}/{Object.keys(result.sources).length} sources live
            </span>
          </div>
          <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
            {sourceChips.map(([source, health]) => {
              const style = STATUS_STYLE[health.status] ?? STATUS_STYLE.failed
              const name = SOURCE_NAMES[source] ?? source
              return (
                <div key={source} className="bg-paper px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-ink">{name}</span>
                    <span className={cn('inline-flex items-center gap-1.5 text-xs', style.style === 'ok' ? 'text-status-success' : style.style === 'warn' ? 'text-status-warning' : 'text-stone')}>
                      <span className={cn('size-1.5 rounded-full', style.dot)} aria-hidden="true" />
                      {style.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate">
                    {health.status === 'success'
                      ? `Fetched ${(health.raw ?? health.count).toLocaleString()} · kept ${(health.filtered ?? 0).toLocaleString()}${health.pages && health.pages > 1 ? ` · ${health.pages} pages` : ''}${health.mock ? ' (mock)' : ''}`
                      : health.status === 'not_configured'
                        ? 'Add API key to activate'
                        : `Fetched ${(health.raw ?? 0).toLocaleString()} before ${health.errorKind ?? health.status}`}
                  </p>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Detail drawer */}
      {selected && stage === 'results' && <JobDetailPanel job={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

interface CvOrPrefsProps {
  stage: Stage
  profile: ParsedProfile | null
  savedProfiles: SavedProfile[]
  role: string
  location: string
  minimumSalary: number | undefined
  salaryCurrency: string
  workPref: WorkPref
  advancedOpen: boolean
  minScore: number
  uploading: boolean
  uploadError: string | null
  loading: boolean
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>
  onSelectSaved: (profile: SavedProfile) => void
  onBrowseAll: () => void
  onRoleChange: (value: string) => void
  onLocationChange: (value: string) => void
  onMinSalaryChange: (value: number | undefined) => void
  onCurrencyChange: (value: string) => void
  onWorkPrefChange: (value: WorkPref) => void
  onToggleAdvanced: () => void
  onMinScoreChange: (value: number) => void
  onSubmit: (e: React.FormEvent) => void
}

function CvOrPrefsStage(props: CvOrPrefsProps) {
  const {
    stage,
    profile,
    savedProfiles,
    role,
    location,
    minimumSalary,
    salaryCurrency,
    workPref,
    advancedOpen,
    minScore,
    uploading,
    uploadError,
    loading,
    fileInputRef,
    onSelectSaved,
    onBrowseAll,
    onRoleChange,
    onLocationChange,
    onMinSalaryChange,
    onCurrencyChange,
    onWorkPrefChange,
    onToggleAdvanced,
    onMinScoreChange,
    onSubmit,
  } = props

  if (stage === 'cv' || !profile) {
    return <CvUploadStep savedProfiles={savedProfiles} uploading={uploading} uploadError={uploadError} fileInputRef={fileInputRef} onSelectSaved={onSelectSaved} onBrowseAll={onBrowseAll} />
  }

  return (
    <section className="rounded-2xl border border-line bg-paper p-4 sm:p-5">
      {/* CV summary */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-orange/10 text-orange">
            {profile.viaUpload ? <FileText className="size-5" aria-hidden="true" /> : <UserRound className="size-5" aria-hidden="true" />}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{profile.label}</p>
            <p className="mt-0.5 text-xs text-slate">
              {profile.viaUpload ? `Parsed from your CV · ${profile.role}` : `Using saved profile${profile.role !== 'software engineer' ? ` · ${profile.role}` : ''}`}
            </p>
            {profile.skills.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {profile.skills.slice(0, 8).map((skill) => (
                  <span key={skill} className="rounded-full bg-orange/10 px-2 py-0.5 text-[11px] font-medium text-orange-light">
                    {skill}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {uploadError && (
        <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-status-warning/30 bg-status-warning/10 px-4 py-3 text-sm text-status-warning">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          {uploadError}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1 block text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Target role</span>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-stone" aria-hidden="true" />
            <input
              value={role}
              onChange={(e) => onRoleChange(e.target.value)}
              placeholder="e.g. Backend Engineer"
              className="w-full rounded-md border border-line bg-bone py-2 pr-3 pl-9 text-sm text-ink outline-none transition-colors placeholder:text-slate focus:border-orange/50"
            />
          </div>
        </label>

        <div className="grid gap-3 md:grid-cols-3 md:items-end">
          <label className="block">
            <span className="mb-1 block text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Location / country</span>
            <div className="relative">
              <MapPin className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-stone" aria-hidden="true" />
              <input
                value={location}
                onChange={(e) => onLocationChange(e.target.value)}
                placeholder="Remote, Berlin, US…"
                className="w-full rounded-md border border-line bg-bone py-2 pr-3 pl-9 text-sm text-ink outline-none transition-colors placeholder:text-slate focus:border-orange/50"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1 block text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Minimum salary</span>
            <div className="relative">
              <DollarSign className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-stone" aria-hidden="true" />
              <input
                type="number"
                min={0}
                step={5000}
                value={minimumSalary ?? ''}
                onChange={(e) => onMinSalaryChange(e.target.value ? Number(e.target.value) : undefined)}
                placeholder="e.g. 90000"
                className="w-full rounded-md border border-line bg-bone py-2 pr-3 pl-9 text-sm text-ink outline-none transition-colors placeholder:text-slate focus:border-orange/50"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1 block text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Currency</span>
            <select
              value={salaryCurrency}
              onChange={(e) => onCurrencyChange(e.target.value)}
              className="w-full rounded-md border border-line bg-bone px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-orange/50"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="CAD">CAD</option>
              <option value="AUD">AUD</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="mr-1 text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Work mode</span>
          <QuickFilter active={workPref === 'remote'} onClick={() => onWorkPrefChange('remote')}>
            Remote only
          </QuickFilter>
          <QuickFilter active={workPref === 'remote_hybrid'} onClick={() => onWorkPrefChange('remote_hybrid')}>
            Remote + hybrid
          </QuickFilter>
          <QuickFilter active={workPref === 'onsite'} onClick={() => onWorkPrefChange('onsite')}>
            On-site
          </QuickFilter>
          <QuickFilter active={workPref === 'any'} onClick={() => onWorkPrefChange('any')}>
            Any
          </QuickFilter>
          <button
            type="button"
            onClick={onToggleAdvanced}
            className="ml-auto inline-flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-graphite transition-colors hover:bg-bone"
            aria-expanded={advancedOpen}
          >
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            Filters
          </button>
        </div>

        {advancedOpen && (
          <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Minimum match score</span>
              <input
                type="range"
                min={0}
                max={98}
                step={1}
                value={minScore}
                onChange={(e) => onMinScoreChange(Number(e.target.value))}
                className="w-full accent-orange"
              />
              <span className="text-xs text-slate">Show roles scoring ≥ {minScore}%</span>
            </label>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md bg-orange px-4 py-2 text-sm font-medium text-bone transition-all hover:bg-orange/90 disabled:opacity-60"
          >
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />}
            Find jobs
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-medium text-graphite transition-colors hover:bg-bone"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Upload a different CV
          </button>
        </div>
      </form>
    </section>
  )
}

interface CvUploadStepProps {
  savedProfiles: SavedProfile[]
  uploading: boolean
  uploadError: string | null
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>
  onSelectSaved: (profile: SavedProfile) => void
  onBrowseAll: () => void
}

function CvUploadStep({ savedProfiles, uploading, uploadError, fileInputRef, onSelectSaved, onBrowseAll }: CvUploadStepProps) {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-dashed border-orange/40 bg-paper p-6 text-center sm:p-10">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-orange/10 text-orange" aria-hidden="true">
          {uploading ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
        </div>
        <h2 className="mt-4 text-lg font-medium tracking-[-0.01em] text-ink">
          {uploading ? 'Reading your CV…' : 'Start with your CV'}
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate">
          Upload a PDF or TXT resume and Relay will match you against eight job sources — no typing required.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-md bg-orange px-4 py-2 text-sm font-medium text-bone transition-all hover:bg-orange/90 disabled:opacity-60"
          >
            <Upload className="size-4" aria-hidden="true" />
            Upload CV (PDF/TXT)
          </button>
          <button
            type="button"
            onClick={onBrowseAll}
            className="inline-flex items-center gap-2 rounded-md border border-line px-4 py-2 text-sm font-medium text-graphite transition-colors hover:bg-bone"
          >
            <Briefcase className="size-4" aria-hidden="true" />
            Browse all roles instead
          </button>
        </div>
        <p className="mt-3 text-xs text-stone">PDF must have a text layer; scanned PDFs and images (jpg/png) can’t be read yet.</p>
        {uploadError && (
          <div className="mx-auto mt-4 flex max-w-md items-center gap-2.5 rounded-xl border border-status-warning/30 bg-status-warning/10 px-4 py-3 text-sm text-status-warning">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            {uploadError}
          </div>
        )}
      </section>

      {savedProfiles.length > 0 && (
        <section className="rounded-2xl border border-line bg-paper p-4 sm:p-5">
          <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">or use a saved profile</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {savedProfiles.map((saved) => (
              <button
                key={saved.id}
                type="button"
                onClick={() => onSelectSaved(saved)}
                className="group flex items-center gap-2.5 rounded-xl border border-line bg-bone px-3.5 py-3 text-left transition-colors hover:border-orange/40"
              >
                <UserRound className="size-4 shrink-0 text-stone transition-colors group-hover:text-orange" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{saved.headline ?? saved.label ?? 'Profile'}</span>
                  <span className="block truncate text-xs text-slate">{saved.label ?? saved.platform ?? ''}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function QuickFilter({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active ? 'border-orange/50 bg-orange/10 text-orange-light' : 'border-line text-slate hover:border-orange/30 hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

function JobDetailPanel({ job, onClose }: { job: JobWithMatch; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`${job.title} details`}>
      <div className="absolute inset-0 bg-ink/40 fade-in" onClick={onClose} aria-hidden="true" style={{ backdropFilter: 'blur(2px)' }} />
      <div className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto bg-bone-raised shadow-2xl slide-in-right">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bone-raised/95 px-5 py-3 backdrop-blur-sm">
          <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Role detail</p>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-graphite transition-colors hover:bg-bone hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                {job.companyLogo && <img src={job.companyLogo} alt="" className="mb-2 size-9 rounded-md border border-line object-contain" />}
                <h2 className="text-xl font-medium tracking-[-0.02em] text-ink">{job.title}</h2>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-slate">
                  <Building2 className="size-3.5" aria-hidden="true" />
                  {job.company}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-center rounded-xl bg-status-success/10 px-3 py-2">
                <span className="font-mono text-lg font-semibold text-status-success">{job.match.score}%</span>
                <span className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-status-success/70">Match</span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate">
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" aria-hidden="true" />
                {job.remote ? 'Remote' : job.hybrid ? 'Hybrid' : job.location || 'Onsite'}
              </span>
              {job.employmentType && (
                <span className="inline-flex items-center gap-1">
                  <Briefcase className="size-3" aria-hidden="true" />
                  {job.employmentType}
                </span>
              )}
              {job.seniority && (
                <span className="inline-flex items-center gap-1">
                  <Badge className="size-3" aria-hidden="true" />
                  {job.seniority}
                </span>
              )}
              <span className={cn('inline-flex items-center gap-1 font-medium', job.salary?.min ? 'text-ink' : 'text-stone')}>
                <DollarSign className="size-3" aria-hidden="true" />
                {job.salary?.min ? displaySalary(job.salary) : 'Salary not listed'}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" aria-hidden="true" />
                {ageLabel(job.postedAt, true)}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-paper p-4">
            <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Why {job.match.score}%?</p>
            <p className="mt-2 text-sm leading-relaxed text-slate">{job.match.summary}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Breakdown label="Role" value={job.match.breakdown.role} />
              <Breakdown label="Skills" value={job.match.breakdown.skills} />
              <Breakdown label="Seniority" value={job.match.breakdown.seniority} />
              <Breakdown label="Recency" value={job.match.breakdown.freshness} />
              <Breakdown label="Location" value={job.match.breakdown.location} />
              <Breakdown label="Remote" value={job.match.breakdown.remote} />
              <Breakdown label="Employment" value={job.match.breakdown.employment} />
              <Breakdown label="Salary" value={job.match.breakdown.salary} />
            </div>
          </div>

          {job.match.strengths.length > 0 && (
            <div>
              <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Strengths</p>
              <ul className="mt-2 space-y-1.5">
                {job.match.strengths.map((strength) => (
                  <li key={strength} className="flex items-start gap-2 text-sm text-slate">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-status-success" aria-hidden="true" />
                    {strength}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {job.match.gaps.length > 0 && (
            <div>
              <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Watch-outs</p>
              <ul className="mt-2 space-y-1.5">
                {job.match.gaps.map((gap) => (
                  <li key={gap} className="flex items-start gap-2 text-sm text-slate">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-status-warning" aria-hidden="true" />
                    {gap}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Description</p>
            <div
              className="mt-2 max-w-none text-sm leading-relaxed text-slate [&_a]:text-orange [&_a]:underline"
              dangerouslySetInnerHTML={{ __html: job.description }}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={job.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md bg-orange px-4 py-2 text-sm font-medium text-bone transition-all hover:bg-orange/90"
            >
              Apply on provider <ExternalLink className="size-3.5" aria-hidden="true" />
            </Link>
            {job.attribution?.required && job.attribution.url && (
              <Link
                href={job.attribution.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-line px-4 py-2 text-sm font-medium text-graphite transition-colors hover:bg-bone"
              >
                {job.attribution.label ?? 'Source'} <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </Link>
            )}
          </div>

          <p className="flex items-center gap-1.5 text-xs text-slate">
            <Info className="size-3" aria-hidden="true" />
            Listed via {SOURCE_NAMES[job.source] ?? job.source}
            {Array.isArray(job.alsoListedOn) && job.alsoListedOn.length > 0 && ` · also seen on ${job.alsoListedOn.map((s) => SOURCE_NAMES[s] ?? s).join(', ')}`}
          </p>
        </div>
      </div>
    </div>
  )
}

function Breakdown({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100)
  return (
    <div className="rounded-lg border border-line bg-bone px-3 py-2">
      <p className="truncate text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">{label}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
          <div
            className={cn('h-full rounded-full', pct >= 75 ? 'bg-status-success' : pct >= 50 ? 'bg-orange' : 'bg-slate')}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="font-mono text-xs font-medium text-ink">{pct}</span>
      </div>
    </div>
  )
}

function Badge({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('inline-flex size-3 items-center justify-center rounded-full bg-stone/20 text-[8px] font-semibold text-stone', className)}>
      Lv
    </span>
  )
}

const PERIOD_LABEL: Record<SalaryPeriod | 'year', string> = {
  year: '/ yr',
  hour: '/ hr',
  month: '/ mo',
  week: '/ wk',
  day: '/ day',
}

function displaySalary(info: SalaryInfo): string {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: info.currency ?? 'USD',
    maximumFractionDigits: 0,
  })
  const suffix = info.period ? PERIOD_LABEL[info.period] : ''
  if (info.min !== undefined && info.max !== undefined && info.max !== info.min) return `${formatter.format(info.min)}–${formatter.format(info.max)}${suffix}`
  if (info.min !== undefined) return `From ${formatter.format(info.min)}${suffix}`
  if (info.max !== undefined) return `Up to ${formatter.format(info.max)}${suffix}`
  return 'Salary not listed'
}

function ageLabel(iso: string | undefined, verbose = false): string {
  if (!iso) return 'Posting date unavailable'
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 'Posting date unavailable'
  const ageDays = (Date.now() - t) / 86_400_000
  if (ageDays < 0) return verbose ? momentDate(iso) : 'Posted recently'
  const label = ageDays < 1 ? 'Posted today' : ageDays < 2 ? 'Posted 1 day ago' : ageDays < 30 ? `Posted ${Math.floor(ageDays)} days ago` : ageDays < 60 ? 'Posted over a month ago' : ageDays < 90 ? 'Posted 1–3 months ago' : 'Posted 90+ days ago'
  return verbose ? `${label} · ${momentDate(iso)}` : label
}

function momentDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}