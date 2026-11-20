'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

import {
  ArrowLeft,
  Bookmark,
  CheckCircle2,
  ExternalLink,
  FileText,
  MapPin,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { JobCard } from '@/lib/job-discovery/service'
import { isSafeApplicationUrl } from '@/lib/job-discovery/url'

interface ProfileOption {
  id: string
  label: string
  platform: string
}

interface DocumentRow {
  id: string
  kind: string
  version: number
  text: string
  content: Record<string, unknown>
  ats: Record<string, unknown> | null
}

const CATEGORY_LABEL: Record<string, string> = {
  excellent: 'Excellent match',
  strong: 'Strong match',
  possible: 'Possible match',
  stretch: 'Stretch opportunity',
  not_eligible: 'Not eligible',
  requires_verification: 'Requires verification',
}

const APPLICATION_STATUSES = ['draft', 'saved', 'reviewed', 'prepared', 'applied', 'replied', 'interview', 'offer', 'hired', 'rejected', 'withdrawn']

function relative(value: string | null): string {
  if (!value) return '—'
  const ms = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(ms) || ms < 0) return 'just now'
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(value).toLocaleDateString()
}

export function JobDetail({ job, detail, profiles, activeProfileId }: { job: JobCard; detail: Record<string, unknown>; profiles: ProfileOption[]; activeProfileId: string | null }) {
  const [profileId, setProfileId] = useState(activeProfileId ?? profiles[0]?.id ?? '')
  const [match, setMatch] = useState(job.match)
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [generating, setGenerating] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [compare, setCompare] = useState<{ a: DocumentRow; b: DocumentRow } | null>(null)
  const [layout, setLayout] = useState<'modern' | 'technical' | 'minimal' | 'ultra'>('modern')
  const [paper, setPaper] = useState<'a4' | 'letter'>('letter')
  const [checklist, setChecklist] = useState<Record<string, boolean>>({})
  const CHECKLIST = [
    'Verified open at the original source',
    'Pakistan eligibility confirmed',
    'CV reviewed for truthful claims',
    'Application package downloaded',
    'Official application opened',
    'Submission confirmed and recorded',
  ]
  const [recommendations, setRecommendations] = useState<Array<{ profileId: string; name: string; score: number; category: string; reason: string }>>([])
  const [saved, setSaved] = useState(job.saved)
  const [applicationId, setApplicationId] = useState<string | null>(null)
  const [status, setStatus] = useState(job.applicationStatus ?? 'draft')
  const [method, setMethod] = useState('external')
  const [notes, setNotes] = useState('')
  const [destinationUrl, setDestinationUrl] = useState<string>(job.applyUrl ?? job.sourceUrl ?? '')

  const loadDocuments = useCallback(async () => {
    if (!profileId) return
    const response = await fetch(`/api/jobs/${job.id}/documents?profileId=${profileId}`)
    if (response.ok) {
      const data = (await response.json()) as { documents: DocumentRow[] }
      setDocuments(data.documents)
    }
  }, [job.id, profileId])

  useEffect(() => {
    // The fetch is async; the lint rule sees the state update as synchronous.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDocuments()
  }, [loadDocuments])

  useEffect(() => {
    if (!profileId) return
    fetch(`/api/jobs/${job.id}/recommend`)
      .then((response) => (response.ok ? response.json() : { recommendations: [] }))
      .then((data: { recommendations: Array<{ profileId: string; name: string; score: number; category: string; reason: string }> }) =>
        setRecommendations(data.recommendations),
      )
      .catch(() => {})
  }, [job.id, profileId])

  function changeProfile(next: string) {
    setProfileId(next)
    const params = new URLSearchParams(window.location.search)
    params.set('profileId', next)
    window.location.href = `${window.location.pathname}?${params.toString()}`
    setMatch(null)
    setDocuments([])
    void loadDocumentsFor(next)
  }

  async function loadDocumentsFor(next: string) {
    const response = await fetch(`/api/jobs/${job.id}/documents?profileId=${next}`)
    if (response.ok) {
      const data = (await response.json()) as { documents: DocumentRow[] }
      setDocuments(data.documents)
    }
  }

  async function runMatch() {
    if (!profileId) return
    setGenerating(true)
    setNotice(null)
    try {
      const response = await fetch(`/api/jobs/${job.id}/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId }),
      })
      if (!response.ok) throw new Error('Match failed')
      const data = (await response.json()) as { job: JobCard }
      setMatch(data.job.match)
      setNotice('Match updated from verified profile evidence.')
    } catch {
      setNotice('Could not compute the match. Try again.')
    } finally {
      setGenerating(false)
    }
  }

  async function generateDocuments() {
    if (!profileId) return
    setGenerating(true)
    setNotice(null)
    try {
      const response = await fetch(`/api/jobs/${job.id}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, layout, paper }),
      })
      if (!response.ok) throw new Error('Generation failed')
      const data = (await response.json()) as { documents: DocumentRow[] }
      setDocuments(data.documents)
      setNotice('Document package generated. Review the ATS readiness report before sending.')
    } catch {
      setNotice('Document generation failed. Check the AI provider status.')
    } finally {
      setGenerating(false)
    }
  }

  function startEdit(doc: DocumentRow) {
    setEditingId(doc.id)
    setEditText(doc.text)
  }

  async function saveEdit(doc: DocumentRow) {
    if (!profileId) return
    const response = await fetch(`/api/jobs/${job.id}/documents/${doc.kind}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, text: editText }),
    })
    if (response.ok) {
      const data = (await response.json()) as { documents: DocumentRow[] }
      setDocuments(data.documents)
      setEditingId(null)
      setNotice('Saved as a new version. The previous version is kept for comparison.')
    } else {
      setNotice('Could not save the edit.')
    }
  }

  function openCompare() {
    const cvs = documents.filter((doc) => doc.kind === 'cv')
    if (cvs.length >= 2) setCompare({ a: cvs[0], b: cvs[1] })
  }

  async function toggleSave() {
    await fetch(`/api/jobs/${job.id}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, saved: !saved }),
    })
    setSaved(!saved)
  }

  async function saveApplication() {
    if (!profileId) return
    const response = await fetch(`/api/jobs/${job.id}/application`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, status, method, notes, destinationUrl }),
    })
    if (response.ok) {
      const data = (await response.json()) as { applicationId: string }
      setApplicationId(data.applicationId)
      setNotice('Application draft saved. Submission is only recorded when you confirm it.')
    }
  }

  async function transition(next: string) {
    if (!applicationId) {
      const response = await fetch(`/api/jobs/${job.id}/application`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, status: next, method, notes, destinationUrl }),
      })
      if (response.ok) {
        const data = (await response.json()) as { applicationId: string }
        setApplicationId(data.applicationId)
      }
    } else {
      await fetch(`/api/jobs/${job.id}/application`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId, status: next }),
      })
    }
    setStatus(next)
    setNotice(next === 'applied' ? 'Marked as actually submitted. This is your confirmation, not an automated claim.' : `Status updated to ${next}.`)
  }

  const eligibility = job.eligibility
  const cv = documents.find((doc) => doc.kind === 'cv')
  const ats = cv?.ats as Record<string, unknown> | null | undefined
  const attachments = (cv?.content?.attachments as Array<{ id: string; title: string; url: string }> | undefined) ?? []

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:py-12">
      <Link href="/jobs?view=for-you" className="mb-6 inline-flex items-center gap-1.5 text-sm text-graphite transition-colors hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Back to Jobs
      </Link>

      <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-line bg-bone-raised p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.16em] text-stone">{job.company ?? 'Unknown company'}</p>
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{job.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant={eligibility?.classification === 'worldwide' ? 'success' : eligibility ? 'warning' : 'outline'}>
                {eligibility?.classification === 'worldwide' ? 'Worldwide remote' : eligibility?.classification?.replace('_', ' ') ?? 'Eligibility unknown'}
              </Badge>
              <Badge variant={job.verificationStatus === 'verified_open' ? 'success' : job.verificationStatus === 'recently_seen' ? 'warning' : 'outline'}>
                <ShieldCheck className="size-3" aria-hidden /> {job.verificationStatus.replace('_', ' ')}
              </Badge>
              {job.remote && <Badge variant="secondary">Remote</Badge>}
              {job.employmentType && <Badge variant="secondary">{job.employmentType}</Badge>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" aria-label="Save job" onClick={toggleSave} aria-pressed={saved}>
              <Bookmark className={cn('size-3.5', saved && 'fill-current')} aria-hidden /> {saved ? 'Saved' : 'Save'}
            </Button>
            <Button
              variant="orange"
              size="sm"
              disabled={!isSafeApplicationUrl(destinationUrl || job.applyUrl)}
              onClick={() => window.open(destinationUrl || job.applyUrl || '#', '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink className="size-3.5" aria-hidden /> Open official application
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs text-stone sm:grid-cols-4">
          <span className="flex items-center gap-1.5"><MapPin className="size-3.5" aria-hidden />{job.locationRaw ?? 'Remote'}</span>
          <span>Posted {relative(job.postedAt)}</span>
          <span>First seen {relative(job.firstSeenAt)}</span>
          <span>Last checked {relative(job.lastVerifiedAt ?? job.lastSeenAt)}</span>
        </div>
        {job.skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {job.skills.map((skill) => (
              <span key={skill} className="rounded-md bg-bone px-2 py-1 text-[11px] font-medium text-graphite ring-1 ring-line">{skill}</span>
            ))}
          </div>
        )}
        {eligibility && (
          <div className="rounded-xl bg-bone p-3 ring-1 ring-line">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-stone">Eligibility reasoning</p>
            <p className="text-sm text-ink">{eligibility.explanation}</p>
            <p className="mt-2 text-xs font-medium text-graphite">
              {eligibility.pakistan?.eligible === true
                ? `Pakistan: eligible (${eligibility.pakistan.classification.replace(/_/g, ' ')}${eligibility.pakistan.confidence === 'likely' ? ', likely' : ''})`
                : eligibility.pakistan?.eligible === false
                  ? 'Pakistan: not eligible from this posting'
                  : 'Pakistan: eligibility not established — review before applying'}
            </p>
            {eligibility.evidence.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-graphite">
                {eligibility.evidence.slice(0, 4).map((item, index) => (
                  <li key={index} className="flex gap-2">
                    <span className="text-orange-ink">•</span>
                    <span>“{item.text}” — {item.decision}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="rounded-2xl border border-line bg-bone-raised p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink"><Sparkles className="size-4 text-orange-ink" aria-hidden /> Match</h2>
              <div className="flex items-center gap-2">
                <select value={profileId} onChange={(event) => changeProfile(event.target.value)} className="h-8 rounded-md border border-line bg-bone px-2 text-xs text-ink outline-none" aria-label="Profile">
                  {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
                </select>
                <Button size="sm" variant="outline" onClick={runMatch} disabled={generating || !profileId}>Compute match</Button>
              </div>
            </div>
            {match ? (
              <div>
                <div className="mb-3 flex items-center gap-3">
                  <Badge variant={match.category === 'not_eligible' ? 'destructive' : match.category === 'requires_verification' ? 'warning' : 'cobalt'}>
                    {CATEGORY_LABEL[match.category] ?? match.category}
                  </Badge>
                  <span className="text-sm font-semibold text-ink">{match.score}/100</span>
                </div>
                <div className="mb-3 h-2 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-orange" style={{ width: `${match.score}%` }} />
                </div>
                <p className="mb-4 text-sm text-graphite">{match.explanation}</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {Object.entries(match.breakdown ?? {}).map(([key, value]) => (
                    <div key={key} className="rounded-lg bg-bone p-2 ring-1 ring-line">
                      <p className="text-[10px] uppercase tracking-wide text-stone">{key}</p>
                      <p className="text-sm font-semibold text-ink">{Math.round(Number(value) * 100)}%</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-graphite">Select a profile and compute a match. The score is a transparent heuristic, not a hiring probability.</p>
            )}
            {recommendations.length > 0 && (
              <div className="mt-4 rounded-xl bg-bone p-3 ring-1 ring-line">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-stone">Recommended profiles</p>
                <ul className="space-y-2">
                  {recommendations.map((recommendation) => (
                    <li key={recommendation.profileId} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-ink">{recommendation.name}</p>
                        <p className="truncate text-[11px] text-stone">{recommendation.reason}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant={recommendation.category === 'not_eligible' ? 'destructive' : recommendation.category === 'requires_verification' ? 'warning' : 'cobalt'}>
                          {recommendation.score}
                        </Badge>
                        <Button size="xs" variant="outline" onClick={() => changeProfile(recommendation.profileId)} disabled={recommendation.profileId === profileId}>
                          Select
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-bone-raised p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink"><FileText className="size-4 text-orange-ink" aria-hidden /> Application documents</h2>
              <div className="flex items-center gap-2">
                <select
                  value={layout}
                  onChange={(event) => setLayout(event.target.value as 'modern' | 'technical' | 'minimal' | 'ultra')}
                  className="h-8 rounded-md border border-line bg-bone px-2 text-xs text-ink outline-none"
                  aria-label="CV layout"
                >
                  <option value="modern">Modern professional</option>
                  <option value="technical">Technical engineering</option>
                  <option value="minimal">Minimal corporate</option>
                  <option value="ultra">Ultra ATS</option>
                </select>
                <select
                  value={paper}
                  onChange={(event) => setPaper(event.target.value as 'a4' | 'letter')}
                  className="h-8 rounded-md border border-line bg-bone px-2 text-xs text-ink outline-none"
                  aria-label="Paper size"
                >
                  <option value="letter">US Letter</option>
                  <option value="a4">A4</option>
                </select>
                <Button size="sm" variant="ghost" onClick={openCompare} disabled={documents.filter((doc) => doc.kind === 'cv').length < 2}>
                  Compare versions
                </Button>
                <Button size="sm" variant="outline" onClick={generateDocuments} disabled={generating || !profileId}>
                  {generating ? 'Generating…' : 'Generate package'}
                </Button>
              </div>
            </div>
            {notice && <p className="mb-3 rounded-lg bg-bone px-3 py-2 text-xs text-graphite ring-1 ring-line">{notice}</p>}
            {documents.length === 0 ? (
              <p className="text-sm text-graphite">No documents yet. Generate a truthful CV, cover letter, proposal and LinkedIn note from verified profile evidence.</p>
            ) : (
              <div className="space-y-3">
                {ats && (
                  <div className="rounded-xl bg-bone p-3 ring-1 ring-line">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-stone">ATS readiness (internal heuristic)</p>
                      <span className="text-sm font-semibold text-ink">{String(ats.score)}/100</span>
                    </div>
                    {(ats as Record<string, unknown>).readiness !== undefined && (
                      <div className="mb-2 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-bone p-2 ring-1 ring-line">
                          <p className="text-[10px] uppercase tracking-wide text-stone">Document quality</p>
                          <p className="text-sm font-semibold text-ink">{Number((ats.documentQuality as Record<string, unknown>)?.score ?? 0)}/100</p>
                        </div>
                        <div className="rounded-lg bg-bone p-2 ring-1 ring-line">
                          <p className="text-[10px] uppercase tracking-wide text-stone">Job match</p>
                          <p className="text-sm font-semibold text-ink">{Number((ats.jobMatch as Record<string, unknown>)?.score ?? 0)}/100</p>
                        </div>
                        <div className="rounded-lg bg-bone p-2 ring-1 ring-line">
                          <p className="text-[10px] uppercase tracking-wide text-stone">ATS readiness</p>
                          <p className="text-sm font-semibold text-ink">{Number((ats as Record<string, unknown>).readiness ?? 0)}/100</p>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <AtsGroup title="Matched" items={ats.matchedRequirements as Array<Record<string, unknown>>} tone="success" />
                      <AtsGroup title="Missing" items={ats.missingRequirements as Array<Record<string, unknown>>} tone="destructive" />
                      <AtsGroup title="Unverified" items={ats.unverifiedRequirements as Array<Record<string, unknown>>} tone="warning" />
                    </div>
                    {((ats.formatIssues as string[] | undefined)?.length ?? 0) > 0 && (
                      <ul className="mt-2 space-y-1 text-xs text-graphite">
                        {(ats.formatIssues as string[]).map((issue, index) => <li key={index} className="flex gap-1.5"><TriangleAlert className="size-3 text-status-warning" aria-hidden />{issue}</li>)}
                      </ul>
                    )}
                    <p className="mt-2 text-[11px] text-stone">
                      PDF text extraction coverage: {Math.round(Number((ats.extraction as Record<string, unknown>)?.coverage ?? 0) * 100)}%.
                      This is not an official employer ATS score.
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {documents.map((doc) => (
                    <div key={doc.id} className="rounded-xl bg-bone p-3 ring-1 ring-line">
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-xs font-semibold text-ink">{doc.kind.replace('_', ' ')}</p>
                        <span className="text-[10px] text-stone">v{doc.version}</span>
                      </div>
                      {editingId === doc.id ? (
                        <>
                          <textarea
                            value={editText}
                            onChange={(event) => setEditText(event.target.value)}
                            rows={7}
                            className="mb-2 w-full rounded-md border border-line bg-bone-raised px-2 py-1.5 text-[11px] text-ink outline-none"
                          />
                          <div className="flex gap-2">
                            <Button size="xs" variant="orange" onClick={() => saveEdit(doc)}>Save new version</Button>
                            <Button size="xs" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="mb-2 line-clamp-2 text-[11px] text-graphite">{doc.text?.slice(0, 140)}</p>
                          <div className="flex items-center gap-3 text-[11px] font-medium text-orange-ink">
                            <button type="button" onClick={() => startEdit(doc)} className="hover:underline">Edit</button>
                            <a href={`/api/jobs/${job.id}/documents/${doc.kind}?profileId=${profileId}&format=pdf&layout=${layout}&paper=${paper}`}>PDF</a>
                            <a href={`/api/jobs/${job.id}/documents/${doc.kind}?profileId=${profileId}&format=docx&layout=${layout}&paper=${paper}`}>DOCX</a>
                            <a href={`/api/jobs/${job.id}/documents/${doc.kind}?profileId=${profileId}&format=txt`}>TXT</a>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
                {attachments.length > 0 && (
                  <div className="mt-3 rounded-xl bg-bone p-3 ring-1 ring-line">
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-stone">Canonical attachments</p>
                    <ul className="space-y-1 text-xs text-graphite">
                      {attachments.map((attachment) => (
                        <li key={attachment.id}>
                          <a href={attachment.url} target="_blank" rel="noreferrer" className="font-medium text-orange-ink hover:underline">
                            {attachment.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-line bg-bone-raised p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink">Application</h2>
            <label className="mb-1 block text-[11px] font-medium text-stone">Status</label>
            <select aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value)} className="mb-3 h-9 w-full rounded-md border border-line bg-bone px-2 text-sm text-ink outline-none">
              {APPLICATION_STATUSES.map((value) => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}
            </select>
            <label className="mb-1 block text-[11px] font-medium text-stone">Method</label>
            <select aria-label="Method" value={method} onChange={(event) => setMethod(event.target.value)} className="mb-3 h-9 w-full rounded-md border border-line bg-bone px-2 text-sm text-ink outline-none">
              {['manual', 'external', 'upwork', 'linkedin', 'email'].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <label className="mb-1 block text-[11px] font-medium text-stone">Destination URL</label>
            <input value={destinationUrl} onChange={(event) => setDestinationUrl(event.target.value)} className="mb-3 h-9 w-full rounded-md border border-line bg-bone px-2 text-xs text-ink outline-none" />
            <label className="mb-1 block text-[11px] font-medium text-stone">Notes</label>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="mb-3 w-full rounded-md border border-line bg-bone px-2 py-2 text-xs text-ink outline-none" />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={saveApplication} disabled={!profileId}>Save draft</Button>
              <Button size="sm" variant="secondary" onClick={() => transition(status)} disabled={!profileId}>Update</Button>
            </div>
            <Button size="sm" variant="orange" className="mt-2 w-full" onClick={() => transition('applied')} disabled={!profileId}>
              <CheckCircle2 className="size-3.5" aria-hidden /> Confirm actually submitted
            </Button>
            <p className="mt-2 text-[11px] text-stone">Relay never auto-applies. “Applied” is recorded only after your confirmation.</p>
            <div className="mt-3 space-y-1 border-t border-line pt-3">
              {CHECKLIST.map((item) => (
                <label key={item} className="flex items-center gap-2 text-[11px] text-graphite">
                  <input
                    type="checkbox"
                    checked={Boolean(checklist[item])}
                    onChange={() => setChecklist((previous) => ({ ...previous, [item]: !previous[item] }))}
                  />
                  {item}
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-bone-raised p-5">
            <h3 className="mb-2 text-sm font-semibold text-ink">Raw posting evidence</h3>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-console p-3 text-[10px] leading-relaxed text-console-text">
              {String(detail.description ?? '').slice(0, 6000)}
            </pre>
            <p className="mt-2 text-[11px] text-stone">Source: {job.sourceId} · {job.sourceJobId}</p>
          </section>
        </aside>
      </div>

      <dialog
        open={Boolean(compare)}
        onClose={() => setCompare(null)}
        className="rounded-2xl border border-line bg-bone-raised p-0 shadow-2xl backdrop:bg-ink/40"
      >
        <div className="w-[min(900px,94vw)] p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">Compare CV versions</h2>
            <Button size="sm" variant="outline" onClick={() => setCompare(null)}>Close</Button>
          </div>
          {compare && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {[compare.a, compare.b].map((doc, index) => (
                <div key={doc.id} className="rounded-xl bg-bone p-3 ring-1 ring-line">
                  <p className="mb-2 text-xs font-semibold text-ink">{index === 0 ? 'Newer' : 'Older'} · v{doc.version}</p>
                  <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-graphite">{doc.text}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </dialog>
    </div>
  )
}

function AtsGroup({ title, items, tone }: { title: string; items?: Array<Record<string, unknown>>; tone: 'success' | 'destructive' | 'warning' }) {
  return (
    <div>
      <p className={cn('mb-1 text-[10px] font-medium uppercase tracking-wide', tone === 'success' ? 'text-status-success' : tone === 'destructive' ? 'text-status-danger' : 'text-status-warning')}>
        {title} ({items?.length ?? 0})
      </p>
      <ul className="space-y-0.5 text-[11px] text-graphite">
        {(items ?? []).slice(0, 4).map((item, index) => <li key={index}>• {String(item.text)}</li>)}
        {(items?.length ?? 0) === 0 && <li>none</li>}
      </ul>
    </div>
  )
}
