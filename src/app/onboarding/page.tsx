'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Check,
  PenLine,
  MessageSquare,
  Target,
  SkipForward,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { RelayBrand } from '@/components/brand'
import { DEFAULT_QUIZ, QUIZ_QUESTIONS, type QuizAnswers } from '@/lib/style/quiz'
import type { StyleCard } from '@/lib/domain/types'
import { cn } from 'cn'

type Phase = 'welcome' | 'quiz' | 'samples' | 'preview' | 'done'

const QUIZ_GROUPS = [
  {
    title: 'Your voice',
    hint: 'How you come across',
    ids: ['contractions', 'formality', 'sentenceLength'],
  },
  {
    title: 'The details',
    hint: 'Punctuation, openers, emoji',
    ids: ['punctuation', 'openers', 'emoji'],
  },
  {
    title: 'The personal touch',
    hint: 'Greetings, sign-offs, words to avoid',
    ids: ['greeting', 'signOff', 'neverWords', 'preferredWords'],
  },
]

const QUESTION_WHY: Record<string, string> = {
  contractions: 'Sets how your drafts collapse or keep full forms.',
  formality: 'Sets the overall register of every message.',
  sentenceLength: 'Controls how breathy or clipped your drafts read.',
  punctuation: 'Controls how strict the punctuation stays.',
  openers: 'Decides whether your first line asks or states.',
  emoji: 'Keeps emoji in or out entirely.',
  greeting: 'The opening word on every draft.',
  signOff: 'The sign-off on every draft.',
  neverWords: 'Words the model is told to never use.',
  preferredWords: 'Words the model reaches for naturally.',
}

function sampleLine(card: StyleCard): string {
  const open =
    card.openers === 'question'
      ? 'Are you the right person for this?'
      : 'I saw your post about scaling the team — quick thought.'
  const gr = card.greeting ? `${card.greeting} ` : ''
  const so = card.sign_off ? ` ${card.sign_off.replace(/[.!?]+$/, '')}.` : ''
  return `${gr}${open}${so}`
}

function plainSentences(card: StyleCard): string[] {
  const lines: string[] = []
  if (card.formality <= 2) lines.push('You write casually, like you talk.')
  else if (card.formality >= 4) lines.push('You write with proper business formality.')
  else lines.push('You write in a neutral business tone.')

  if (card.sentence_length === 'short') lines.push('Short sentences. Mostly under a dozen words.')
  else if (card.sentence_length === 'medium') lines.push('Medium length — one idea per sentence.')
  else lines.push('Long, flowing sentences that build an argument.')

  if (card.contractions === 'mostly_yes') lines.push("You use contractions freely — I'm, we'll, can't.")
  else if (card.contractions === 'mostly_no') lines.push('You keep full forms — I am, we will.')
  else lines.push('You mix contractions and full forms naturally.')

  if (card.punctuation === 'relaxed') lines.push('Punctuation is relaxed — no periods, lowercase i.')
  else if (card.punctuation === 'heavy') lines.push('Complete punctuation everywhere.')
  else lines.push('Standard punctuation — correct but not fussy.')

  if (card.openers === 'question') lines.push('You open with a question to engage.')
  else lines.push('You open with a statement or observation.')

  if (card.greeting) lines.push(`You greet with "${card.greeting}".`)
  if (card.sign_off) lines.push(`You close with "${card.sign_off}".`)
  if (card.never_words.length > 0) lines.push(`Never: ${card.never_words.join(', ')}.`)
  if (card.preferred_words.length > 0) lines.push(`Often: ${card.preferred_words.join(', ')}.`)

  return lines
}

const WRITING_SAMPLES = [
  `Hey — saw you're hiring for a senior Rails role. I've spent the last six years shipping production Rails apps (including a billing rewrite that cut failed txns by 40%).

Happy to share what worked if useful.

Best,
Alex`,
  `Quick question — are you still looking for a frontend dev for the dashboard rewrite? I led a similar project last year (React + design system from scratch, 30% faster iteration).

Would love to swap notes either way.

Cheers`,
]

