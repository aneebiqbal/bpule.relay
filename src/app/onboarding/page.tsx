'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Sparkles, Check, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { RelayBrand } from '@/components/brand'
import {
  DEFAULT_QUIZ,
  QUIZ_QUESTIONS,
  type QuizAnswers,
} from '@/lib/style/quiz'
import type { StyleCard } from '@/lib/domain/types'
import { cn } from 'cn'

type Phase = 'form' | 'preview'

const TEXT_QUESTION_IDS = new Set(['greeting', 'signOff', 'neverWords', 'preferredWords'])

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
      : 'I could help you ship faster.'
  const gr = card.greeting ? `${card.greeting} ` : ''
  const so = card.sign_off ? ` ${card.sign_off.replace(/[.!?]+$/, '')}.` : ''
  return `${gr}${open}.${so}`
}

function plainSentences(card: StyleCard): string[] {
  const lines: string[] = []

  if (card.formality <= 2) lines.push('You write casually.')
  else if (card.formality >= 4) lines.push('You write formally.')
  else lines.push('You write in a neutral business tone.')

  if (card.sentence_length === 'short') lines.push('You write short sentences, mostly under a dozen words.')
  else if (card.sentence_length === 'medium') lines.push('You write medium-length sentences.')
  else lines.push('You write long, flowing sentences.')

  if (card.contractions === 'mostly_yes') lines.push("You use contractions freely (I'm, we'll).")
  else if (card.contractions === 'mostly_no') lines.push('You avoid contractions entirely.')
  else lines.push('You mix contractions and full forms.')

  if (card.punctuation === 'relaxed') lines.push('Your punctuation is relaxed, not fussy.')
  else if (card.punctuation === 'heavy') lines.push('Your punctuation is complete everywhere.')
  else lines.push('Your punctuation is standard.')

  if (card.openers === 'question') lines.push('You open with a question.')
  else lines.push('You open with a statement.')

  if (card.emoji_use === 'none') lines.push('No emoji. Ever.')
  else lines.push('Almost never an emoji, but fine either way.')

  if (card.greeting) lines.push(`You greet with ${JSON.stringify(card.greeting)}.`)
  if (card.sign_off) lines.push(`You close with ${JSON.stringify(card.sign_off)}.`)
  if (card.never_words.length > 0) lines.push(`You never say: ${card.never_words.join(', ')}.`)
  if (card.preferred_words.length > 0) lines.push(`You reach for: ${card.preferred_words.join(', ')}.`)

  return lines
}

