/**
 * Upwork V2 — focused proposal workspace.
 *
 * Replaces the legacy Jobs section. Paste a job page, select a profile,
 * generate proposal + screening answers.
 */

'use client'

import { useState } from 'react'

interface UpworkJob {
  id: string
  title: string
  description: string
  skills: string[]
  budget: number | null
  budgetType: string | null
  hourlyRateMin: number | null
  hourlyRateMax: number | null
  experienceLevel: string | null
  screeningQuestions: string[]
}

interface UpworkApplication {
  coverLetter: string
  questionAnswers: Array<{ question: string; answer: string }>
  fitScore: number
  fitReason: string
  risks: string[]
  matchedProof: Array<{ title: string; description: string }>
}

interface Profile {
  id: string
  identity_name: string
  skills: string[]
}

export default function UpworkPage() {
  const [rawText, setRawText] = useState('')
  const [job, setJob] = useState<UpworkJob | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [application, setApplication] = useState<UpworkApplication | null>(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'paste' | 'profile' | 'result'>('paste')

  async function handleExtract() {
    if (rawText.length < 50) return
    setLoading(true)
    try {
      const res = await fetch('/api/upwork/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText }),
      })
      if (res.ok) {
        const data = await res.json()
        setJob(data.job)
        setStep('profile')
        // Load profiles
        const profRes = await fetch('/api/profiles')
        if (profRes.ok) {
          const profData = await profRes.json()
          setProfiles(profData.profiles || [])
        }
      }
    } catch (err) {
      console.error('Extract failed:', err)
    }
    setLoading(false)
  }

  async function handleGenerate() {
    if (!job || !selectedProfileId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/upwork/${job.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, profileId: selectedProfileId }),
      })
      if (res.ok) {
        const data = await res.json()
        setApplication(data.application)
        setStep('result')
      }
    } catch (err) {
      console.error('Generate failed:', err)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold text-neutral-900 mb-2">Upwork</h1>
        <p className="text-sm text-neutral-500 mb-6">Paste a job page, select a profile, generate your proposal.</p>

        {/* Step 1: Paste */}
        {step === 'paste' && (
          <div className="bg-white rounded-lg border border-neutral-200 p-6">
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Paste the complete Upwork job page
            </label>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste the full Upwork job description here..."
              className="w-full h-64 px-3 py-2 border border-neutral-200 rounded-lg text-sm resize-none"
            />
            <button
              onClick={handleExtract}
              disabled={rawText.length < 50 || loading}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Extracting...' : 'Extract Job'}
            </button>
          </div>
        )}

        {/* Step 2: Select Profile */}
        {step === 'profile' && job && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <h2 className="font-medium text-neutral-900">{job.title}</h2>
              <div className="flex gap-4 mt-2 text-sm text-neutral-500">
                {job.budget && <span>Budget: ${job.budget} {job.budgetType}</span>}
                {job.experienceLevel && <span>Level: {job.experienceLevel}</span>}
                {job.skills.length > 0 && <span>Skills: {job.skills.slice(0, 5).join(', ')}</span>}
              </div>
              {job.screeningQuestions.length > 0 && (
                <div className="mt-3 p-3 bg-amber-50 rounded border border-amber-200">
                  <span className="text-sm font-medium text-amber-800">
                    {job.screeningQuestions.length} screening question(s) detected
                  </span>
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <label className="block text-sm font-medium text-neutral-700 mb-3">
                Apply as profile:
              </label>
              <div className="space-y-2">
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProfileId(p.id)}
                    className={`w-full text-left px-3 py-2 rounded border text-sm ${
                      selectedProfileId === p.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-neutral-200 hover:bg-neutral-50'
                    }`}
                  >
                    <span className="font-medium">{p.identity_name}</span>
                    <span className="text-neutral-500 ml-2">({p.skills?.slice(0, 3).join(', ')})</span>
                  </button>
                ))}
              </div>
              <button
                onClick={handleGenerate}
                disabled={!selectedProfileId || loading}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {loading ? 'Generating...' : 'Generate Proposal'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Result */}
        {step === 'result' && application && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-medium text-neutral-900">Proposal</h2>
                <span className="text-sm px-2 py-1 bg-neutral-100 rounded">
                  Fit: {application.fitScore}/100
                </span>
              </div>
              <div className="text-sm text-neutral-700 whitespace-pre-wrap">
                {application.coverLetter}
              </div>
            </div>

            {application.questionAnswers.length > 0 && (
              <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h3 className="font-medium text-neutral-900 mb-3">Screening Questions</h3>
                <div className="space-y-3">
                  {application.questionAnswers.map((qa, i) => (
                    <div key={i}>
                      <p className="text-sm font-medium text-neutral-700">{i + 1}. {qa.question}</p>
                      <p className="text-sm text-neutral-600 mt-1">{qa.answer}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {application.risks.length > 0 && (
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-4">
                <h3 className="font-medium text-amber-800 mb-2">Risks</h3>
                <ul className="text-sm text-amber-700 space-y-1">
                  {application.risks.map((r, i) => <li key={i}>• {r}</li>)}
                </ul>
              </div>
            )}

            <button
              onClick={() => { setStep('paste'); setJob(null); setApplication(null); setRawText('') }}
              className="text-sm text-neutral-500 hover:text-neutral-700"
            >
              ← New job
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
