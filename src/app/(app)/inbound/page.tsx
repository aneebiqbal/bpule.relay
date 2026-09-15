'use client'

import { useState, useTransition } from 'react'
import {
  ArrowLeft,
  MessageCircle,
  User,
  Building2,
  Link2,
  Sparkles,
  Send,
  Save,
  FileText,
  UserCheck,
  X,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import Link from 'next/link'
import type { InboundIntelligence, LeadSource } from '@/lib/domain/types'

type AnalysisState = 'idle' | 'analyzing' | 'done' | 'error'

export default function InboundPage() {
  const [message, setMessage] = useState('')
  const [source, setSource] = useState<LeadSource>('other')
  const [company, setCompany] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactTitle, setContactTitle] = useState('')
  const [url, setUrl] = useState('')
  const [profileInfo, setProfileInfo] = useState('')
  const [jobInfo, setJobInfo] = useState('')
  const [context, setContext] = useState('')

  const [analysisState, setAnalysisState] = useState<AnalysisState>('idle')
  const [intelligence, setIntelligence] = useState<InboundIntelligence | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [leadId, setLeadId] = useState<string | null>(null)

  const [isPending, startTransition] = useTransition()

  function reset() {
    setAnalysisState('idle')
    setIntelligence(null)
    setError(null)
    setSaved(false)
    setLeadId(null)
  }

  async function analyze() {
    if (!message.trim()) {
      setError('Please paste the client\'s message.')
      return
    }

    setAnalysisState('analyzing')
    setError(null)
    setIntelligence(null)

    try {
      const res = await fetch('/api/inbound/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          source,
          company: company.trim() || null,
          contactName: contactName.trim() || null,
          contactTitle: contactTitle.trim() || null,
          url: url.trim() || null,
          profileInfo: profileInfo.trim() || null,
          jobInfo: jobInfo.trim() || null,
          context: context.trim() || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Analysis failed.')
      }

      const data = await res.json()
      setIntelligence(data.intelligence)
      setAnalysisState('done')

      if (data.extracted?.company && !company) setCompany(data.extracted.company)
      if (data.extracted?.contactName && !contactName) setContactName(data.extracted.contactName)
      if (data.extracted?.contactTitle && !contactTitle) setContactTitle(data.extracted.contactTitle)
      if (data.extracted?.url && !url) setUrl(data.extracted.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed.')
      setAnalysisState('error')
    }
  }

  async function saveAsLead() {
    if (!intelligence) return

    try {
      const res = await fetch('/api/inbound/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: company.trim() || (intelligence.recommendedIdentity?.label ?? 'Unknown'),
          contactName: contactName.trim() || null,
          contactTitle: contactTitle.trim() || null,
          url: url.trim() || null,
          message: message.trim(),
          source,
          profileInfo: profileInfo.trim() || null,
          jobInfo: jobInfo.trim() || null,
          context: context.trim() || null,
          assignedProfileId: intelligence.recommendedIdentity?.id ?? null,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to save lead.')
      }

      const data = await res.json()
      setLeadId(data.lead.id)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save lead.')
    }
  }

  function fitColor(score: number): string {
    if (score >= 70) return 'text-status-success'
    if (score >= 40) return 'text-orange'
    return 'text-stone'
  }

  function qualityColor(q: string): string {
    if (q === 'high') return 'bg-status-success/10 text-status-success'
    if (q === 'medium') return 'bg-orange/10 text-orange'
    return 'bg-stone/10 text-stone'
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex size-9 items-center justify-center rounded-lg border border-line transition-colors hover:bg-bone"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="text-display text-[24px] text-ink">Add Inbound</h1>
            <p className="text-[13px] text-graphite">
              A client contacted you first. Relay will analyze and prepare a response.
            </p>
          </div>
        </div>
      </div>

      {/* Input form */}
      <div className="rounded-xl border border-line bg-bone-raised p-5 space-y-4">
        <div>
          <label className="text-label text-stone">Client's message *</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Paste the client's incoming message here..."
            className="mt-1.5 w-full rounded-lg border border-line bg-bone p-3 text-[14px] text-ink placeholder:text-stone/50 focus:border-orange focus:outline-none min-h-[120px] resize-y"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-label text-stone">Source</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as LeadSource)}
              className="mt-1.5 w-full rounded-lg border border-line bg-bone p-2.5 text-[14px] text-ink focus:border-orange focus:outline-none"
            >
              <option value="linkedin">LinkedIn</option>
              <option value="upwork">Upwork</option>
              <option value="email">Email</option>
              <option value="referral">Referral</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="text-label text-stone">
              <Building2 className="mr-1 inline size-3" />Company
            </label>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Client's company"
              className="mt-1.5 w-full rounded-lg border border-line bg-bone p-2.5 text-[14px] text-ink placeholder:text-stone/50 focus:border-orange focus:outline-none"
            />
          </div>
          <div>
            <label className="text-label text-stone">
              <User className="mr-1 inline size-3" />Contact name
            </label>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Who contacted you"
              className="mt-1.5 w-full rounded-lg border border-line bg-bone p-2.5 text-[14px] text-ink placeholder:text-stone/50 focus:border-orange focus:outline-none"
            />
          </div>
          <div>
            <label className="text-label text-stone">
              <User className="mr-1 inline size-3" />Title / role
            </label>
            <input
              value={contactTitle}
              onChange={(e) => setContactTitle(e.target.value)}
              placeholder="Their role"
              className="mt-1.5 w-full rounded-lg border border-line bg-bone p-2.5 text-[14px] text-ink placeholder:text-stone/50 focus:border-orange focus:outline-none"
            />
          </div>
        </div>

        <details className="group">
          <summary className="cursor-pointer text-[13px] font-medium text-graphite hover:text-ink">
            Additional context (optional)
          </summary>
          <div className="mt-3 space-y-3">
            <div>
              <label className="text-label text-stone">
                <Link2 className="mr-1 inline size-3" />URL
              </label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Profile, job post, or company URL"
                className="mt-1.5 w-full rounded-lg border border-line bg-bone p-2.5 text-[14px] text-ink placeholder:text-stone/50 focus:border-orange focus:outline-none"
              />
            </div>
            <div>
              <label className="text-label text-stone">Profile info</label>
              <textarea
                value={profileInfo}
                onChange={(e) => setProfileInfo(e.target.value)}
                placeholder="Paste LinkedIn profile summary or bio..."
                className="mt-1.5 w-full rounded-lg border border-line bg-bone p-2.5 text-[14px] text-ink placeholder:text-stone/50 focus:border-orange focus:outline-none min-h-[80px] resize-y"
              />
            </div>
            <div>
              <label className="text-label text-stone">Job info</label>
              <textarea
                value={jobInfo}
                onChange={(e) => setJobInfo(e.target.value)}
                placeholder="Paste job description if applicable..."
                className="mt-1.5 w-full rounded-lg border border-line bg-bone p-2.5 text-[14px] text-ink placeholder:text-stone/50 focus:border-orange focus:outline-none min-h-[80px] resize-y"
              />
            </div>
            <div>
              <label className="text-label text-stone">Other context</label>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Any other relevant information..."
                className="mt-1.5 w-full rounded-lg border border-line bg-bone p-2.5 text-[14px] text-ink placeholder:text-stone/50 focus:border-orange focus:outline-none min-h-[60px] resize-y"
              />
            </div>
          </div>
        </details>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-status-danger/30 bg-status-danger/5 p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-danger" />
            <p className="text-[13px] text-status-danger">{error}</p>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={analyze}
            disabled={!message.trim() || analysisState === 'analyzing'}
            className="inline-flex items-center gap-2 rounded-lg bg-orange px-4 py-2 text-[13px] font-medium text-bone transition-all hover:bg-orange-dark active:scale-[0.97] disabled:opacity-50"
          >
            {analysisState === 'analyzing' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {analysisState === 'analyzing' ? 'Analyzing...' : 'Analyze'}
          </button>
          {analysisState === 'done' && (
            <button
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-ink transition-all hover:bg-bone"
            >
              <X className="size-4" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Intelligence display */}
      {intelligence && (
        <div className="rounded-xl border border-line bg-bone-raised p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-orange" />
            <h2 className="text-heading text-lg text-ink">Inbound Intelligence</h2>
          </div>

          {/* What they want */}
          <div>
            <p className="text-label text-stone">What they want</p>
            <p className="mt-1 text-[14px] text-ink">{intelligence.wants}</p>
          </div>

          {/* Intent + Fit */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-label text-stone">Intent</p>
              <p className="mt-1 text-[14px] text-ink capitalize">{intelligence.intent}</p>
            </div>
            <div>
              <p className="text-label text-stone">Fit score</p>
              <p className={`mt-1 text-[18px] font-semibold ${fitColor(intelligence.fitScore)}`}>
                {intelligence.fitScore}%
                <span className="ml-2 text-[12px] font-normal text-stone">
                  {intelligence.opportunityQuality} quality
                </span>
              </p>
            </div>
          </div>

          {/* Recommended Identity */}
          {intelligence.recommendedIdentity && (
            <div className="rounded-lg border border-line bg-bone p-3">
              <p className="text-label text-stone">Recommended Revenue Identity</p>
              <p className="mt-1 text-[14px] font-medium text-ink">
                {intelligence.recommendedIdentity.label ?? intelligence.recommendedIdentity.platform}
              </p>
              <p className="mt-0.5 text-[12px] text-graphite">{intelligence.identityFitReason}</p>
              {intelligence.matchingSkills.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {intelligence.matchingSkills.slice(0, 6).map((skill) => (
                    <span key={skill} className="rounded bg-bone-raised px-1.5 py-0.5 text-[10px] text-graphite">
                      {skill}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Strongest proof */}
          {intelligence.strongestProof.length > 0 && (
            <div>
              <p className="text-label text-stone">Strongest relevant proof</p>
              <div className="mt-2 space-y-2">
                {intelligence.strongestProof.map((p) => (
                  <div key={p.id} className="rounded-lg border border-line bg-bone p-3">
                    <p className="text-[13px] text-ink">{p.projectSummary}</p>
                    {p.reviewQuote && (
                      <p className="mt-1 text-[12px] text-graphite italic">
                        &ldquo;{p.reviewQuote.slice(0, 120)}&rdquo;
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Missing info */}
          {intelligence.missingInfo.length > 0 && (
            <div>
              <p className="text-label text-stone">Missing information</p>
              <ul className="mt-1 space-y-1">
                {intelligence.missingInfo.map((info) => (
                  <li key={info} className="flex items-start gap-2 text-[13px] text-graphite">
                    <AlertTriangle className="mt-0.5 size-3 shrink-0 text-orange" />
                    {info}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommended action */}
          <div className="rounded-lg bg-orange/5 border border-orange/20 p-3">
            <p className="text-label text-orange">Recommended action</p>
            <p className="mt-1 text-[14px] text-ink">{intelligence.recommendedAction}</p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {saved ? (
              <div className="flex items-center gap-2 rounded-lg bg-status-success/10 px-4 py-2 text-[13px] text-status-success">
                <CheckCircle2 className="size-4" />
                Lead saved
              </div>
            ) : (
              <button
                onClick={saveAsLead}
                className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-bone transition-all hover:bg-ink/90 active:scale-[0.97]"
              >
                <Save className="size-4" />
                Save as Lead
              </button>
            )}

            {leadId && (
              <Link
                href={`/leads/${leadId}`}
                className="inline-flex items-center gap-2 rounded-lg bg-orange px-4 py-2 text-[13px] font-medium text-bone transition-all hover:bg-orange-dark active:scale-[0.97]"
              >
                <Send className="size-4" />
                Open Lead & Reply
              </Link>
            )}

            {intelligence.canGenerateResume && leadId && (
              <Link
                href={`/resume/generate?leadId=${leadId}`}
                className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-ink transition-all hover:bg-bone"
              >
                <FileText className="size-4" />
                Generate Resume
              </Link>
            )}

            {intelligence.recommendedIdentity && !saved && (
              <span className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[12px] text-graphite">
                <UserCheck className="size-3" />
                Identity: {intelligence.recommendedIdentity.label ?? intelligence.recommendedIdentity.platform}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
