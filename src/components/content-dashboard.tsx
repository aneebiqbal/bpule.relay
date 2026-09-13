'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, PenLine, ChevronRight, Check, ArrowRight, ArrowLeft, Settings2, TrendingUp } from 'lucide-react'
import { cn } from 'cn'
import { StudioBrand } from '@/components/studio-brand'
import { UnderstandingScreen } from '@/components/understanding-screen'
import type { ContentPersona, TopicCluster, ContentDraft, ContentHistoryEntry } from '@/lib/domain/types'
import type { OnboardingQuestion } from '@/lib/ai/onboarding-questions'
import type { DailyStatus } from '@/app/(app)/content/page'

interface PersonaWithExtras extends ContentPersona {
  topicClusters: TopicCluster[]
  drafts: ContentDraft[]
  /** Already filtered to the last 14 days, server-side, so the client never needs "now". */
  recentPosts: ContentHistoryEntry[]
  dailyStatus: DailyStatus
}

const DAILY_STATUS_LABEL: Record<DailyStatus, string> = {
  asked: 'Question ready',
  drafted: 'Drafted today',
  posted: 'Posted today',
  none: 'Nothing surfaced today',
}

export function ContentDashboard({ personas }: { personas: PersonaWithExtras[] }) {
  const [showNewPersona, setShowNewPersona] = useState(false)
  const [understandingFor, setUnderstandingFor] = useState<string | null>(null)

  const totalDrafts = personas.reduce((sum, p) => sum + p.drafts.filter((d) => d.status === 'draft' || d.status === 'ready').length, 0)
  const totalSubjects = personas.reduce((sum, p) => sum + p.topicClusters.length, 0)

  const postedLast14Days = personas.flatMap((p) => p.recentPosts)
  const withOutcome = postedLast14Days.filter((h) => h.ledToRealOutcome).length
  const withMetrics = postedLast14Days.filter((h) => h.metricsLoggedAt).length

  const readyByPersona = new Map(
    personas.map((p) => [p.id, p.drafts.filter((d) => d.status === 'draft' || d.status === 'ready').length]),
  )
  const topWaitingPersona = [...personas].sort((a, b) => (readyByPersona.get(b.id) ?? 0) - (readyByPersona.get(a.id) ?? 0))[0]

  // Action-first ordering: personas with drafts waiting surface first (most
  // waiting first), then everything else keeps its natural order.
  const sortedPersonas = [...personas].sort((a, b) => (readyByPersona.get(b.id) ?? 0) - (readyByPersona.get(a.id) ?? 0))

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-2">
          <StudioBrand />
          <p className="max-w-md text-[15px] text-slate">
            Real material, shaped into your voice. Never invented, never generic.
          </p>
        </div>
        {personas.length > 0 && (
          <button
            onClick={() => setShowNewPersona(true)}
            className="group inline-flex items-center gap-2.5 rounded-2xl gradient-studio px-5 py-3 text-sm font-semibold text-paper shadow-studio transition-all duration-300 hover:brightness-110 active:scale-[0.97]"
          >
            <Plus className="size-4 transition-transform duration-300 group-hover:rotate-90" aria-hidden="true" />
            New persona
          </button>
        )}
      </header>

      {/* ── New persona wizard ── */}
      {showNewPersona && (
        <NewPersonaForm onClose={() => setShowNewPersona(false)} />
      )}

      {/* ── Stats strip ── */}
      {personas.length > 0 && (
        <div className="grid gap-px overflow-hidden rounded-2xl border border-line/60 bg-line/40 sm:grid-cols-3">
          <Stat label="Personas" value={String(personas.length)} sub={personas.length === 1 ? 'voice profile' : 'voice profiles'} />
          <Stat label="Subjects" value={String(totalSubjects)} sub={totalSubjects === 1 ? 'focus area' : 'focus areas'} />
          {totalDrafts > 0 && topWaitingPersona ? (
            <Link
              href={`/content/${topWaitingPersona.id}`}
              className="flex flex-col gap-1 bg-paper px-4 py-3.5 transition-colors hover:bg-studio/[0.04]"
            >
              <span className="text-label text-studio">Ready drafts</span>
              <span className="font-mono text-xl font-medium tracking-tight text-ink">{totalDrafts}</span>
              <p className="text-[11px] text-studio">waiting on {topWaitingPersona.displayName} &rarr;</p>
            </Link>
          ) : (
            <Stat label="Ready drafts" value={String(totalDrafts)} sub="waiting" />
          )}
        </div>
      )}

      {/* ── Performance trend, from real logged data only ── */}
      {postedLast14Days.length > 0 && (
        <div className="flex items-center gap-2 border-y border-line/50 py-3 text-sm text-slate">
          <TrendingUp className="size-4 shrink-0 text-slate" aria-hidden="true" />
          <span>
            Last 14 days: <span className="font-medium text-ink">{postedLast14Days.length}</span> posted,{' '}
            <span className="font-medium text-ink">{withMetrics}</span> with results logged,{' '}
            <span className="font-medium text-ink">{withOutcome}</span> led to something real.
          </span>
        </div>
      )}

      {/* ── Empty state ── */}
      {personas.length === 0 && !showNewPersona && (
        <section className="rounded-[1.75rem] border border-dashed border-line bg-surface-raised p-14 text-center">
          <div className="mx-auto max-w-sm space-y-4">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-paper-tint">
              <PenLine className="size-6 text-slate" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <p className="text-heading text-lg text-ink">No personas yet.</p>
              <p className="text-sm leading-relaxed text-slate">
                Paste a profile or bio. Studio will ask a few quick tap questions shaped to your field, then you are ready to draft.
              </p>
            </div>
            <button
              onClick={() => setShowNewPersona(true)}
              className="inline-flex items-center gap-2 rounded-xl gradient-studio px-6 py-3 text-sm font-semibold text-paper transition-all hover:brightness-110"
            >
              <Plus className="size-4" aria-hidden="true" />
              Create your first persona
            </button>
          </div>
        </section>
      )}

      {/* ── Persona list — action-first: waiting drafts surface first, unset-up personas read as unset-up ── */}
      {personas.length > 0 && (
        <div className="space-y-4">
          {sortedPersonas.map((persona) => {
            const readyDrafts = persona.drafts.filter((d) => d.status === 'draft' || d.status === 'ready').length
            const namedClusters = persona.topicClusters.filter((c) => c.clusterName.trim().length > 0)
            const subjects = namedClusters.slice(0, 4)
            const needsSetup = namedClusters.length === 0
            const hasWaiting = readyDrafts > 0

            return (
              <article
                key={persona.id}
                className={cn(
                  'overflow-hidden rounded-[1.25rem] transition-shadow',
                  hasWaiting
                    ? 'border-2 border-studio/40 bg-surface-raised shadow-studio hover:shadow-md'
                    : needsSetup
                      ? 'border border-dashed border-line bg-paper-tint/30'
                      : 'border border-line/60 bg-surface-raised hover:shadow-md',
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-4 p-5">
                  <div className="flex items-center gap-4">
                    <div
                      className={cn(
                        'flex size-11 shrink-0 items-center justify-center rounded-xl',
                        hasWaiting ? 'bg-gradient-to-br from-studio/20 to-studio/5' : 'bg-paper-tint',
                      )}
                    >
                      <PenLine className={cn('size-5', hasWaiting ? 'text-studio' : 'text-slate')} aria-hidden="true" />
                    </div>
                    <div>
                      <h2 className="text-heading text-base text-ink">{persona.displayName}</h2>
                      <p className="text-xs text-slate">
                        {[
                          `${namedClusters.length} subject${namedClusters.length === 1 ? '' : 's'}`,
                          persona.platforms.join(', '),
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasWaiting ? (
                      <span className="rounded-full bg-studio px-2.5 py-1 text-mono-medium text-[10px] text-paper">
                        {readyDrafts} draft{readyDrafts === 1 ? '' : 's'} waiting
                      </span>
                    ) : (
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-1 text-mono-medium text-[10px]',
                          persona.dailyStatus === 'posted' ? 'bg-status-send/10 text-status-send' : 'bg-paper-tint text-slate',
                        )}
                      >
                        {DAILY_STATUS_LABEL[persona.dailyStatus]}
                      </span>
                    )}
                    <button
                      onClick={() => setUnderstandingFor((prev) => (prev === persona.id ? null : persona.id))}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition-colors',
                        understandingFor === persona.id
                          ? 'border-ink/30 bg-paper-tint text-ink'
                          : 'border-line text-slate hover:bg-paper-tint hover:text-ink',
                      )}
                    >
                      <Settings2 className="size-3.5" aria-hidden="true" />
                      About you
                    </button>
                    {needsSetup ? (
                      <Link
                        href={`/content/${persona.id}`}
                        className="group inline-flex items-center gap-1.5 rounded-xl gradient-studio px-4 py-2 text-sm font-medium text-paper transition-all hover:brightness-110 active:scale-[0.97]"
                      >
                        Finish setup
                        <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                      </Link>
                    ) : (
                      <Link
                        href={`/content/${persona.id}`}
                        className={cn(
                          'group inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-all active:scale-[0.97]',
                          hasWaiting
                            ? 'gradient-studio text-paper hover:brightness-110'
                            : 'bg-ink text-paper hover:bg-ink/90',
                        )}
                      >
                        Open
                        <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                </div>

                {understandingFor === persona.id && (
                  <div className="border-t border-line/40 p-5">
                    <UnderstandingScreen
                      persona={persona}
                      topicClusters={persona.topicClusters}
                      onUpdated={() => setUnderstandingFor(null)}
                    />
                  </div>
                )}

                {needsSetup ? (
                  <div className="border-t border-line/40 px-5 py-3">
                    <p className="text-xs text-slate">
                      No subjects yet — nothing to draft from. Open this persona and answer the first question to get started.
                    </p>
                  </div>
                ) : subjects.length > 0 && (
                  <div className="border-t border-line/40 px-5 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {subjects.map((s) => (
                        <span key={s.id} className="rounded-lg bg-paper-tint/60 px-2 py-0.5 text-[11px] text-ink-soft">
                          {s.clusterName}
                        </span>
                      ))}
                      {namedClusters.length > 4 && (
                        <span className="rounded-lg bg-paper-tint/60 px-2 py-0.5 text-[11px] text-slate">
                          +{namedClusters.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex flex-col gap-1 bg-paper px-4 py-3.5">
      <span className="text-label text-slate">{label}</span>
      <span className="font-mono text-xl font-medium tracking-tight text-ink">{value}</span>
      <p className="text-[11px] text-slate">{sub}</p>
    </div>
  )
}

type WizardStep = 'profile' | 'loading-questions' | 'questions' | 'voice' | 'creating' | 'cold-start'

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
  const [pastPostsInput, setPastPostsInput] = useState('')
  const [showPastPosts, setShowPastPosts] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [questions, setQuestions] = useState<OnboardingQuestion[]>([])
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [otherOpen, setOtherOpen] = useState<Record<string, boolean>>({})

  const [coldQuestion, setColdQuestion] = useState<{ id: string; prompt: string; kind: 'yes_no' | 'choice'; options: string[]; done: boolean } | null>(null)
  const [coldAnswers, setColdAnswers] = useState<Array<{ questionId: string; prompt: string; selectedOption: string; typedInput?: string }>>([])
  const [coldDepth, setColdDepth] = useState(0)

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
    if (!profileInput.trim() && !pastPostsInput.trim()) {
      setError('Paste a LinkedIn URL, a short bio, or a few real past posts.')
      return
    }
    setError(null)
    setStep('loading-questions')

    // Cold-start: no past posts to lean on → use adaptive branching questions.
    const hasPastedPosts = pastPostsInput.trim().split(/\s+/).length >= 30
    if (!hasPastedPosts) {
      await loadColdStartQuestion([], 0)
      return
    }

    try {
      const questionSeed = pastPostsInput.trim() || profileInput.trim()
      const res = await fetch('/api/content/onboarding-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileInput: questionSeed }),
      })
      const data = await res.json().catch(() => null)
      const generated: OnboardingQuestion[] = Array.isArray(data?.questions) ? data.questions : []
      setQuestions(generated)
      setCurrentQuestion(0)
      setStep(generated.length === 0 ? 'voice' : 'questions')
    } catch {
      setStep('voice')
    }
  }

  async function loadColdStartQuestion(previousAnswers: Array<{ questionId: string; prompt: string; selectedOption: string; typedInput?: string }>, depth: number) {
    try {
      const res = await fetch('/api/content/cold-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileInput: pastPostsInput.trim() || profileInput.trim(),
          previousAnswers,
          depth,
        }),
      })
      const data = await res.json().catch(() => null)
      const q = data?.question
      if (!q || q.done) {
        setStep('voice')
        return
      }
      setColdQuestion(q)
      setColdDepth(depth)
      setStep('cold-start')
    } catch {
      setStep('voice')
    }
  }

  function pickColdStart(value: string) {
    if (!coldQuestion) return
    const answer = {
      questionId: coldQuestion.id,
      prompt: coldQuestion.prompt,
      selectedOption: value,
      typedInput: !coldQuestion.options.includes(value) ? value : undefined,
    }
    const next = [...coldAnswers, answer]
    setColdAnswers(next)
    loadColdStartQuestion(next, coldDepth + 1)
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
          pastPostsInput: pastPostsInput.trim(),
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
    const coldStartValues = coldAnswers
      .filter((a) => a.typedInput?.trim() || (a.selectedOption && !a.selectedOption.includes('Other')))
      .map((a) => `${a.prompt} ${a.typedInput?.trim() || a.selectedOption}`)
    void create([...pendingValuesAndOpinions(), ...coldStartValues], humorStyle, admiredExamples)
  }

  return (
    <section className="reveal-up rounded-2xl border border-studio/25 bg-surface-raised p-6 shadow-studio">
      {error && (
        <p className="mb-3 text-sm text-status-no" role="alert">{error}</p>
      )}

      {step === 'profile' && (
        <>
          <h2 className="text-heading text-base text-ink">New persona</h2>
          <p className="mt-1 text-sm text-slate">Paste a profile, or a few real past posts. Studio asks a few quick tap questions next, tailored to what it finds.</p>

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

            <div className="grid gap-1.5 rounded-xl border border-studio/20 bg-studio/[0.03] p-3.5">
              <label htmlFor="past-posts-input" className="text-sm font-medium text-ink-soft">
                Paste a few of your real past posts <span className="font-normal text-slate">(fastest, most accurate)</span>
              </label>
              <textarea
                id="past-posts-input"
                value={pastPostsInput}
                onChange={(e) => setPastPostsInput(e.target.value)}
                rows={5}
                placeholder="Paste 2-3 real posts you've written before, from LinkedIn, X, wherever. Plain text — no connected account needed."
                className="w-full rounded-xl border border-line bg-paper-raised px-3 py-2 text-sm transition-all outline-none focus-visible:border-studio/40 focus-visible:ring-2 focus-visible:ring-studio/20"
              />
              <p className="text-xs text-slate">This reads your own writing directly, so it seeds voice and topics more accurately than answers alone.</p>
            </div>

            {(showPastPosts || profileInput.trim().length > 0 || pastPostsInput.trim().length === 0) && (
              <div className="grid gap-1.5">
                <label htmlFor="profile-input" className="text-sm font-medium text-ink-soft">
                  LinkedIn URL or bio <span className="font-normal text-slate">(optional if you pasted posts above)</span>
                </label>
                <textarea
                  id="profile-input"
                  value={profileInput}
                  onChange={(e) => setProfileInput(e.target.value)}
                  rows={4}
                  placeholder="Paste a LinkedIn profile URL, About section, or short bio."
                  className="w-full rounded-xl border border-line bg-paper-raised px-3 py-2 text-sm transition-all outline-none focus-visible:border-studio/40 focus-visible:ring-2 focus-visible:ring-studio/20"
                />
              </div>
            )}
            {!showPastPosts && pastPostsInput.trim().length > 0 && profileInput.trim().length === 0 && (
              <button
                type="button"
                onClick={() => setShowPastPosts(true)}
                className="justify-self-start text-xs text-studio hover:underline"
              >
                Also add a bio (optional)
              </button>
            )}
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

      {step === 'cold-start' && coldQuestion && (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-studio-light">Tailored to you</span>
              <span className="text-xs text-slate">Q{coldDepth + 1}</span>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(coldDepth + 1, 6) }).map((_, i) => (
                <span key={i} className={cn('h-1 flex-1 rounded-full', i <= coldDepth ? 'bg-studio' : 'bg-line/60')} />
              ))}
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <p className="text-heading text-lg text-ink">{coldQuestion.prompt}</p>
            <div className="flex flex-col gap-2">
              {coldQuestion.options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => pickColdStart(opt)}
                  className="flex items-center gap-2 rounded-xl border border-line bg-paper-raised px-4 py-3 text-left text-sm text-slate transition-all hover:border-studio/30 hover:bg-studio/10 hover:text-studio"
                >
                  {opt}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  const typed = prompt('Type your answer:')
                  if (typed?.trim()) pickColdStart(typed.trim())
                }}
                className="rounded-xl border border-dashed border-line px-4 py-3 text-left text-sm text-slate transition-colors hover:border-studio/40 hover:text-studio"
              >
                Other, let me type it
              </button>
            </div>
          </div>

          {coldDepth > 0 && (
            <div className="mt-4">
              <button
                onClick={() => {
                  const prev = coldAnswers.slice(0, -1)
                  setColdAnswers(prev)
                  loadColdStartQuestion(prev, coldDepth - 1)
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2 text-sm text-slate transition-colors hover:bg-paper-tint"
              >
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                Previous
              </button>
            </div>
          )}
        </>
      )}

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