const STEPS = [
  { label: 'How you write', hint: 'Six quick questions' },
  { label: 'Real messages', hint: 'Optional proof' },
  { label: 'Read back', hint: 'Confirm it is you' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [answers, setAnswers] = useState<QuizAnswers>(DEFAULT_QUIZ)
  const [samples, setSamples] = useState('')
  const [phase, setPhase] = useState<Phase>('form')
  const [step, setStep] = useState<1 | 2>(1)
  const [preview, setPreview] = useState<StyleCard | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stepIndex = phase === 'preview' ? 2 : step - 1
  const progress = ((stepIndex + 1) / STEPS.length) * 100

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
        router.replace('/')
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

  return (
    <div className="min-h-dvh bg-paper">
      <div className="mx-auto w-full max-w-2xl px-6 py-10 sm:py-14">
        {/* Brand */}
        <header className="mb-10 flex flex-col items-center gap-4 text-center">
          <RelayBrand />
          <div className="space-y-2">
            <h1 className="text-heading text-2xl text-ink sm:text-3xl">
              Sound like you, on every message.
            </h1>
            <p className="mx-auto max-w-md text-sm leading-relaxed text-slate">
              Relay writes in your voice, not a template. Spend five minutes now
              and every draft from here on already reads like it came from you.
            </p>
          </div>
        </header>

        {/* Error */}
        {error ? (
          <Alert variant="destructive" className="mb-6">
            <AlertTitle>Something failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {phase === 'form' ? (
          <div className="space-y-8">
            {/* Progress */}
            <div className="mx-auto max-w-md">
              <div className="flex items-center justify-between">
                {STEPS.map((s, i) => {
                  const state = i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'todo'
                  return (
                    <div key={s.label} className="flex flex-1 items-center gap-2 first:justify-start last:justify-end">
                      <span
                        className={cn(
                          'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-all duration-300',
                          state === 'active'
                            ? 'bg-gold text-paper shadow-[0_2px_12px_-2px_color-mix(in_srgb,var(--gold)_50%,transparent)]'
                            : state === 'done'
                              ? 'bg-status-send text-paper'
                              : 'border border-line text-slate',
                        )}
                      >
                        {state === 'done' ? <Check className="size-3.5" /> : i + 1}
                      </span>
                      <span
                        className={cn(
                          'text-xs font-medium transition-colors',
                          state === 'todo' ? 'text-slate' : 'text-ink',
                        )}
                      >
                        {s.label}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-paper-tint">
                <div
                  className="h-full rounded-full bg-gold transition-[width] duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 text-center font-mono text-xs text-slate">
                Step {stepIndex + 1} of {STEPS.length} — {STEPS[stepIndex].hint}
              </p>
            </div>

            {step === 1 ? (
              <>
                <div className="divide-y divide-line">
                  {QUIZ_QUESTIONS.map((q, qi) => (
                    <fieldset
                      key={q.id}
                      className="reveal-up py-6 first:pt-0 last:pb-0"
                      style={{ animationDelay: `${0.05 + qi * 0.04}s` }}
                    >
                      <legend className="text-[15px] font-medium text-ink">
                        {q.prompt}
                      </legend>
                      <p className="mt-1 text-xs text-slate">{QUESTION_WHY[q.id]}</p>

                      {TEXT_QUESTION_IDS.has(q.id) ? (
                        <Input
                          className="mt-4"
                          value={String(answers[q.id] ?? '')}
                          placeholder={q.options[0]?.hint}
                          onChange={(e) =>
                            setQ(q.id as keyof QuizAnswers, e.target.value as never)
                          }
                        />
                      ) : (
                        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                          {q.options.map((opt) => {
                            const checked = String(answers[q.id]) === String(opt.value)
                            return (
                              <button
                                key={String(opt.value)}
                                type="button"
                                onClick={() =>
                                  setQ(q.id as keyof QuizAnswers, opt.value as never)
                                }
                                aria-pressed={checked}
                                className={cn(
                                  'group rounded-xl border px-4 py-3.5 text-left transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                                  checked
                                    ? 'border-gold bg-gold/5 shadow-[0_2px_12px_-4px_color-mix(in_srgb,var(--gold)_30%,transparent)]'
                                    : 'border-line bg-paper hover:border-line/80 hover:bg-paper-tint/40',
                                )}
                              >
                                <span
                                  className={cn(
                                    'block text-sm font-medium transition-colors',
                                    checked ? 'text-ink' : 'text-ink/80',
                                  )}
                                >
                                  {String(opt.label)}
                                </span>
                                {opt.hint ? (
                                  <span className="mt-0.5 block text-xs text-slate">
                                    {opt.hint}
                                  </span>
                                ) : null}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </fieldset>
                  ))}
                </div>

                <div className="flex items-center justify-between border-t border-line pt-5">
                  <span className="text-xs text-slate">
                    {QUIZ_QUESTIONS.length} questions · change any later
                  </span>
                  <Button size="lg" onClick={() => setStep(2)}>
                    Continue
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="reveal-up space-y-3">
                  <div className="flex items-center gap-2">
                    <PenLine className="size-4 text-gold" aria-hidden="true" />
                    <h2 className="text-[15px] font-medium text-ink">
                      Paste a few real messages (optional)
                    </h2>
                  </div>
                  <p className="text-sm leading-relaxed text-slate">
                    Five messages you have actually sent, with a blank line between
                    each. Real samples beat any quiz — this is the strongest proof of
                    how you actually write.
                  </p>
                  <Textarea
                    className="mt-2 max-h-[24rem] overflow-y-auto font-mono text-[13px]"
                    value={samples}
                    onChange={(e) => setSamples(e.target.value)}
                    placeholder={
                      'Hey, quick thought on your product...\n\n(blank line between messages)'
                    }
                    rows={7}
                  />
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-line pt-5">
                  <Button variant="outline" size="lg" onClick={() => setStep(1)}>
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    Back
                  </Button>
                  <Button
                    variant="gold"
                    size="lg"
                    onClick={() => buildCard(false)}
                    loading={loading}
                  >
                    <Sparkles className="mr-1.5 size-4" aria-hidden="true" />
                    {loading ? 'Building your card' : 'Build my style card'}
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <PreviewPhase
            card={preview}
            onSave={() => buildCard(true)}
            onBack={() => {
              setPhase('form')
              setStep(1)
            }}
            saving={loading}
          />
        )}
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
    <div className="reveal-up space-y-8">
      <header className="text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-gold/10">
          <Sparkles className="size-5 text-gold" aria-hidden="true" />
        </div>
        <h2 className="text-heading text-xl text-ink sm:text-2xl">
          This is how you sound.
        </h2>
        <p className="mt-2 text-sm text-slate">
          Read it back. If it is you, save it and every draft inherits it.
        </p>
      </header>

      {/* Style sentences */}
      <div className="rounded-2xl border border-line bg-paper p-6">
        <ul className="space-y-3">
          {lines.map((line, i) => (
            <li
              key={line}
              className="slide-in-right flex items-start gap-3 text-[15px] text-ink"
              style={{ animationDelay: `${0.05 + i * 0.04}s` }}
            >
              <span
                className="mt-2 size-1.5 shrink-0 rounded-full bg-gold"
                aria-hidden="true"
              />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Sample */}
      <div className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">
          A sample draft in your voice
        </p>
        <blockquote className="rounded-2xl border-l-[3px] border-gold bg-paper-tint/40 py-4 pl-5 pr-4 text-[15px] leading-relaxed text-ink italic">
          {sampleLine(card)}
        </blockquote>
        <p className="text-sm leading-relaxed text-slate">
          {card.summary}
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:justify-center">
        <Button variant="outline" size="lg" onClick={onBack} disabled={saving}>
          Rebuild it
        </Button>
        <Button variant="gold" size="lg" onClick={onSave} loading={saving}>
          {saving ? 'Saving your voice' : 'This sounds like me, save it'}
        </Button>
      </div>
    </div>
  )
}