export default function OnboardingPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('welcome')
  const [answers, setAnswers] = useState<QuizAnswers>(DEFAULT_QUIZ)
  const [samples, setSamples] = useState('')
  const [preview, setPreview] = useState<StyleCard | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [groupIndex, setGroupIndex] = useState(0)

  const currentGroup = QUIZ_GROUPS[groupIndex]
  const groupQuestions = QUIZ_QUESTIONS.filter((q) => currentGroup!.ids.includes(q.id))
  const totalGroups = QUIZ_GROUPS.length
  const isLastGroup = groupIndex === totalGroups - 1

  function setQ<K extends keyof QuizAnswers>(key: K, value: QuizAnswers[K]) {
    setAnswers((a) => ({ ...a, [key]: value }))
  }

  async function buildCard(save: boolean) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/onboarding${save ? '' : '/preview'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quiz: answers, samples }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Request failed.')
      if (save) {
        router.replace('/dashboard')
        router.refresh()
        return
      }
      setPreview(data.card)
      setPhase('preview')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const goToNextGroup = useCallback(() => {
    if (isLastGroup) {
      setPhase('samples')
    } else {
      setGroupIndex((i) => i + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [isLastGroup])

  const goToPrevGroup = useCallback(() => {
    if (groupIndex === 0) {
      setPhase('welcome')
    } else {
      setGroupIndex((i) => i - 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [groupIndex])

  return (
    <div className="min-h-dvh bg-bone">
      <div className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-6 sm:py-12">
        {/* Brand header */}
        <header className="mb-8 flex items-center justify-between">
          <RelayBrand />
          {phase !== 'welcome' && phase !== 'preview' ? (
            <span className="text-mono-medium text-[11px] text-stone">
              {phase === 'quiz'
                ? `Style · ${groupIndex + 1} / ${totalGroups}`
                : phase === 'samples'
                  ? 'Real messages'
                  : ''}
            </span>
          ) : null}
        </header>

        {error ? (
          <div className="mb-6 rounded-lg border border-status-danger/20 bg-status-danger/5 px-4 py-3">
            <p className="text-sm text-status-danger">{error}</p>
          </div>
        ) : null}

        {/* ── WELCOME ── */}
        {phase === 'welcome' && (
          <WelcomePhase onStart={() => setPhase('quiz')} onSkip={() => buildCard(true)} />
        )}

        {/* ── QUIZ ── */}
        {phase === 'quiz' && (
          <div className="space-y-6">
            {/* Progress */}
            <div className="space-y-2">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-label text-stone">{currentGroup!.title}</p>
                  <h2 className="mt-1 text-[20px] font-medium text-ink">
                    {currentGroup!.hint}
                  </h2>
                </div>
                <span className="text-mono-medium text-[12px] text-stone">
                  {groupIndex + 1}/{totalGroups}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-orange transition-all duration-500 ease-out"
                  style={{ width: `${((groupIndex + 1) / totalGroups) * 100}%` }}
                />
              </div>
            </div>

            {/* Questions in this group */}
            <div className="space-y-6">
              {groupQuestions.map((q, qi) => (
                <div key={q.id} className="reveal-up" style={{ animationDelay: `${qi * 0.05}s` }}>
                  <p className="text-[15px] font-medium text-ink">{q.prompt}</p>
                  <p className="mt-1 text-[12px] text-stone">{QUESTION_WHY[q.id]}</p>

                  {q.id === 'greeting' || q.id === 'signOff' || q.id === 'neverWords' || q.id === 'preferredWords' ? (
                    <Input
                      className="mt-3"
                      value={String(answers[q.id] ?? '')}
                      placeholder={q.options[0]?.hint || 'Optional'}
                      onChange={(e) => setQ(q.id as keyof QuizAnswers, e.target.value as never)}
                    />
                  ) : (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {q.options.map((opt) => {
                        const checked = String(answers[q.id]) === String(opt.value)
                        return (
                          <button
                            key={String(opt.value)}
                            type="button"
                            onClick={() => setQ(q.id as keyof QuizAnswers, opt.value as never)}
                            aria-pressed={checked}
                            className={cn(
                              'rounded-xl border px-4 py-3 text-left transition-all duration-150',
                              checked
                                ? 'border-orange bg-orange/[0.06] ring-1 ring-orange/20'
                                : 'border-line bg-bone-raised hover:border-line hover:bg-bone',
                            )}
                          >
                            <span className={cn('block text-[13px] font-medium', checked ? 'text-ink' : 'text-ink/80')}>
                              {String(opt.label)}
                            </span>
                            {opt.hint ? (
                              <span className="mt-0.5 block text-[11px] text-stone">{opt.hint}</span>
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between border-t border-line pt-5">
              <Button variant="ghost" size="sm" onClick={goToPrevGroup}>
                <ArrowLeft className="size-3.5 mr-1.5" aria-hidden="true" />
                Back
              </Button>
              <Button onClick={goToNextGroup}>
                {isLastGroup ? 'Continue' : 'Next'}
                <ArrowRight className="size-3.5 ml-1.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}

        {/* ── SAMPLES ── */}
        {phase === 'samples' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-label text-stone">Optional · strongest proof</p>
              <h2 className="text-[20px] font-medium text-ink">
                Paste real messages you have sent.
              </h2>
              <p className="text-[14px] leading-relaxed text-graphite">
                Five messages with a blank line between each. Real samples beat any quiz — this is the strongest signal of how you actually write.
              </p>
            </div>

            {/* Example */}
            <div className="rounded-xl border border-line bg-bone-raised p-4">
              <p className="text-label text-stone mb-2">Example</p>
              <pre className="overflow-x-auto text-[12px] leading-relaxed text-graphite whitespace-pre-wrap">
                {WRITING_SAMPLES[0]}
              </pre>
            </div>

            <Textarea
              className="max-h-[20rem] overflow-y-auto font-mono text-[13px]"
              value={samples}
              onChange={(e) => setSamples(e.target.value)}
              placeholder="Paste your messages here, separated by blank lines..."
              rows={6}
            />

            <div className="flex items-center justify-between border-t border-line pt-5">
              <Button variant="ghost" size="sm" onClick={() => setPhase('quiz')}>
                <ArrowLeft className="size-3.5 mr-1.5" aria-hidden="true" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => buildCard(false)} disabled={loading}>
                  Skip this
                </Button>
                <Button variant="orange" onClick={() => buildCard(false)} loading={loading}>
                  <Sparkles className="mr-1.5 size-3.5" aria-hidden="true" />
                  {loading ? 'Building...' : 'Build my voice'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── PREVIEW ── */}
        {phase === 'preview' && (
          <PreviewPhase
            card={preview}
            onSave={() => buildCard(true)}
            onBack={() => {
              setPhase('samples')
            }}
            saving={loading}
          />
        )}
      </div>
    </div>
  )
}

function WelcomePhase({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <div className="reveal-up space-y-8">
      {/* Hero */}
      <div className="text-center">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-orange/10">
          <MessageSquare className="size-6 text-orange" aria-hidden="true" />
        </div>
        <h1 className="text-display text-[28px] text-ink sm:text-[32px]">
          Sound like you,<br className="hidden sm:block" /> on every message.
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-graphite">
          Relay writes outreach in your voice, not a template. This takes about three minutes.
        </p>
      </div>

      {/* What it does */}
      <div className="rounded-xl border border-line bg-bone-raised p-5">
        <p className="text-label text-stone mb-3">What this calibrates</p>
        <div className="space-y-3">
          {[
            { icon: Target, label: 'Tone & formality', desc: 'How casual or formal your drafts read' },
            { icon: MessageSquare, label: 'Openers & sign-offs', desc: 'How you start and end messages' },
            { icon: PenLine, label: 'Your word choices', desc: 'Words you use — and words you avoid' },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-start gap-3">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-bone">
                <Icon className="size-3.5 text-stone" aria-hidden="true" />
              </div>
              <div>
                <p className="text-[13px] font-medium text-ink">{label}</p>
                <p className="text-[12px] text-stone">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Primary CTA */}
      <div className="space-y-3">
        <Button size="lg" className="w-full" onClick={onStart}>
          Calibrate my voice
          <ArrowRight className="size-4 ml-1.5" aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="w-full"
          onClick={() => void onSkip()}
        >
          Skip — use default voice
        </Button>
      </div>
    </div>
  )
}

function PreviewPhase({
  card,
  onSave,
  onBack,
  saving,
}: {
  card: StyleCard | null
  onSave: () => void
  onBack: () => void
  saving: boolean
}) {
  if (!card) return null
  const lines = plainSentences(card)

  return (
    <div className="reveal-up space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-orange/10">
          <Sparkles className="size-5 text-orange" aria-hidden="true" />
        </div>
        <h2 className="text-[20px] font-medium text-ink">
          This is how Relay will write.
        </h2>
        <p className="mt-2 text-[14px] text-graphite">
          Read it back. If it sounds like you, save it and every draft inherits it.
        </p>
      </div>

      {/* Style sentences */}
      <div className="rounded-xl border border-line bg-bone-raised p-5">
        <ul className="space-y-2.5">
          {lines.map((line, i) => (
            <li
              key={line}
              className="slide-in-right flex items-start gap-3 text-[14px] text-ink"
              style={{ animationDelay: `${0.05 + i * 0.04}s` }}
            >
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" aria-hidden="true" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Sample draft */}
      <div className="space-y-2">
        <p className="text-label text-stone">Sample draft in your voice</p>
        <blockquote className="rounded-xl border-l-[3px] border-orange bg-bone-raised py-4 pl-5 pr-4 text-[14px] leading-relaxed text-ink italic">
          &ldquo;{sampleLine(card)}&rdquo;
        </blockquote>
      </div>

      {/* Actions */}
      <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" onClick={onBack} disabled={saving}>
          <ArrowLeft className="size-3.5 mr-1.5" aria-hidden="true" />
          Tweak it
        </Button>
        <Button variant="orange" onClick={onSave} loading={saving}>
          {saving ? 'Saving...' : 'This sounds like me'}
          {!saving && <Check className="size-3.5 ml-1.5" aria-hidden="true" />}
        </Button>
      </div>
    </div>
  )
}
