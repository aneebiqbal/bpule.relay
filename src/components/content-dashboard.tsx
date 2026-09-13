'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, PenLine, ChevronRight, Check, ArrowRight, ArrowLeft } from 'lucide-react'
import { cn } from 'cn'
import { StudioBrand } from '@/components/studio-brand'
import type { ContentPersona, TopicCluster, ContentDraft } from '@/lib/domain/types'
import type { OnboardingQuestion } from '@/lib/ai/onboarding-questions'

interface PersonaWithExtras extends ContentPersona {
  topicClusters: TopicCluster[]
  drafts: ContentDraft[]
}

export function ContentDashboard({ personas }: { personas: PersonaWithExtras[] }) {
  const [showNewPersona, setShowNewPersona] = useState(false)

  return (
    <div className="space-y-8">
      <header className="reveal-up flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-2">
          <StudioBrand />
          <p className="text-[15px] text-slate">
            Real material, shaped into your voice. Never invented, never generic.
          </p>
        </div>
        <button
          onClick={() => setShowNewPersona(true)}
          className="group inline-flex items-center gap-2.5 rounded-2xl gradient-studio px-5 py-3 text-sm font-semibold text-paper shadow-studio transition-all duration-300 hover:brightness-110 active:scale-[0.97]"
        >
          <Plus className="size-4 transition-transform duration-300 group-hover:rotate-90" aria-hidden="true" />
          New persona
        </button>
      </header>

      {showNewPersona && (
        <NewPersonaForm onClose={() => setShowNewPersona(false)} />
      )}

      {personas.length === 0 ? (
        <section className="reveal-up stagger-2 rounded-[1.75rem] border border-dashed border-line bg-surface-raised p-14 text-center">
          <div className="mx-auto max-w-sm space-y-4">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-gold/12 to-gold/4 ring-1 ring-gold/10">
              <PenLine className="size-6 text-gold" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <p className="text-heading text-lg text-ink">No personas yet.</p>
              <p className="text-sm leading-relaxed text-slate">
                Paste a profile or bio, run voice calibration, and capture real material. The app handles the organization in the background.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <div className="space-y-4">
          {personas.map((persona, i) => (
            <article
              key={persona.id}
              className="reveal-up slide-in-right overflow-hidden rounded-[1.25rem] border border-line/60 bg-surface-raised"
              style={{ animationDelay: `${0.05 + i * 0.04}s` }}
            >
              <div className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="flex items-center gap-4">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-gold/15 to-gold/5">
                    <PenLine className="size-5 text-gold" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-heading text-base text-ink">{persona.displayName}</h2>
                    <p className="text-xs text-slate">
                      {persona.topicClusters.length} subject{persona.topicClusters.length === 1 ? '' : 's'} &middot; {persona.platforms.join(', ')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {persona.drafts.filter((d) => d.status === 'draft').length > 0 && (
                    <span className="rounded-full bg-gold/10 px-2.5 py-1 text-mono-medium text-[10px] text-gold">
                      {persona.drafts.filter((d) => d.status === 'draft').length} draft{persona.drafts.filter((d) => d.status === 'draft').length === 1 ? '' : 's'}
                    </span>
                  )}
                  <Link
                    href={`/content/${persona.id}`}
                    className="group inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-paper transition-all hover:bg-ink/90 hover:shadow-md active:scale-[0.97]"
                  >
                    Open
                    <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              {persona.topicClusters.length > 0 && (
                <div className="border-t border-line/40 px-5 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {persona.topicClusters.slice(0, 5).map((p) => (
                      <span key={p.id} className="rounded-lg bg-paper-tint/60 px-2 py-0.5 text-[11px] text-ink-soft">
                        {p.clusterName}
                      </span>
                    ))}
                    {persona.topicClusters.length > 5 && (
                      <span className="rounded-lg bg-paper-tint/60 px-2 py-0.5 text-[11px] text-slate">
                        +{persona.topicClusters.length - 5} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

type WizardStep = 'profile' | 'loading-questions' | 'questions' | 'voice' | 'creating'

const HUMOR_STYLES = ['Dry / deadpan', 'Playful', 'Sarcastic', 'Mostly serious', 'None of these']

const ADMIRED_STYLES = [
  'Short, punchy one-liners',
  'Long-form storytelling',
  'Data-and-numbers driven',
  'Blunt, no-fluff takes',
  'Warm and personal',
]

function NewPersonaForm({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<WizardStep>('profile')
  const [name, setName] = useState('')
  const [platforms, setPlatforms] = useState<string[]>([])
  const [profileInput, setProfileInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [questions, setQuestions] = useState<OnboardingQuestion[]>([])
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [otherOpen, setOtherOpen] = useState<Record<string, boolean>>({})

  const [humorStyle, setHumorStyle] = useState('')
  const [humorOtherOpen, setHumorOtherOpen] = useState(false)
  const [admiredStyles, setAdmiredStyles] = useState<string[]>([])
  const [admiredOtherOpen, setAdmiredOtherOpen] = useState(false)
  const [admiredOther, setAdmiredOther] = useState('')

  function toggleAdmiredStyle(style: string) {
    setAdmiredStyles((prev) => prev.includes(style) ? prev.filter((s) => s !== style) : [...prev, style])
  }

  function togglePlatform(p: string) {
    setPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])
  }

  async function goToQuestions() {
    if (!name.trim()) { setError('Give this persona a name.'); return }
    if (platforms.length === 0) { setError('Pick at least one platform.'); return }
    if (!profileInput.trim()) { setError('Paste a LinkedIn URL or a short bio.'); return }
    setError(null)
    setStep('loading-questions')
    try {
      const res = await fetch('/api/content/onboarding-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileInput: profileInput.trim() }),
      })
      const data = await res.json().catch(() => null)
      const generated: OnboardingQuestion[] = Array.isArray(data?.questions) ? data.questions : []
      setQuestions(generated)
      setCurrentQuestion(0)
      // No host available or nothing generated — skip straight to the voice step.
      setStep(generated.length === 0 ? 'voice' : 'questions')
    } catch {
      setStep('voice')
    }
  }

  function pick(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

  async function create(valuesAndOpinions: string[], humor: string, admiredExamples: string[]) {
    setStep('creating')
    setError(null)
    try {
      const res = await fetch('/api/content/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: name.trim(),
          platforms,
          profileInput: profileInput.trim(),
          valuesAndOpinions,
          humorStyle: humor,
          admiredExamples,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create persona.')
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create persona.')
      setStep('voice')
    }
  }

  function pendingValuesAndOpinions(): string[] {
    return questions
      .map((q) => {
        const val = answers[q.id]
        if (!val || !val.trim()) return null
        return `${q.prompt} ${val.trim()}`
      })
      .filter((v): v is string => Boolean(v))
  }

  function finishQuestions() {
    setStep('voice')
  }

  function finishVoice() {
    const admiredExamples = [
      ...admiredStyles,
      ...(admiredOther.trim() ? [admiredOther.trim()] : []),
    ]
    void create(pendingValuesAndOpinions(), humorStyle, admiredExamples)
  }

  return (
    <section className="reveal-up rounded-2xl border border-studio/25 bg-surface-raised p-6 shadow-studio/20">
      {error && (
        <p className="mb-3 text-sm text-status-no" role="alert">{error}</p>
      )}

      {step === 'profile' && (
        <>
          <h2 className="text-heading text-base text-ink">New persona</h2>
          <p className="mt-1 text-sm text-slate">Paste a profile. Studio will ask a few quick tap questions next, tailored to what it finds.</p>

          <div className="mt-4 grid gap-4">
            <div className="grid gap-1.5">
              <label htmlFor="persona-name" className="text-sm font-medium text-ink-soft">Display name</label>
              <input
                id="persona-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Madiha, Hassan"
                className="h-9 w-full rounded-xl border border-line bg-paper-raised px-3 text-sm transition-all outline-none focus-visible:border-studio/40 focus-visible:ring-2 focus-visible:ring-studio/20"
              />
            </div>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium text-ink-soft">Platforms</span>
              <div className="flex gap-2">
                {['linkedin', 'x'].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p)}
                    className={cn(
                      'rounded-xl border px-4 py-2 text-sm font-medium transition-all',
                      platforms.includes(p)
                        ? 'border-studio/30 bg-studio/8 text-studio'
                        : 'border-line bg-paper-raised text-slate hover:bg-paper-tint',
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="profile-input" className="text-sm font-medium text-ink-soft">LinkedIn URL or bio</label>
              <textarea
                id="profile-input"
                value={profileInput}
                onChange={(e) => setProfileInput(e.target.value)}
                rows={4}
                placeholder="Paste a LinkedIn profile URL, About section, or short bio."
                className="w-full rounded-xl border border-line bg-paper-raised px-3 py-2 text-sm transition-all outline-none focus-visible:border-studio/40 focus-visible:ring-2 focus-visible:ring-studio/20"
              />
            </div>
          </div>

          <div className="mt-5 flex items-center justify-end gap-3">
            <button onClick={onClose} className="rounded-xl border border-line px-4 py-2 text-sm text-slate transition-colors hover:bg-paper-tint">
              Cancel
            </button>
            <button
              onClick={() => void goToQuestions()}
              className="inline-flex items-center gap-2 rounded-xl gradient-studio px-5 py-2 text-sm font-semibold text-paper transition-all hover:brightness-110"
            >
              Continue
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </>
      )}

      {step === 'loading-questions' && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="size-8 animate-spin rounded-full border-2 border-studio/20 border-t-studio" />
          <p className="text-sm text-slate">Reading the profile, shaping a few questions...</p>
        </div>
      )}

      {step === 'questions' && questions.length > 0 && (() => {
        const idx = Math.min(Math.max(currentQuestion, 0), questions.length - 1)
        const q = questions[idx]
        return (
          <>
            {/* Progress indicator */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-studio-light">Generated for you</span>
                <span className="text-xs text-slate">{idx + 1} of {questions.length}</span>
              </div>
              <div className="flex gap-1">
                {questions.map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      'h-1 flex-1 rounded-full transition-colors',
                      i < idx ? 'bg-studio/40' : i === idx ? 'bg-studio' : 'bg-line/60',
                    )}
                  />
                ))}
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <p className="text-heading text-lg text-ink">{q.prompt}</p>
              <div className="flex flex-col gap-2">
                {q.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => { pick(q.id, opt); if (idx < questions.length - 1) setCurrentQuestion(idx + 1) }}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all',
                      answers[q.id] === opt
                        ? 'border-studio/30 bg-studio/10 text-studio'
                        : 'border-line bg-paper-raised text-slate hover:bg-paper-tint hover:text-ink',
                    )}
                  >
                    {answers[q.id] === opt && <Check className="size-4 shrink-0" aria-hidden="true" />}
                    {opt}
                  </button>
                ))}
                {otherOpen[q.id] ? (
                  <input
                    autoFocus
                    value={answers[q.id] && !q.options.includes(answers[q.id]) ? answers[q.id] : ''}
                    onChange={(e) => pick(q.id, e.target.value)}
                    onBlur={() => { if (answers[q.id]?.trim() && idx < questions.length - 1) setCurrentQuestion(idx + 1) }}
                    placeholder="Type your own answer"
                    className="h-12 w-full rounded-xl border border-studio/30 bg-paper-raised px-4 text-sm outline-none focus-visible:border-studio/40 focus-visible:ring-2 focus-visible:ring-studio/20"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setOtherOpen((prev) => ({ ...prev, [q.id]: true }))}
                    className="rounded-xl border border-dashed border-line px-4 py-3 text-left text-sm text-slate transition-colors hover:border-studio/40 hover:text-studio"
                  >
                    Other, let me type it
                  </button>
                )}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                onClick={() => idx === 0 ? setStep('profile') : setCurrentQuestion(idx - 1)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2 text-sm text-slate transition-colors hover:bg-paper-tint"
              >
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                {idx === 0 ? 'Back' : 'Previous'}
              </button>
              {idx < questions.length - 1 ? (
                <button
                  onClick={() => setCurrentQuestion(idx + 1)}
                  className="inline-flex items-center gap-2 rounded-xl gradient-studio px-5 py-2 text-sm font-semibold text-paper transition-all hover:brightness-110"
                >
                  Next
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </button>
              ) : (
                <button
                  onClick={finishQuestions}
                  className="rounded-xl gradient-studio px-5 py-2 text-sm font-semibold text-paper transition-all hover:brightness-110"
                >
                  Continue
                </button>
              )}
            </div>
          </>
        )
      })()}

      {step === 'voice' && (
        <>
          <h2 className="text-heading text-base text-ink">A couple more taps</h2>
          <p className="mt-1 text-sm text-slate">This shapes tone. Skip anything that doesn&apos;t fit.</p>

          <div className="mt-4 space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-medium text-ink-soft">Humor style</p>
              <div className="flex flex-wrap gap-2">
                {HUMOR_STYLES.map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setHumorStyle(style)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition-all',
                      humorStyle === style
                        ? 'border-studio/30 bg-studio/10 text-studio'
                        : 'border-line bg-paper-raised text-slate hover:bg-paper-tint hover:text-ink',
                    )}
                  >
                    {humorStyle === style && <Check className="size-3.5" aria-hidden="true" />}
                    {style}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setHumorOtherOpen((prev) => !prev)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-xl border border-dashed px-3.5 py-2 text-sm font-medium transition-all',
                    humorOtherOpen ? 'border-studio/40 text-studio' : 'border-line text-slate hover:bg-paper-tint hover:text-ink',
                  )}
                >
                  Other, let me type it
                </button>
              </div>
              {humorOtherOpen && (
                <input
                  autoFocus
                  value={!HUMOR_STYLES.includes(humorStyle) ? humorStyle : ''}
                  onChange={(e) => setHumorStyle(e.target.value)}
                  placeholder="Describe it in a few words"
                  className="w-full rounded-xl border border-line bg-paper-raised px-3 py-2 text-sm outline-none focus-visible:border-studio/40 focus-visible:ring-2 focus-visible:ring-studio/20"
                />
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-ink-soft">Posts you admire tend to be... (pick any)</p>
              <div className="flex flex-wrap gap-2">
                {ADMIRED_STYLES.map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => toggleAdmiredStyle(style)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition-all',
                      admiredStyles.includes(style)
                        ? 'border-studio/30 bg-studio/10 text-studio'
                        : 'border-line bg-paper-raised text-slate hover:bg-paper-tint hover:text-ink',
                    )}
                  >
                    {admiredStyles.includes(style) && <Check className="size-3.5" aria-hidden="true" />}
                    {style}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setAdmiredOtherOpen((prev) => !prev)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-xl border border-dashed px-3.5 py-2 text-sm font-medium transition-all',
                    admiredOtherOpen ? 'border-studio/40 text-studio' : 'border-line text-slate hover:bg-paper-tint hover:text-ink',
                  )}
                >
                  Other, let me type it
                </button>
              </div>
              {admiredOtherOpen && (
                <input
                  autoFocus
                  value={admiredOther}
                  onChange={(e) => setAdmiredOther(e.target.value)}
                  placeholder="Describe it in a few words"
                  className="w-full rounded-xl border border-line bg-paper-raised px-3 py-2 text-sm outline-none focus-visible:border-studio/40 focus-visible:ring-2 focus-visible:ring-studio/20"
                />
              )}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              onClick={() => setStep(questions.length > 0 ? 'questions' : 'profile')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2 text-sm text-slate transition-colors hover:bg-paper-tint"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Back
            </button>
            <button
              onClick={finishVoice}
              className="rounded-xl gradient-studio px-5 py-2 text-sm font-semibold text-paper transition-all hover:brightness-110"
            >
              Create persona
            </button>
          </div>
        </>
      )}

      {step === 'creating' && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="size-8 animate-spin rounded-full border-2 border-studio/20 border-t-studio" />
          <p className="text-sm text-slate">Setting things up...</p>
        </div>
      )}
    </section>
  )
}
