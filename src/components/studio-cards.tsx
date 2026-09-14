'use client'

import { useEffect, useState } from 'react'
import { Lightbulb, MessageCircle, Eye, Briefcase, FlaskConical, Zap, BookOpen, AlertTriangle, TrendingUp, ChevronRight, Plus } from 'lucide-react'
import { cn } from 'cn'

export interface OpportunityData {
  type: string
  title: string
  description: string
  trigger: string
  confidence: number
  sourceKind: string
}

const OPPORTUNITY_ICONS: Record<string, typeof Lightbulb> = {
  recent_work: Briefcase,
  production_lesson: Lightbulb,
  mistake_or_failure: AlertTriangle,
  technical_decision: TrendingUp,
  changed_opinion: MessageCircle,
  useful_explanation: BookOpen,
  industry_development: TrendingUp,
  contrarian_position: MessageCircle,
  behind_the_build: Eye,
  customer_lesson: MessageCircle,
  career_lesson: Briefcase,
  experiment: FlaskConical,
  unexpected_result: Zap,
  timely_discussion: MessageCircle,
}

const OPPORTUNITY_TYPE_LABELS: Record<string, string> = {
  recent_work: 'Recent work',
  production_lesson: 'Production lesson',
  mistake_or_failure: 'Failure → lesson',
  technical_decision: 'Decision',
  changed_opinion: 'Changed opinion',
  useful_explanation: 'Teach something',
  industry_development: 'Timely opportunity',
  contrarian_position: 'Contrarian take',
  behind_the_build: 'Behind the build',
  customer_lesson: 'Customer pattern',
  career_lesson: 'Career lesson',
  experiment: 'Experiment',
  unexpected_result: 'Observation',
  timely_discussion: 'Timely opportunity',
}

const SOURCE_LABELS: Record<string, string> = {
  project: 'From your experience',
  experience: 'From your expertise',
  opinion: 'From something you told Relay',
  expertise: 'From your expertise',
  cluster: 'From previous posts',
  user_input: 'From something you told Relay',
  field_update: 'From a current development',
  memory: 'From your experience',
}

function getSourceLabel(sourceKind: string): string {
  return SOURCE_LABELS[sourceKind] ?? 'From your expertise'
}

function getTimeBasedGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function OpportunityCard({
  opportunity,
  onExplore,
  onDismiss,
  onAlreadyTalked,
  index = 0,
}: {
  opportunity: OpportunityData
  onExplore: () => void
  onDismiss: () => void
  onAlreadyTalked: () => void
  index?: number
}) {
  const [dismissing, setDismissing] = useState(false)
  const Icon = OPPORTUNITY_ICONS[opportunity.type] ?? Lightbulb
  const typeLabel = OPPORTUNITY_TYPE_LABELS[opportunity.type] ?? 'Opportunity'
  const sourceLabel = getSourceLabel(opportunity.sourceKind)

  const handleDismiss = () => {
    setDismissing(true)
    setTimeout(onDismiss, 200)
  }

  return (
    <article
      className={cn(
        'group relative rounded-lg border border-line bg-bone-raised p-5 transition-all duration-300',
        'hover:border-line hover:shadow-sm',
        dismissing && 'scale-[0.98] opacity-0',
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start gap-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-cobalt/[0.07]">
          <Icon className="size-4 text-cobalt" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-label text-cobalt">{typeLabel}</span>
          <h3 className="mt-1.5 text-[15px] font-medium leading-snug text-ink">
            {opportunity.title}
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-graphite">
            {opportunity.description}
          </p>
          <div className="mt-3">
            <span className="inline-flex items-center gap-1 rounded-md bg-bone/60 px-1.5 py-0.5 text-xs text-graphite/70">
              {sourceLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 pl-[52px]">
        <button
          onClick={onExplore}
          className="inline-flex items-center gap-1.5 rounded-md bg-ink px-4 py-2 text-sm font-medium text-bone transition-all hover:bg-ink/90 active:scale-[0.97]"
        >
          Explore
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </button>
        <button
          onClick={handleDismiss}
          className="rounded-lg px-3 py-2 text-sm text-graphite transition-colors hover:bg-bone hover:text-ink"
        >
          Not relevant
        </button>
        <button
          onClick={onAlreadyTalked}
          className="rounded-lg px-3 py-2 text-sm text-graphite transition-colors hover:bg-bone hover:text-ink"
        >
          Already talked about this
        </button>
      </div>
    </article>
  )
}

export function StudioGreeting({
  name,
  opportunityCount,
  hasPersona,
}: {
  name: string
  opportunityCount: number
  hasPersona: boolean
}) {
  const greeting = getTimeBasedGreeting()

  if (!hasPersona) {
    return (
      <div className="space-y-2">
        <h1 className="text-display text-2xl text-ink sm:text-3xl">
          {greeting}, {name}.
        </h1>
        <p className="text-[15px] leading-relaxed text-graphite">
          Relay needs a little context before it can spot good ideas for you.
        </p>
      </div>
    )
  }

  if (opportunityCount === 0) {
    return (
      <div className="space-y-2">
        <h1 className="text-display text-2xl text-ink sm:text-3xl">
          {greeting}, {name}.
        </h1>
        <p className="text-[15px] leading-relaxed text-graphite">
          Here&apos;s what you could talk about today.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h1 className="text-display text-2xl text-ink sm:text-3xl">
        {greeting}, {name}.
      </h1>
      <p className="text-[15px] leading-relaxed text-graphite">
        {opportunityCount === 1
          ? 'I found 1 thing worth talking about today.'
          : `I found ${opportunityCount} things worth talking about today.`}
      </p>
    </div>
  )
}

export function QuickCapture({
  onSubmit,
}: {
  onSubmit: (text: string) => void
}) {
  const [text, setText] = useState('')
  const [expanded, setExpanded] = useState(false)

  const handleSubmit = () => {
    if (!text.trim()) return
    onSubmit(text.trim())
    setText('')
    setExpanded(false)
  }

  return (
    <div className="rounded-lg border border-line bg-bone-raised p-4">
      <div className={cn('flex items-center gap-3 transition-all', expanded && 'items-start')}>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-cobalt/[0.07]">
          <Plus className="size-4 text-cobalt" aria-hidden="true" />
        </div>
        {expanded ? (
          <div className="flex-1 space-y-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
              placeholder="What's on your mind?"
              rows={3}
              className="w-full resize-none rounded-md border border-line bg-bone-raised px-3.5 py-2.5 text-sm outline-none transition-all focus-visible:border-cobalt/40 focus-visible:ring-2 focus-visible:ring-cobalt/20"
              autoFocus
            />
            <div className="rounded-lg border border-line/60 bg-bone/40 p-2.5">
              <p className="text-[11px] font-medium text-graphite mb-1">Try something like:</p>
              <p className="text-[11px] leading-relaxed text-graphite italic">&ldquo;We migrated our Rails monolith to a service-oriented architecture last quarter. The hardest part wasn&apos;t the technical work — it was keeping the team aligned while we decomposed the database. I learned that you need to agree on ownership boundaries BEFORE you start splitting code.&rdquo;</p>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-graphite">
                Relay will ask if it needs more context
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setExpanded(false); setText('') }}
                  className="rounded-lg px-3 py-1.5 text-sm text-graphite transition-colors hover:bg-bone"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!text.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-4 py-1.5 text-sm font-medium text-bone transition-all hover:bg-ink/90 disabled:opacity-40"
                >
                  Continue
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setExpanded(true)}
            className="flex-1 text-left text-sm text-graphite transition-colors hover:text-ink"
          >
            I already know what I want to write about
          </button>
        )}
      </div>
    </div>
  )
}

export function GenerationProgress({ statusMessage }: { statusMessage: string | null }) {
  const messages = [
    'Finding the strongest angle...',
    'Writing two versions...',
    'Checking that it sounds like you...',
    'Finishing the draft...',
  ]

  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % messages.length)
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="rounded-lg border border-line bg-bone-raised p-8">
      <div className="mx-auto max-w-sm space-y-6 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-cobalt/[0.07]">
          <div className="size-6 animate-spin rounded-full border-2 border-cobalt/20 border-t-cobalt" />
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium text-ink">
            {statusMessage ?? messages[activeIndex]}
          </p>
          <div className="mx-auto flex max-w-[200px] gap-1.5">
            {messages.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1 flex-1 rounded-full transition-all duration-500',
                  i <= activeIndex ? 'bg-cobalt' : 'bg-line/60',
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
