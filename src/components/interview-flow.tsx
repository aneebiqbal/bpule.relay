'use client'

import { useState, useCallback } from 'react'
import { Send, SkipForward, Loader2, Sparkles } from 'lucide-react'
import { cn } from 'cn'

interface InterviewQuestion {
  question: string
  reason: string
}

export function InterviewFlow({
  personaId,
  sourceMaterial,
  opportunityId,
  onComplete,
  onSkip,
  opportunityTitle,
}: {
  personaId: string
  sourceMaterial: string
  opportunityId?: string | null
  onComplete: (answers: string[]) => void
  onSkip: () => void
  opportunityTitle?: string
}) {
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null)
  const [questionReason, setQuestionReason] = useState<string | null>(null)
  const [answer, setAnswer] = useState('')
  const [answers, setAnswers] = useState<string[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [questionsAsked, setQuestionsAsked] = useState(0)
  const maxQuestions = 3

  const loadQuestion = useCallback(async (previousAnswer?: string, previousQuestion?: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/content/intelligence/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaId,
          sourceMaterial,
          opportunityId,
          sessionId,
          previousAnswer,
          previousQuestion,
        }),
      })
      if (!res.ok) {
        onComplete(answers)
        return
      }
      const data = await res.json()
      if (data.done) {
        setDone(true)
        onComplete(answers)
      } else {
        setCurrentQuestion(data.question)
        setQuestionReason(data.reason)
        setSessionId(data.sessionId)
        setQuestionsAsked(data.questionsAsked ?? questionsAsked)
      }
    } catch {
      onComplete(answers)
    } finally {
      setLoading(false)
    }
  }, [personaId, sourceMaterial, opportunityId, sessionId, answers, questionsAsked, onComplete])

  const submitAnswer = () => {
    if (!answer.trim() || !currentQuestion) return
    const newAnswers = [...answers, answer.trim()]
    setAnswers(newAnswers)
    setAnswer('')
    loadQuestion(answer.trim(), currentQuestion)
  }

  const skipQuestion = () => {
    onComplete(answers)
  }

  if (!currentQuestion && !done && !loading) {
    loadQuestion()
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line/60 bg-bone-raised p-5">
        <Loader2 className="size-4 animate-spin text-cobalt" aria-hidden="true" />
        <p className="text-sm text-graphite">Let&apos;s find the interesting part...</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line/60 bg-bone-raised p-5">
        <Loader2 className="size-4 animate-spin text-cobalt" aria-hidden="true" />
        <p className="text-sm text-graphite">Thinking about what to ask...</p>
      </div>
    )
  }

  if (done) {
    return null
  }

  return (
    <div className="rounded-2xl border border-line/60 bg-bone-raised p-5 space-y-4">
      {opportunityTitle && answers.length === 0 && (
        <p className="text-sm text-graphite">
          Let&apos;s find the interesting part.
        </p>
      )}
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-cobalt/[0.07]">
          <Sparkles className="size-4 text-cobalt" aria-hidden="true" />
        </div>
        <div className="flex-1 space-y-3">
          <p className="text-[15px] font-medium leading-snug text-ink">
            {currentQuestion}
          </p>
          <div className="flex items-end gap-2">
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="One or two sentences is enough..."
              rows={2}
              className="flex-1 rounded-xl border border-line bg-bone-raised px-3.5 py-2.5 text-sm outline-none transition-all focus-visible:border-cobalt/40 focus-visible:ring-2 focus-visible:ring-cobalt/20"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submitAnswer()
                }
              }}
              autoFocus
            />
            <button
              onClick={submitAnswer}
              disabled={!answer.trim()}
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-solid text-on-solid transition-all hover:bg-solid/90 disabled:opacity-40"
            >
              <Send className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      <div className="flex items-start justify-between pl-11">
        <div className="space-y-1.5">
          <button
            onClick={skipQuestion}
            className="inline-flex items-center gap-1.5 text-sm text-graphite transition-colors hover:text-ink"
          >
            <SkipForward className="size-3.5" aria-hidden="true" />
            Generate now
          </button>
          <div className="rounded-lg border border-line/60 bg-bone/40 p-2.5">
            <p className="text-[11px] font-medium text-graphite mb-1">Example:</p>
            <p className="text-[11px] leading-relaxed text-graphite italic">{getExampleForQuestion(currentQuestion ?? '')}</p>
          </div>
        </div>
        {questionsAsked > 0 && (
          <span className="text-xs text-graphite/60">
            {questionsAsked} answer{questionsAsked === 1 ? '' : 's'} so far
          </span>
        )}
      </div>
    </div>
  )
}

function getExampleForQuestion(question: string): string {
  const lowerQuestion = question.toLowerCase()
  if (lowerQuestion.includes('project') || lowerQuestion.includes('recent work')) {
    return 'I recently shipped a CLI tool in Rust that cut deployment time 40% — learned a lot about caching and concurrency.'
  }
  if (lowerQuestion.includes('struggle') || lowerQuestion.includes('challenge') || lowerQuestion.includes('hardest')) {
    return 'Our Rails monolith was hitting 3s response times under load — I led the move to split the hot path into a separate Rust service.'
  }
  if (lowerQuestion.includes('mistake') || lowerQuestion.includes('fail') || lowerQuestion.includes('wrong')) {
    return 'I shipped a background job system without idempotency keys — once it retried a payment callback and charged a user twice. Taught me to always log the actual state transitions.'
  }
  if (lowerQuestion.includes('ops') || lowerQuestion.includes('deploy') || lowerQuestion.includes('ci')) {
    return 'Migrated our CI from Jenkins on bare metal to GitHub Actions — cut build times from 12min to 3min and eliminated queue contention.'
  }
  return 'I learned the hard way that premature abstraction costs more than duplication — now I wait for the third instance before extracting.'
}
