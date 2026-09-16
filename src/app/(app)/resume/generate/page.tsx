'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { FileText, RefreshCw, AlertTriangle, ArrowLeft, Sparkles } from 'lucide-react'
import type { Profile } from '@/lib/domain/types'

type ResumeResult = {
  resume: {
    name: string
    title: string
    summary: string
    skills: string[]
    experience: { company: string; role: string; period: string; bullets: string[] }[]
    projects: { name: string; description: string; technologies: string[]; outcome: string | null }[]
    education: string[]
    certifications: string[]
  }
  score: number
  dimensions: { label: string; score: number; max: number; note: string }[]
  missing: string[]
  profile: { id: string; label: string | null }
}

export default function ResumeGeneratePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-4xl p-5">Loading...</div>}>
      <ResumeGenerateInner />
    </Suspense>
  )
}

function ResumeGenerateInner() {
  const searchParams = useSearchParams()
  const leadId = searchParams.get('leadId')
  const jobId = searchParams.get('jobId')

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [jobTitle, setJobTitle] = useState('')
  const [targetSkills, setTargetSkills] = useState('')
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<ResumeResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/profiles')
      .then((r) => (r.ok ? r.json() : { profiles: [] }))
      .then((data: { profiles: Profile[] }) => {
        setProfiles(data.profiles ?? [])
        if (data.profiles && data.profiles.length > 0) setSelectedProfileId(data.profiles[0].id)
      })
      .catch(() => {})
  }, [])

  async function generate() {
    if (!selectedProfileId) {
      setError('Select a Revenue Identity first.')
      return
    }
    setGenerating(true)
    setError(null)
    setResult(null)
    try {
      const skills = targetSkills.split(',').map((s) => s.trim()).filter(Boolean)
      const res = await fetch('/api/resume/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: selectedProfileId,
          leadId,
          jobId,
          targetTitle: jobTitle || null,
          targetSkills: skills.length > 0 ? skills : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed.')
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed.')
    } finally {
      setGenerating(false)
    }
  }

  const scoreColor = (score: number) => {
    if (score >= 80) return 'text-status-success'
    if (score >= 60) return 'text-orange'
    return 'text-status-danger'
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
        <Link href={leadId ? `/leads/${leadId}` : jobId ? `/upwork/${jobId}` : '/dashboard'} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 -ml-2 text-sm text-graphite transition-colors hover:bg-bone hover:text-ink">
          <ArrowLeft className="size-4" />
          Back
        </Link>
        <p className="mt-3 text-mono-medium text-[10px] uppercase tracking-[0.14em]">Resume Tailoring</p>
        <h1 className="mt-2 text-[30px] leading-[1.05] tracking-[-0.03em]">Truthful job-specific CV</h1>
        <p className="mt-2 max-w-2xl text-[13px]">
          Relay reorganizes and emphasizes verified proof from the selected identity. No fabrication — only selection, ordering, and emphasis.
        </p>
      </section>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-status-danger/30 bg-status-danger/5 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-danger" />
          <p className="text-[13px] text-status-danger">{error}</p>
        </div>
      )}

      {/* Configuration */}
      <div className="rounded border border-line bg-bone-raised p-5 space-y-4">
        <h2 className="text-sm font-medium text-ink">Target job context</h2>

        {profiles.length > 0 ? (
          <div>
            <label className="text-label text-stone">Revenue Identity (profile)</label>
            <select value={selectedProfileId ?? ''} onChange={(e) => setSelectedProfileId(e.target.value || null)}
              className="mt-1.5 w-full rounded-lg border border-line bg-bone p-2.5 text-[14px] text-ink focus:border-orange focus:outline-none">
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.label ?? p.headline ?? 'Unnamed'} ({p.platform})</option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-sm text-graphite">
            <Link href="/profiles" className="text-orange underline-offset-4 hover:underline">Add a profile</Link> to generate tailored resumes.
          </p>
        )}

        <div>
          <label className="text-label text-stone">Job title (optional)</label>
          <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)}
            placeholder="e.g. Senior Rails Developer"
            className="mt-1.5 w-full rounded-lg border border-line bg-bone p-2.5 text-[14px] text-ink placeholder:text-stone/50 focus:border-orange focus:outline-none" />
        </div>

        <div>
          <label className="text-label text-stone">Target skills (comma-separated)</label>
          <input value={targetSkills} onChange={(e) => setTargetSkills(e.target.value)}
            placeholder="Rails, PostgreSQL, API design, Marketplace"
            className="mt-1.5 w-full rounded-lg border border-line bg-bone p-2.5 text-[14px] text-ink placeholder:text-stone/50 focus:border-orange focus:outline-none" />
        </div>

        <button onClick={void generate} disabled={generating || !selectedProfileId}
          className="inline-flex items-center gap-2 rounded-lg bg-orange px-4 py-2 text-[13px] font-medium text-bone transition-all hover:bg-orange-dark active:scale-[0.97] disabled:opacity-50">
          {generating ? <RefreshCw className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {generating ? 'Tailoring...' : 'Generate tailored CV'}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="space-y-5">
          {/* ATS Score */}
          <div className="rounded border border-line bg-bone-raised p-5">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-orange" />
              <h2 className="text-sm font-medium text-ink">ATS Readiness</h2>
            </div>
            <div className="mt-3 flex items-baseline gap-3">
              <span className={`text-[32px] font-medium ${scoreColor(result.score)}`}>{result.score}</span>
              <span className="text-sm text-graphite">/ 100</span>
            </div>
            <div className="mt-3 space-y-2">
              {result.dimensions.map((d) => (
                <div key={d.label}>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-graphite">{d.label}</span>
                    <span className="font-mono text-ink">{d.score}/{d.max}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bone">
                    <div className={cn('h-full rounded-full', d.score / d.max >= 0.8 ? 'bg-status-success' : d.score / d.max >= 0.5 ? 'bg-orange' : 'bg-status-danger')}
                      style={{ width: `${Math.max((d.score / d.max) * 100, 8)}%` }} />
                  </div>
                  <p className="mt-0.5 text-[11px] text-stone">{d.note}</p>
                </div>
              ))}
            </div>

            {result.missing.length > 0 && (
              <div className="mt-4 rounded-lg border border-status-warning/30 bg-status-warning/5 p-3">
                <p className="text-xs font-medium text-status-warning">Missing / weak coverage</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {result.missing.map((m) => (
                    <span key={m} className="rounded bg-bone px-1.5 py-0.5 text-[10px] text-graphite">{m}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Resume content */}
          <div className="rounded border border-line bg-bone-raised p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-ink">Tailored CV — {result.resume.name}</h2>
              <span className="text-[11px] text-graphite">Based on: {result.profile.label ?? 'Profile'}</span>
            </div>

            <div className="border-b border-line pb-3">
              <p className="text-[15px] font-medium text-ink">{result.resume.name}</p>
              <p className="text-sm text-graphite">{result.resume.title}</p>
              <p className="mt-2 text-sm text-ink">{result.resume.summary}</p>
            </div>

            {result.resume.skills.length > 0 && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-stone">Skills</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {result.resume.skills.map((s) => (
                    <span key={s} className="rounded bg-orange/8 px-1.5 py-0.5 text-[10px] text-orange ring-1 ring-orange/10">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {result.resume.experience.length > 0 && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-stone">Experience</p>
                <div className="mt-2 space-y-3">
                  {result.resume.experience.map((exp, i) => (
                    <div key={i}>
                      <p className="text-sm font-medium text-ink">{exp.role} <span className="text-graphite">· {exp.company}</span></p>
                      {exp.bullets.map((b, j) => (
                        <p key={j} className="mt-0.5 text-xs text-graphite pl-3">• {b}</p>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.resume.projects.length > 0 && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-stone">Projects</p>
                <div className="mt-2 space-y-2">
                  {result.resume.projects.map((p, i) => (
                    <div key={i} className="rounded border border-line/60 p-2">
                      <p className="text-sm font-medium text-ink">{p.name}</p>
                      <p className="text-xs text-graphite">{p.description}</p>
                      {p.technologies.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {p.technologies.map((t) => (
                            <span key={t} className="rounded bg-bone px-1 py-0.5 text-[9px] text-stone">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}
