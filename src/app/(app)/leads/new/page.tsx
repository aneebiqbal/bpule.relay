'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { FieldError } from '@/components/ui/field-message'
import { VerdictWord } from '@/components/status-word'
import { ScoreRing } from '@/components/score-ring'
import { signalById, SIGNALS } from '@/lib/score/signals'
import { computeScore } from '@/lib/score/rubric'
import { readSse } from '@/lib/sse/client'
import { cn } from 'cn'
import type { ExtractedLead, SignalId } from '@/lib/domain/types'

interface FormState {
  company: string
  contactName: string
  contactTitle: string
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
  url: '',
  signalType: 7,
  signalEvidence: '',
  verbatimQuote: '',
  rawInput: '',
  tags: [],
}

function verdictCall(verdict: 'send' | 'research_more' | 'skip'): string {
  if (verdict === 'send') return 'Worth your next thirty seconds. Save it and draft.'
  if (verdict === 'research_more')
    return 'Promising but thin. Add more research before you spend a minute on it.'
  return 'Not enough here to act on. Skip unless you add more.'
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

function StepHeading({
  n,
  title,
  hint,
}: {
  n: number
  title: string
  hint?: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gold text-xs font-medium text-paper">
        {n}
      </span>
      <div>
        <h2 className="text-base font-medium text-ink">{title}</h2>
        {hint ? <p className="mt-0.5 text-sm text-slate">{hint}</p> : null}
      </div>
    </div>
  )
}

export default function NewLeadPage() {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(INITIAL)
  const [extracting, setExtracting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [demoMode, setDemoMode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ company?: string; signalEvidence?: string }>({})
  const [blocked, setBlocked] = useState<{ reason?: string; existingOwnerName?: string } | null>(null)
  const rawRef = useRef<HTMLTextAreaElement | null>(null)

  const score = useMemo(() => {
    const lead: ExtractedLead = {
      name: form.contactName.trim() || null,
      title: form.contactTitle.trim() || null,
      company: form.company.trim() || 'Unnamed company',
      url: form.url.trim() || null,
      signalType: form.signalType,
      signalEvidence: form.signalEvidence,
      verbatimQuote: form.verbatimQuote.trim() || null,
      tags: form.tags,
    }
    return computeScore(lead)
  }, [form])

  const hasContent = Boolean(form.signalEvidence.trim() || form.company.trim())

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
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
        | { type: 'done'; extracted: ExtractedLead; demoMode: boolean }
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
            setForm((f) => ({
              ...f,
              company: ex.company?.trim() || f.company.trim() || f.company,
              contactName: ex.name?.trim() || f.contactName.trim() || f.contactName,
              contactTitle: ex.title?.trim() || f.contactTitle.trim() || f.contactTitle,
              url: ex.url?.trim() || f.url.trim() || f.url,
              signalType: ex.signalType ?? f.signalType,
              signalEvidence: ex.signalEvidence ?? f.signalEvidence,
              verbatimQuote: ex.verbatimQuote?.trim() ?? f.verbatimQuote,
              tags: ex.tags ?? [],
            }))
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
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-medium tracking-tight text-ink sm:text-3xl">New lead</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate">
          Paste raw research once. Relay extracts the fields, scores them with plain arithmetic
          against the rubric, and tells you whether the lead is worth your next thirty seconds.
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
            No GROQ_API_KEY is set, so extraction used the deterministic demo extractor. Fill in
            any rough edges by hand.
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="rounded-2xl border border-line bg-paper p-6">
        <StepHeading
          n={1}
          title="Paste the research"
          hint="A LinkedIn profile, a job post, an app store listing. Anything you found."
        />
        <div className="mt-4">
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
            rows={6}
            className="font-mono text-[13px]"
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate">Cmd / Ctrl + Enter to extract</span>
          <Button variant="gold" size="lg" onClick={() => void extract()} loading={extracting}>
            {extracting ? 'Extracting' : 'Extract'}
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-paper p-6">
        <StepHeading n={2} title="Check the fields" hint="Fix anything the extractor got wrong." />
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
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
            {fieldErrors.company ? <FieldError>{fieldErrors.company}</FieldError> : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="url">URL</Label>
            <Input
              id="url"
              value={form.url}
              onChange={(e) => set('url', e.target.value)}
              placeholder="https://"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="contact">Contact</Label>
            <Input
              id="contact"
              value={form.contactName}
              onChange={(e) => set('contactName', e.target.value)}
              placeholder="Name"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={form.contactTitle}
              onChange={(e) => set('contactTitle', e.target.value)}
              placeholder="CTO"
            />
          </div>
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
            />
            {fieldErrors.signalEvidence ? (
              <FieldError>{fieldErrors.signalEvidence}</FieldError>
            ) : null}
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="quote">Verbatim quote (their words)</Label>
            <Textarea
              id="quote"
              value={form.verbatimQuote}
              onChange={(e) => set('verbatimQuote', e.target.value)}
              rows={2}
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-paper p-6">
        <StepHeading
          n={3}
          title="Score and save"
          hint="Pure arithmetic, never a model call. The score is stored as-is so the queue orders by it."
        />
        <div className="mt-5 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-5">
            <ScoreRing score={score.total} size={88} />
            <div>
              <div className="flex items-center gap-3 text-sm">
                <VerdictWord verdict={score.verdict} />
              </div>
              <p className="mt-1 max-w-xs text-sm leading-relaxed text-ink">
                {verdictCall(score.verdict)}
              </p>
              <p className="mt-1 text-xs text-slate">
                {signalById(form.signalType)?.short} signal, plus completeness.
              </p>
            </div>
          </div>
          <ul className="w-full space-y-2 sm:max-w-sm">
            {score.breakdown.map((item) => {
              const frac = item.max > 0 ? item.points / item.max : 0
              return (
                <li key={item.category + item.label} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-slate">{item.label}</span>
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
        </div>

        <div className="mt-6 flex items-center justify-end border-t border-line pt-5">
          <Button
            variant="gold"
            size="lg"
            onClick={() => void save()}
            disabled={saving || extracting || !hasContent}
            loading={saving}
          >
            {saving ? 'Saving' : 'Save lead'}
          </Button>
        </div>
      </section>
    </div>
  )
}
