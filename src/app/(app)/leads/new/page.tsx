'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  MapPin,
  Quote,
  Sparkles,
  User,
  Wand2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { FieldError, FieldHint } from '@/components/ui/field-message'
import { VerdictWord } from '@/components/status-word'
import { ScoreRing } from '@/components/score-ring'
import { signalById, SIGNALS } from '@/lib/score/signals'
import { computeScore } from '@/lib/score/rubric'
import type { OrganizationRulebook } from '@/lib/domain/types'

const DEFAULT_RULEBOOK: OrganizationRulebook = {
  organizationId: '',
  signals: SIGNALS,
  verdictThresholds: { send: { min: 10, max: 12 }, research_more: { min: 7, max: 9 }, skip: { min: 0, max: 6 } },
  maxSignalWeight: 7,
  maxCompleteness: 5,
  confidenceSendThreshold: 72,
}
import { classifyRoleFromTitle, mapLocationToRegion } from '@/lib/leads/targeting'
import { readSse } from '@/lib/sse/client'
import { cn } from 'cn'
import type { ExtractedLead, MarketRegion, RoleCategory, SignalId } from '@/lib/domain/types'

interface FormState {
  company: string
  contactName: string
  contactTitle: string
  titleRaw: string
  locationRaw: string
  aboutSummary: string
  experienceSummary: string
  recentPosts: Array<{ paraphrase: string; verbatimQuote: string | null }>
  roleCategory: RoleCategory
  extractionConfidence: number
  confidenceNotes: string[]
  url: string
  signalType: SignalId
  signalEvidence: string
  verbatimQuote: string
  rawInput: string
  tags: string[]
}

const INITIAL: FormState = {
  company: '',
  contactName: '',
  contactTitle: '',
  titleRaw: '',
  locationRaw: '',
  aboutSummary: '',
  experienceSummary: '',
  recentPosts: [],
  roleCategory: 'other',
  extractionConfidence: 0,
  confidenceNotes: [],
  url: '',
  signalType: 7,
  signalEvidence: '',
  verbatimQuote: '',
  rawInput: '',
  tags: [],
}

const ROLE_LABELS: Record<RoleCategory, string> = {
  founder_cofounder: 'Founder / co-founder',
  ceo: 'CEO',
  technical_leadership: 'Technical leadership',
  product: 'Product',
  hiring_manager_recruiter: 'Hiring manager / recruiter',
  other: 'Other',
}

const REGION_LABELS: Record<MarketRegion, string> = {
  US: 'United States',
  UK: 'United Kingdom',
  EU: 'Europe',
  CA: 'Canada',
  AU: 'Australia',
  UAE: 'UAE',
  SG: 'Singapore',
  outside_core: 'Outside core markets',
  unknown: 'Unknown',
}

function verdictCall(verdict: 'send' | 'research_more' | 'skip'): string {
  if (verdict === 'send') return 'Worth your next thirty seconds. Save it and draft.'
  if (verdict === 'research_more')
    return 'Promising but thin. A little more research will settle it.'
  return 'Not enough here yet. Skip unless you add more.'
}

function pasteGuard(raw: string): string | null {
  if (!raw) return 'Paste some raw research first.'
  if (/^https?:\/\/\S+\s*$/i.test(raw)) {
    return 'That is just a URL with no surrounding text. Paste the profile or post text alongside it so there is something to extract.'
  }
  if (raw.length < 24) {
    return 'That paste is too short to extract anything useful. Add a sentence or two of real research.'
  }
  return null
}

/** Which specific field a confidence note is actually about, so the rep's eye goes to the one field that needs a look instead of reading a wall of caveats. */
function noteField(note: string): keyof FormState | null {
  const n = note.toLowerCase()
  if (n.includes('contact name')) return 'contactName'
  if (n.includes('title') || n.includes('headline')) return 'titleRaw'
  if (n.includes('company')) return 'company'
  if (n.includes('location')) return 'locationRaw'
  if (n.includes('signal evidence')) return 'signalEvidence'
  if (n.includes('verbatim') || n.includes('quote')) return 'verbatimQuote'
  if (n.includes('about summary')) return 'aboutSummary'
  if (n.includes('experience summary')) return 'experienceSummary'
  return null
}

function FieldFlag({ notes, field }: { notes: string[]; field: keyof FormState }) {
  const note = notes.find((n) => noteField(n) === field)
  if (!note) return null
  return (
    <span className="mt-1 flex items-start gap-1 text-xs text-status-research">
      <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
      {note}
    </span>
  )
}

