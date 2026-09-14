'use client'

import Link from 'next/link'
import { Plus, PenLine, ChevronRight } from 'lucide-react'
import { cn } from 'cn'
import { StudioBrand } from '@/components/studio-brand'
import type { ContentPersona, ContentProfile, TopicCluster, ContentDraft, ContentHistoryEntry } from '@/lib/domain/types'
import type { DailyStatus } from '@/app/(app)/content/page'

interface PersonaWithExtras extends ContentPersona {
  topicClusters: TopicCluster[]
  drafts: ContentDraft[]
  recentPosts: ContentHistoryEntry[]
  dailyStatus: DailyStatus
  contentProfile: ContentProfile | null
}

const DAILY_STATUS_LABEL: Record<DailyStatus, string> = {
  asked: 'Question ready',
  drafted: 'Drafted today',
  posted: 'Posted today',
  none: 'Nothing surfaced today',
}

function getTimeBasedGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function ContentDashboard({ personas }: { personas: PersonaWithExtras[] }) {
  const [showNewPersona, setShowNewPersona] = useState(false)

  const totalDrafts = personas.reduce((sum, p) => sum + p.drafts.filter((d) => d.status === 'draft' || d.status === 'ready').length, 0)
  const totalSubjects = personas.reduce((sum, p) => sum + p.topicClusters.filter((c) => c.clusterName.trim()).length, 0)

  const postedLast14Days = personas.flatMap((p) => p.recentPosts)
  const withOutcome = postedLast14Days.filter((h) => h.ledToRealOutcome).length

  const readyByPersona = new Map(
    personas.map((p) => [p.id, p.drafts.filter((d) => d.status === 'draft' || d.status === 'ready').length]),
  )
  const topWaitingPersona = [...personas].sort((a, b) => (readyByPersona.get(b.id) ?? 0) - (readyByPersona.get(a.id) ?? 0))[0]

  const sortedPersonas = [...personas].sort((a, b) => (readyByPersona.get(b.id) ?? 0) - (readyByPersona.get(a.id) ?? 0))

  const displayName = personas.length > 0 ? personas[0].displayName : 'there'
  const greeting = getTimeBasedGreeting()

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-3">
          <StudioBrand />
          {personas.length > 0 && (
            <p className="text-[15px] text-graphite">
              {personas.length === 1
                ? `${greeting}, ${displayName}.`
                : `${greeting}, ${displayName}. You have ${personas.length} personas.`}
            </p>
          )}
        </div>
        {personas.length > 0 && (
          <button
            onClick={() => setShowNewPersona(true)}
            className="group inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-ink transition-all hover:bg-bone active:scale-[0.97]"
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

      {/* ── Quick stats — subtle ── */}
      {personas.length > 0 && (totalSubjects > 0 || totalDrafts > 0 || postedLast14Days.length > 0) && (
        <div className="flex flex-wrap items-center gap-4 text-sm text-graphite">
          {totalSubjects > 0 && (
            <span>{totalSubjects} subject{totalSubjects === 1 ? '' : 's'}</span>
          )}
          {totalDrafts > 0 && (
            <span>{totalDrafts} draft{totalDrafts === 1 ? '' : 's'} waiting</span>
          )}
          {postedLast14Days.length > 0 && (
            <span>{postedLast14Days.length} posted · {withOutcome} led somewhere</span>
          )}
        </div>
      )}

      {/* ── Empty state ── */}
      {personas.length === 0 && !showNewPersona && (
        <section className="rounded-2xl border border-dashed border-line bg-bone-raised p-10 text-center">
          <div className="mx-auto max-w-sm space-y-4">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-cobalt/[0.07]">
              <PenLine className="size-5 text-cobalt" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <p className="text-heading text-lg text-ink">No personas yet</p>
              <p className="text-sm leading-relaxed text-graphite">
                Paste a profile or a few real past posts. Studio asks a few quick questions tailored to your field, then you are ready to draft.
              </p>
            </div>
            <button
              onClick={() => setShowNewPersona(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-bone transition-all hover:bg-ink/90"
            >
              Create your first persona
            </button>
          </div>
        </section>
      )}

      {/* ── Persona list ── */}
      {personas.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-heading text-base text-ink">Your personas</h2>
          </div>
          {sortedPersonas.map((persona) => {
            const readyDrafts = persona.drafts.filter((d) => d.status === 'draft' || d.status === 'ready').length
            const namedClusters = persona.topicClusters.filter((c) => c.clusterName.trim().length > 0)
            const subjects = namedClusters.slice(0, 3)
            const needsSetup = namedClusters.length === 0
            const hasWaiting = readyDrafts > 0

            return (
              <article
                key={persona.id}
                className={cn(
                  'overflow-hidden rounded-2xl transition-shadow',
                  hasWaiting
                    ? 'border-2 border-cobalt/30 bg-bone-raised shadow-cobalt hover:shadow-md'
                    : needsSetup
                      ? 'border border-dashed border-line bg-bone/30'
                      : 'border border-line/60 bg-bone-raised hover:shadow-sm',
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-4 p-5">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-xl',
                      hasWaiting ? 'bg-gradient-to-br from-studio/15 to-studio/5' : 'bg-bone',
                    )}>
                      <PenLine className={cn('size-[18px]', hasWaiting ? 'text-cobalt' : 'text-graphite')} aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-heading text-[15px] text-ink">{persona.displayName}</h3>
                      <p className="text-xs text-graphite">
                        {[
                          `${namedClusters.length} subject${namedClusters.length === 1 ? '' : 's'}`,
                          persona.platforms.join(', '),
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasWaiting ? (
                      <span className="rounded-full bg-cobalt px-2.5 py-1 text-mono-medium text-[10px] text-bone">
                        {readyDrafts} draft{readyDrafts === 1 ? '' : 's'} waiting
                      </span>
                    ) : (
                      <span className={cn(
                        'rounded-full px-2.5 py-1 text-mono-medium text-[10px]',
                        persona.dailyStatus === 'posted' ? 'bg-status-success/10 text-status-success' : 'bg-bone text-graphite',
                      )}>
                        {DAILY_STATUS_LABEL[persona.dailyStatus]}
                      </span>
                    )}
                    {needsSetup ? (
                      <Link
                        href={`/content/${persona.id}`}
                        className="group inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-bone transition-all hover:bg-ink/90 active:scale-[0.97]"
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
                            ? 'bg-ink text-bone hover:bg-ink/90'
                            : 'border border-line text-ink hover:bg-bone',
                        )}
                      >
                        Open
                        <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                </div>

                {subjects.length > 0 && (
                  <div className="border-t border-line/40 px-5 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {subjects.map((s) => (
                        <span key={s.id} className="rounded-lg bg-bone/60 px-2 py-0.5 text-[11px] text-ink-soft">
                          {s.clusterName}
                        </span>
                      ))}
                      {namedClusters.length > 3 && (
                        <span className="rounded-lg bg-bone/60 px-2 py-0.5 text-[11px] text-graphite">
                          +{namedClusters.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {needsSetup && (
                  <div className="border-t border-line/40 px-5 py-3">
                    <p className="text-xs text-graphite">
                      No subjects yet — answer the first question to get started.
                    </p>
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
    <section className="reveal-up rounded-2xl border border-cobalt/25 bg-bone-raised p-6 shadow-cobalt">
      {error && (
        <p className="mb-3 text-sm text-status-danger" role="alert">{error}</p>
      )}

      {step === 'profile' && (
        <>
          <h2 className="text-heading text-base text-ink">New persona</h2>
          <p className="mt-1 text-sm text-graphite">Paste a profile, or a few real past posts. Studio asks a few quick questions next, tailored to what it finds.</p>

          <div className="mt-4 grid gap-4">
            <div className="grid gap-1.5">
              <label htmlFor="persona-name" className="text-sm font-medium text-ink-soft">Display name</label>
              <input
                id="persona-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Madiha, Hassan"
                className="h-9 w-full rounded-xl border border-line bg-bone-raised px-3 text-sm transition-all outline-none focus-visible:border-cobalt/40 focus-visible:ring-2 focus-visible:ring-cobalt/20"
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
                        ? 'border-cobalt/30 bg-cobalt/8 text-cobalt'
                        : 'border-line bg-bone-raised text-graphite hover:bg-bone',
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-1.5 rounded-xl border border-cobalt/20 bg-cobalt/[0.03] p-3.5">
              <label htmlFor="past-posts-input" className="text-sm font-medium text-ink-soft">
                Paste a few of your real past posts <span className="font-normal text-graphite">(fastest, most accurate)</span>
              </label>
              <textarea
                id="past-posts-input"
                value={pastPostsInput}
                onChange={(e) => setPastPostsInput(e.target.value)}
                rows={5}
                placeholder="Paste 2-3 real posts you've written before, from LinkedIn, X, wherever. Plain text — no connected account needed."
                className="w-full rounded-xl border border-line bg-bone-raised px-3 py-2 text-sm transition-all outline-none focus-visible:border-cobalt/40 focus-visible:ring-2 focus-visible:ring-cobalt/20"
              />
              <div className="rounded-lg border border-line/60 bg-bone/40 p-2.5">
                <p className="text-[11px] font-medium text-graphite mb-1">Example post:</p>
                <p className="text-[11px] leading-relaxed text-graphite italic">"Spent the weekend benchmarking our Rails app's N+1 queries. The fix was counterintuitive — removing a cache layer actually improved p99 latency by 300ms because the cache was the bottleneck. Sometimes the simplest solution is the right one."</p>
              </div>
              <p className="text-xs text-graphite">This reads your own writing directly, so it seeds voice and topics more accurately than answers alone.</p>
            </div>

            {(showPastPosts || profileInput.trim().length > 0 || pastPostsInput.trim().length === 0) && (
              <div className="grid gap-1.5">
                <label htmlFor="profile-input" className="text-sm font-medium text-ink-soft">
                  LinkedIn URL or bio <span className="font-normal text-graphite">(optional if you pasted posts above)</span>
                </label>
                <textarea
                  id="profile-input"
                  value={profileInput}
                  onChange={(e) => setProfileInput(e.target.value)}
                  rows={4}
                  placeholder="Paste a LinkedIn profile URL, About section, or short bio."
                  className="w-full rounded-xl border border-line bg-bone-raised px-3 py-2 text-sm transition-all outline-none focus-visible:border-cobalt/40 focus-visible:ring-2 focus-visible:ring-cobalt/20"
                />
              </div>
            )}
            {!showPastPosts && pastPostsInput.trim().length > 0 && profileInput.trim().length === 0 && (
              <button
                type="button"
                onClick={() => setShowPastPosts(true)}
                className="justify-self-start text-xs text-cobalt hover:underline"
              >
                Also add a bio (optional)
              </button>
            )}
          </div>

          <div className="mt-5 flex items-center justify-end gap-3">
            <button onClick={onClose} className="rounded-xl border border-line px-4 py-2 text-sm text-graphite transition-colors hover:bg-bone">
              Cancel
            </button>
            <button
              onClick={() => void goToQuestions()}
              className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-2 text-sm font-medium text-bone transition-all hover:bg-ink/90"
            >
              Continue
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </>
      )}

      {step === 'loading-questions' && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="size-8 animate-spin rounded-full border-2 border-cobalt/20 border-t-studio" />
          <p className="text-sm text-graphite">Reading the profile, shaping a few questions...</p>
        </div>
      )}

      {step === 'questions' && questions.length > 0 && (() => {
        const idx = Math.min(Math.max(currentQuestion, 0), questions.length - 1)
        const q = questions[idx]
        return (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-cobalt-light">Generated for you</span>
                <span className="text-xs text-graphite">{idx + 1} of {questions.length}</span>
              </div>
              <div className="flex gap-1">
                {questions.map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      'h-1 flex-1 rounded-full transition-colors',
                      i < idx ? 'bg-cobalt/40' : i === idx ? 'bg-cobalt' : 'bg-line/60',
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
                        ? 'border-cobalt/30 bg-cobalt/10 text-cobalt'
                        : 'border-line bg-bone-raised text-graphite hover:bg-bone hover:text-ink',
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
                    className="h-12 w-full rounded-xl border border-cobalt/30 bg-bone-raised px-4 text-sm outline-none focus-visible:border-cobalt/40 focus-visible:ring-2 focus-visible:ring-cobalt/20"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setOtherOpen((prev) => ({ ...prev, [q.id]: true }))}
                    className="rounded-xl border border-dashed border-line px-4 py-3 text-left text-sm text-graphite transition-colors hover:border-cobalt/40 hover:text-cobalt"
                  >
                    Other, let me type it
                  </button>
                )}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                onClick={() => idx === 0 ? setStep('profile') : setCurrentQuestion(idx - 1)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2 text-sm text-graphite transition-colors hover:bg-bone"
              >
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                {idx === 0 ? 'Back' : 'Previous'}
              </button>
              {idx < questions.length - 1 ? (
                <button
                  onClick={() => setCurrentQuestion(idx + 1)}
                  className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-2 text-sm font-medium text-bone transition-all hover:bg-ink/90"
                >
                  Next
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </button>
              ) : (
                <button
                  onClick={finishQuestions}
                  className="rounded-xl bg-ink px-5 py-2 text-sm font-medium text-bone transition-all hover:bg-ink/90"
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
              <span className="text-xs text-cobalt-light">Tailored to you</span>
              <span className="text-xs text-graphite">Q{coldDepth + 1}</span>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(coldDepth + 1, 6) }).map((_, i) => (
                <span key={i} className={cn('h-1 flex-1 rounded-full', i <= coldDepth ? 'bg-cobalt' : 'bg-line/60')} />
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
                  className="flex items-center gap-2 rounded-xl border border-line bg-bone-raised px-4 py-3 text-left text-sm text-graphite transition-all hover:border-cobalt/30 hover:bg-cobalt/10 hover:text-cobalt"
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
                className="rounded-xl border border-dashed border-line px-4 py-3 text-left text-sm text-graphite transition-colors hover:border-cobalt/40 hover:text-cobalt"
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
                className="inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2 text-sm text-graphite transition-colors hover:bg-bone"
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
          <p className="mt-1 text-sm text-graphite">This shapes tone. Skip anything that doesn&apos;t fit.</p>

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
                        ? 'border-cobalt/30 bg-cobalt/10 text-cobalt'
                        : 'border-line bg-bone-raised text-graphite hover:bg-bone hover:text-ink',
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
                    humorOtherOpen ? 'border-cobalt/40 text-cobalt' : 'border-line text-graphite hover:bg-bone hover:text-ink',
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
                  className="w-full rounded-xl border border-line bg-bone-raised px-3 py-2 text-sm outline-none focus-visible:border-cobalt/40 focus-visible:ring-2 focus-visible:ring-cobalt/20"
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
                        ? 'border-cobalt/30 bg-cobalt/10 text-cobalt'
                        : 'border-line bg-bone-raised text-graphite hover:bg-bone hover:text-ink',
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
                    admiredOtherOpen ? 'border-cobalt/40 text-cobalt' : 'border-line text-graphite hover:bg-bone hover:text-ink',
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
                  className="w-full rounded-xl border border-line bg-bone-raised px-3 py-2 text-sm outline-none focus-visible:border-cobalt/40 focus-visible:ring-2 focus-visible:ring-cobalt/20"
                />
              )}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              onClick={() => setStep(questions.length > 0 ? 'questions' : 'profile')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2 text-sm text-graphite transition-colors hover:bg-bone"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Back
            </button>
            <button
              onClick={finishVoice}
              className="rounded-xl bg-ink px-5 py-2 text-sm font-medium text-bone transition-all hover:bg-ink/90"
            >
              Create persona
            </button>
          </div>
        </>
      )}

      {step === 'creating' && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="size-8 animate-spin rounded-full border-2 border-cobalt/20 border-t-studio" />
          <p className="text-sm text-graphite">Setting things up...</p>
        </div>
      )}
    </section>
  )
}
