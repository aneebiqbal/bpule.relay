'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react'
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
  const so = card.sign_off ? ` ${card.sign_off}.` : ''
  return `${gr}${open}.${so}`
}

/** Plain-language reading of the card, one short line per trait. */
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
        <header className="mb-10 flex flex-col items-center gap-4 text-center">
          <RelayBrand />
          <div className="space-y-2">
            <h1 className="text-2xl font-medium tracking-tight text-ink sm:text-3xl">
              Sound like you, on every message.
            </h1>
            <p className="mx-auto max-w-md text-sm leading-relaxed text-slate">
              Relay writes in your voice, not a template. Spend five minutes now
              and every draft from here on already reads like it came from you.
            </p>
          </div>
        </header>

        {error ? (
          <Alert variant="destructive" className="mb-6">
            <AlertTitle>Something failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {phase === 'form' ? (
          <div className="space-y-8">
            <div className="mx-auto max-w-md">
              <div className="flex items-center justify-between">
                {STEPS.map((s, i) => {
                  const state = i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'todo'
                  return (
                    <div key={s.label} className="flex flex-1 items-center gap-2 first:justify-start last:justify-end">
                      <span
                        className={cn(
                          'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors',
                          state === 'active'
                            ? 'bg-gold text-paper'
                            : state === 'done'
                              ? 'bg-ink text-paper'
                              : 'border border-line text-slate',
                        )}
                      >
                        {state === 'done' ? '✓' : i + 1}
                      </span>
                      <span
                        className={cn(
                          'text-xs font-medium',
                          state === 'todo' ? 'text-slate' : 'text-ink',
                        )}
                      >
                        {s.label}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-paper-tint">
                <div
                  className="h-full rounded-full bg-gold transition-[width] duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 text-center text-xs text-slate">
                Step {stepIndex + 1} of {STEPS.length} — {STEPS[stepIndex].hint}
              </p>
            </div>

            {step === 1 ? (
              <>
                <div className="space-y-4">
                  {QUIZ_QUESTIONS.map((q) => (
                    <fieldset
                      key={q.id}
                      className="rounded-2xl border border-line bg-paper p-6"
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
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
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
                                  'rounded-xl border px-4 py-3 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                                  checked
                                    ? 'border-gold bg-gold/10 ring-1 ring-gold'
                                    : 'border-line bg-paper hover:border-slate hover:bg-paper-tint',
                                )}
                              >
                                <span className="block text-sm font-medium text-ink">
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

                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate">
                    {QUIZ_QUESTIONS.length} questions · you can change any of this later
                  </span>
                  <Button size="lg" onClick={() => setStep(2)}>
                    Continue
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-2xl border border-line bg-paper p-6">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-gold" aria-hidden="true" />
                    <h2 className="text-[15px] font-medium text-ink">
                      Paste a few real messages (optional)
                    </h2>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate">
                    Five messages you have actually sent, with a blank line between
                    each. Real samples beat any quiz; this is the strongest proof of
                    how you actually write.
                  </p>
                  <Textarea
                    className="mt-4 font-mono text-[13px]"
                    value={samples}
                    onChange={(e) => setSamples(e.target.value)}
                    placeholder={
                      'Hey, quick thought on your product...\n\n(blank line between messages)'
                    }
                    rows={7}
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
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
    <div className="reveal-up space-y-6">
      <header className="text-center">
        <h2 className="text-xl font-medium tracking-tight text-ink">
          This is how you sound.
        </h2>
        <p className="mt-1 text-sm text-slate">
          Read it back. If it is you, save it and every draft inherits it.
        </p>
      </header>

      <div className="rounded-2xl border border-line bg-paper p-7">
        <ul className="space-y-3">
          {lines.map((line) => (
            <li
              key={line}
              className="flex items-start gap-3 border-b border-line pb-3 text-[15px] text-ink last:border-b-0 last:pb-0"
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

      <div className="rounded-2xl border border-line bg-paper p-7">
        <p className="text-xs font-medium uppercase tracking-wide text-slate">
          A sample draft in your voice
        </p>
        <blockquote className="mt-3 rounded-xl border border-line bg-paper-tint/60 p-4 text-[15px] leading-relaxed text-ink">
          {sampleLine(card)}
        </blockquote>
        <p className="mt-3 text-sm leading-relaxed text-slate">
          {card.summary}
        </p>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
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