export default function NewLeadPage() {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(INITIAL)
  const [extracting, setExtracting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [demoMode, setDemoMode] = useState(false)
  const [extracted, setExtracted] = useState(false)
  const [candidates, setCandidates] = useState<ExtractedLead[]>([])
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ company?: string; signalEvidence?: string }>({})
  const [blocked, setBlocked] = useState<{ reason?: string; existingOwnerName?: string } | null>(null)
  const rawRef = useRef<HTMLTextAreaElement | null>(null)

  const liveRegion = useMemo(
    () => mapLocationToRegion(form.locationRaw.trim() || null),
    [form.locationRaw],
  )

  const [orgRulebook, setOrgRulebook] = useState<OrganizationRulebook | null>(null)
  useEffect(() => {
    fetch('/api/me/rulebook')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.rulebook) setOrgRulebook(d.rulebook) })
      .catch(() => {})
  }, [])

  const activeRulebook = orgRulebook ?? DEFAULT_RULEBOOK

  const score = useMemo(() => {
    const lead: ExtractedLead = {
      name: form.contactName.trim() || null,
      title: form.contactTitle.trim() || null,
      titleRaw: form.titleRaw.trim() || null,
      company: form.company.trim() || 'Unnamed company',
      url: form.url.trim() || null,
      locationRaw: form.locationRaw.trim() || null,
      aboutSummary: form.aboutSummary.trim() || null,
      experienceSummary: form.experienceSummary.trim() || null,
      recentPosts: form.recentPosts,
      roleCategory: form.roleCategory,
      marketRegion: liveRegion,
      signalType: form.signalType,
      signalEvidence: form.signalEvidence,
      extractionConfidence: form.extractionConfidence,
      confidenceNotes: form.confidenceNotes,
      verbatimQuote: form.verbatimQuote.trim() || null,
      tags: form.tags,
    }
    return computeScore(lead, activeRulebook)
  }, [form, liveRegion, activeRulebook])

  const hasContent = Boolean(form.signalEvidence.trim() || form.company.trim())
  const weakFields = new Set(form.confidenceNotes.map(noteField).filter(Boolean))

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function applyExtracted(ex: ExtractedLead) {
    setForm((f) => ({
      ...f,
      company: ex.company?.trim() || f.company.trim() || f.company,
      contactName: ex.name?.trim() || f.contactName.trim() || f.contactName,
      contactTitle: ex.title?.trim() || f.contactTitle.trim() || f.contactTitle,
      titleRaw: ex.titleRaw?.trim() || ex.title?.trim() || f.titleRaw,
      locationRaw: ex.locationRaw?.trim() || f.locationRaw,
      aboutSummary: ex.aboutSummary?.trim() || f.aboutSummary,
      experienceSummary: ex.experienceSummary?.trim() || f.experienceSummary,
      recentPosts: ex.recentPosts ?? f.recentPosts,
      roleCategory: ex.roleCategory ?? classifyRoleFromTitle(ex.titleRaw ?? ex.title) ?? f.roleCategory,
      url: ex.url?.trim() || f.url.trim() || f.url,
      signalType: ex.signalType ?? f.signalType,
      signalEvidence: ex.signalEvidence ?? f.signalEvidence,
      extractionConfidence: ex.extractionConfidence ?? f.extractionConfidence,
      confidenceNotes: ex.confidenceNotes ?? f.confidenceNotes,
      verbatimQuote: ex.verbatimQuote?.trim() ?? f.verbatimQuote,
      tags: ex.tags ?? [],
    }))
    setExtracted(true)
  }

  function validateField<K extends 'company' | 'signalEvidence'>(key: K): boolean {
    const value = form[key].trim()
    const message =
      key === 'company'
        ? value.length < 2
          ? 'Company name is required.'
          : undefined
        : value.length < 12
          ? 'Add the evidence you found (at least a sentence).'
          : undefined
    setFieldErrors((e) => ({ ...e, [key]: message }))
    return !message
  }

  async function extract() {
    const guard = pasteGuard(form.rawInput.trim())
    if (guard) {
      setError(guard)
      rawRef.current?.focus()
      return
    }
    setExtracting(true)
    setError(null)
    setDemoMode(false)
    setCandidates([])
    setForm((f) => ({ ...f, tags: [] }))
    try {
      let res: Response
      try {
        res = await fetch('/api/leads/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rawText: form.rawInput }),
        })
      } catch {
        throw new Error('Network error.')
      }

      type ExtractEvent =
        | { type: 'status'; message: string }
        | { type: 'done'; extracted: ExtractedLead; candidates?: ExtractedLead[]; demoMode: boolean }
        | { type: 'error'; message: string }

      await readSse<ExtractEvent>(res, {
        onEvent(event) {
          if (event.type === 'status') return

          if (event.type === 'error') {
            setError(event.message)
            return
          }

          if (event.type === 'done') {
            const ex = event.extracted ?? {}
            setDemoMode(Boolean(event.demoMode))
            applyExtracted(ex)
            setCandidates((event.candidates ?? []).filter((c) => c.company?.trim().length > 0))
          }
        },
      })
    } catch (err) {
      if (!error) {
        setError(err instanceof Error ? err.message : 'Extraction failed.')
      }
    } finally {
      setExtracting(false)
    }
  }

  async function save() {
    const companyOk = validateField('company')
    const evidenceOk = validateField('signalEvidence')
    if (!companyOk || !evidenceOk) return
    setSaving(true)
    setError(null)
    setBlocked(null)
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: form.company.trim() || 'Unnamed company',
          contactName: form.contactName.trim() || null,
          contactTitle: form.contactTitle.trim() || null,
          titleRaw: form.titleRaw.trim() || null,
          locationRaw: form.locationRaw.trim() || null,
          aboutSummary: form.aboutSummary.trim() || null,
          experienceSummary: form.experienceSummary.trim() || null,
          recentPosts: form.recentPosts,
          roleCategory: form.roleCategory,
          marketRegion: liveRegion,
          extractionConfidence: form.extractionConfidence,
          confidenceNotes: form.confidenceNotes,
          url: form.url.trim() || null,
          signalType: form.signalType,
          signalEvidence: form.signalEvidence.trim(),
          verbatimQuote: form.verbatimQuote.trim() || null,
          tags: form.tags,
        }),
      })
      const data = await res.json()
      if (res.status === 409) {
        setBlocked({ reason: data.reason, existingOwnerName: data.existingOwnerName })
        return
      }
      if (!res.ok) throw new Error(data.error ?? 'Failed to save lead.')
      router.push(`/leads/${data.lead.id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save lead.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-medium tracking-tight text-ink sm:text-3xl">New lead</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate">
          Paste what you found. Relay reads it, fills in every field, and tells you on the spot
          whether it is worth your next thirty seconds.
        </p>
      </header>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Something failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {blocked ? (
        <Alert variant="destructive">
          <AlertTitle>Duplicate blocked by the dedupe gate</AlertTitle>
          <AlertDescription>
            {blocked.reason}{' '}
            {blocked.existingOwnerName ? `Owner on file: ${blocked.existingOwnerName}.` : ''}
          </AlertDescription>
        </Alert>
      ) : null}

      {demoMode ? (
        <Alert>
          <AlertTitle>Demo mode</AlertTitle>
          <AlertDescription>
            No GROQ_API_KEY is set, so extraction used the deterministic demo extractor. Confidence
            will read low until a real key is configured — verify every field by hand.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr] xl:grid-cols-[26rem_1fr]">
        {/* Left: paste, always in view */}
        <div className="lg:sticky lg:top-7 lg:self-start">
          <div className="rounded-2xl border border-line bg-paper p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-gold" aria-hidden="true" />
              <h2 className="text-sm font-medium text-ink">Paste the research</h2>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate">
              A LinkedIn profile, a job post, an app store listing. Anything you found, exactly as
              you found it.
            </p>
            <Textarea
              id="raw-input"
              ref={rawRef}
              value={form.rawInput}
              onChange={(e) => set('rawInput', e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault()
                  void extract()
                }
              }}
              placeholder="Paste the raw text you found..."
              rows={12}
              className="mt-3 max-h-[28rem] overflow-y-auto font-mono text-[13px]"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-slate">Cmd / Ctrl + Enter</span>
              <Button variant="gold" onClick={() => void extract()} loading={extracting}>
                <Wand2 className="size-4" aria-hidden="true" />
                {extracting ? 'Reading it' : extracted ? 'Re-extract' : 'Extract'}
              </Button>
            </div>
          </div>

          {candidates.length > 1 ? (
            <div className="mt-4 rounded-2xl border border-line bg-paper p-5">
              <h3 className="text-sm font-medium text-ink">
                {candidates.length} profiles in this paste
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate">
                Relay picked the strongest one. Switch if it picked wrong.
              </p>
              <div className="mt-3 space-y-2">
                {candidates.map((c, idx) => {
                  const active = c.company === form.company && idx === 0
                  return (
                    <button
                      key={`${c.company}-${idx}`}
                      type="button"
                      onClick={() => applyExtracted(c)}
                      className={cn(
                        'block w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors',
                        active
                          ? 'border-gold bg-gold/10'
                          : 'border-line bg-paper-tint/40 hover:bg-paper-tint',
                      )}
                    >
                      <span className="block font-medium text-ink">
                        {c.company || 'Unknown company'}
                      </span>
                      <span className="mt-0.5 block text-slate">
                        {c.titleRaw || c.title || 'No title'} ·{' '}
                        {signalById(c.signalType)?.short ?? 'no signal'} · confidence{' '}
                        {c.extractionConfidence ?? 0}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>

        {/* Right: live result, fills in as extraction lands */}
        <div className="space-y-6">
          {!extracted ? (
            <div className="flex min-h-[24rem] flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 text-center">
              <Sparkles className="size-6 text-slate/40" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-ink">Nothing to check yet</p>
              <p className="mt-1 max-w-sm text-sm leading-relaxed text-slate">
                Paste something on the left and hit Extract. Every field Relay finds shows up here,
                ready to fix, with the score updating as you go.
              </p>
            </div>
          ) : (
            <>
              {/* Score strip — the decision, up front */}
              <div className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <ScoreRing score={score.total} size={72} />
                    <div>
                      <VerdictWord verdict={score.verdict} />
                      <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink">
                        {verdictCall(score.verdict)}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1',
                            form.extractionConfidence >= 72
                              ? 'text-status-send'
                              : 'text-status-research',
                          )}
                        >
                          {form.extractionConfidence >= 72 ? (
                            <CheckCircle2 className="size-3.5" aria-hidden="true" />
                          ) : (
                            <AlertTriangle className="size-3.5" aria-hidden="true" />
                          )}
                          {form.extractionConfidence}/100 confidence
                        </span>
                        <span>{ROLE_LABELS[form.roleCategory]}</span>
                        <span>{REGION_LABELS[liveRegion]}</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="gold"
                    size="lg"
                    onClick={() => void save()}
                    disabled={saving || extracting || !hasContent}
                    loading={saving}
                    className="w-full sm:w-auto"
                  >
                    {saving ? 'Saving' : 'Save lead'}
                    {!saving ? <ArrowRight className="size-4" aria-hidden="true" /> : null}
                  </Button>
                </div>

                <ul className="mt-5 grid gap-x-6 gap-y-2 border-t border-line pt-4 sm:grid-cols-2">
                  {score.breakdown.map((item) => {
                    const frac = item.max > 0 ? item.points / item.max : 0
                    return (
                      <li key={item.category + item.label} className="space-y-1">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className={cn(frac <= 0 ? 'text-ink' : 'text-slate')}>
                            {item.label}
                          </span>
                          <span className="font-mono text-xs text-ink">
                            {item.points}/{item.max}
                          </span>
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-paper-tint">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              frac >= 1 ? 'bg-status-send' : frac > 0 ? 'bg-gold' : 'bg-line',
                            )}
                            style={{ width: `${Math.max(frac * 100, frac > 0 ? 8 : 0)}%` }}
                          />
                        </div>
                      </li>
                    )
                  })}
                </ul>

                {score.gates && score.gates.length > 0 ? (
                  <Alert className="mt-4">
                    <AlertTitle>Quality gate applied</AlertTitle>
                    <AlertDescription>{score.gates.join(' ')}</AlertDescription>
                  </Alert>
                ) : null}

                <p className="mt-4 text-xs text-slate">
                  {weakFields.size > 0
                    ? `${weakFields.size} field${weakFields.size === 1 ? '' : 's'} flagged below — worth a second look before saving.`
                    : 'Nothing flagged. Every field checked out.'}
                </p>
              </div>

              {/* Who */}
              <div className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate">
                  <User className="size-3.5" aria-hidden="true" />
                  Who
                </div>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="company">Company</Label>
                    <Input
                      id="company"
                      value={form.company}
                      onChange={(e) => set('company', e.target.value)}
                      onBlur={() => validateField('company')}
                      error={Boolean(fieldErrors.company)}
                      placeholder="Company, Inc."
                    />
                    {fieldErrors.company ? (
                      <FieldError>{fieldErrors.company}</FieldError>
                    ) : (
                      <FieldFlag notes={form.confidenceNotes} field="company" />
                    )}
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="url">Source URL</Label>
                    <Input
                      id="url"
                      value={form.url}
                      onChange={(e) => set('url', e.target.value)}
                      placeholder="https://"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="contact">Contact name</Label>
                    <Input
                      id="contact"
                      value={form.contactName}
                      onChange={(e) => set('contactName', e.target.value)}
                      placeholder="Name"
                    />
                    <FieldFlag notes={form.confidenceNotes} field="contactName" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="title">Title (as shown)</Label>
                    <Input
                      id="title"
                      value={form.titleRaw}
                      onChange={(e) => {
                        set('titleRaw', e.target.value)
                        set('contactTitle', e.target.value)
                        set('roleCategory', classifyRoleFromTitle(e.target.value))
                      }}
                      placeholder="Co-founder & CTO"
                    />
                    <FieldFlag notes={form.confidenceNotes} field="titleRaw" />
                  </div>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="size-3.5 text-slate" aria-hidden="true" />
                      <Label htmlFor="location">Location (as shown)</Label>
                    </div>
                    <Input
                      id="location"
                      value={form.locationRaw}
                      onChange={(e) => set('locationRaw', e.target.value)}
                      placeholder="San Francisco, California, United States"
                    />
                    <FieldHint>
                      Maps to <span className="font-medium text-ink">{REGION_LABELS[liveRegion]}</span>
                      {liveRegion === 'outside_core'
                        ? ' — this costs 2 completeness points against the rubric.'
                        : liveRegion === 'unknown'
                          ? ' — add a location to affect the market-fit score.'
                          : ' — a core market, worth 2 completeness points.'}
                    </FieldHint>
                    <FieldFlag notes={form.confidenceNotes} field="locationRaw" />
                  </div>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label htmlFor="role">Role category</Label>
                    <Select
                      id="role"
                      value={form.roleCategory}
                      onChange={(e) => set('roleCategory', e.target.value as RoleCategory)}
                    >
                      {(Object.keys(ROLE_LABELS) as RoleCategory[]).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </Select>
                    <FieldHint>
                      Shapes how the draft frames the pitch later. Does not affect the score.
                    </FieldHint>
                  </div>
                </div>
              </div>

              {/* Why now */}
              <div className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate">
                  <Sparkles className="size-3.5" aria-hidden="true" />
                  Why now
                </div>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label htmlFor="signal">Signal type</Label>
                    <Select
                      id="signal"
                      value={form.signalType}
                      onChange={(e) => set('signalType', Number(e.target.value) as SignalId)}
                    >
                      {SIGNALS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.short} ({s.name})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label htmlFor="evidence">Signal evidence</Label>
                    <Textarea
                      id="evidence"
                      value={form.signalEvidence}
                      onChange={(e) => set('signalEvidence', e.target.value)}
                      onBlur={() => validateField('signalEvidence')}
                      rows={3}
                      error={Boolean(fieldErrors.signalEvidence)}
                      placeholder="One concrete factual line: what did you actually see that makes this worth a message?"
                    />
                    {fieldErrors.signalEvidence ? (
                      <FieldError>{fieldErrors.signalEvidence}</FieldError>
                    ) : (
                      <FieldFlag notes={form.confidenceNotes} field="signalEvidence" />
                    )}
                  </div>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <div className="flex items-center gap-1.5">
                      <Quote className="size-3.5 text-slate" aria-hidden="true" />
                      <Label htmlFor="quote">Verbatim quote (their words)</Label>
                    </div>
                    <Textarea
                      id="quote"
                      value={form.verbatimQuote}
                      onChange={(e) => set('verbatimQuote', e.target.value)}
                      rows={2}
                      placeholder="A short exact line, if you have one — this is what makes a draft feel personal."
                    />
                    <FieldFlag notes={form.confidenceNotes} field="verbatimQuote" />
                  </div>
                </div>
              </div>

              {form.aboutSummary || form.experienceSummary ? (
                <div className="rounded-2xl border border-line bg-paper-tint/40 p-5 sm:p-6">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate">
                    Extracted context — for your read, not scored
                  </p>
                  <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink">
                    {form.aboutSummary ? <p>{form.aboutSummary}</p> : null}
                    {form.experienceSummary ? (
                      <p className="text-slate">{form.experienceSummary}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
