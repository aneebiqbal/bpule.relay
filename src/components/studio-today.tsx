'use client'

import { useState, useEffect } from 'react'
import type { ContentIdeaCard, ContentPersona } from '@/lib/domain/types'

interface StudioTodayProps {
  persona: ContentPersona
  initialPick: ContentIdeaCard | null
  initialAlternatives: ContentIdeaCard[]
}

export function StudioToday({ persona, initialPick, initialAlternatives }: StudioTodayProps) {
  const [pick, setPick] = useState<ContentIdeaCard | null>(initialPick)
  const [alternatives, setAlternatives] = useState<ContentIdeaCard[]>(initialAlternatives)
  const [refreshing, setRefreshing] = useState(false)

  const refreshIdeas = async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/content/intelligence/v2/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId: persona.id }),
      })
      const data = await res.json()
      setPick(data.pick)
      setAlternatives(data.alternatives ?? [])
    } catch {
      // Silently fail
    }
    setRefreshing(false)
  }

  const greeting = getGreeting()

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {greeting}, {persona.displayName.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-graphite">
          Here&apos;s what you could talk about today.
        </p>
      </header>

      {pick ? (
        <IdeaCard
          key={pick.id}
          idea={pick}
          variant="hero"
          personaId={persona.id}
          onRefresh={refreshIdeas}
        />
      ) : (
        <div className="rounded-xl border border-dashed border-ink/20 p-8 text-center">
          <p className="text-sm text-graphite">
            {refreshing ? 'Finding your best ideas...' : 'Refresh to see today\'s opportunities.'}
          </p>
          {!refreshing && (
            <button
              onClick={refreshIdeas}
              className="mt-3 text-sm font-medium text-ink underline underline-offset-2 hover:text-ink/70"
            >
              Refresh ideas
            </button>
          )}
        </div>
      )}

      {alternatives.length > 0 && (
        <section>
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-graphite">
            More directions
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {alternatives.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                variant="compact"
                personaId={persona.id}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function IdeaCard({
  idea,
  variant,
  personaId,
  onRefresh,
}: {
  idea: ContentIdeaCard
  variant: 'hero' | 'compact'
  personaId: string
  onRefresh?: () => void
}) {
  const [writing, setWriting] = useState(false)

  const handleWrite = () => {
    setWriting(true)
    window.location.href = `/content/${personaId}?action=write&title=${encodeURIComponent(idea.title)}&angle=${encodeURIComponent(idea.angle)}&territory=${encodeURIComponent(idea.territory)}`
  }

  if (variant === 'hero') {
    return (
      <article className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <span
            className="inline-flex h-2 w-2 rounded-full"
            style={{ backgroundColor: idea.territoryColor ?? '#6b7280' }}
          />
          <span className="text-xs font-medium uppercase tracking-wider text-graphite">
            {idea.territory}
          </span>
        </div>
        <h3 className="text-xl font-semibold text-ink leading-snug">
          {idea.title}
        </h3>
        <p className="mt-2 text-sm text-graphite leading-relaxed">
          {idea.angle}
        </p>
        <div className="mt-4 space-y-2 rounded-lg bg-bone/50 p-3">
          <p className="text-xs text-graphite">
            <span className="font-medium text-ink">Why you:</span> {idea.whyYou}
          </p>
          <p className="text-xs text-graphite">
            <span className="font-medium text-ink">Why they&apos;ll care:</span> {idea.whyAudience}
          </p>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={handleWrite}
            disabled={writing}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bone hover:bg-ink/90 disabled:opacity-50"
          >
            {writing ? 'Starting...' : 'Write this'}
          </button>
          <button
            onClick={onRefresh}
            className="rounded-lg px-3 py-2 text-sm text-graphite hover:text-ink"
          >
            Different idea
          </button>
        </div>
      </article>
    )
  }

  return (
    <article className="rounded-xl border border-ink/10 bg-white p-4 hover:border-ink/20 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="inline-flex h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: idea.territoryColor ?? '#6b7280' }}
        />
        <span className="text-[10px] font-medium uppercase tracking-wider text-graphite">
          {idea.territory}
        </span>
      </div>
      <h4 className="text-sm font-semibold text-ink leading-snug line-clamp-2">
        {idea.title}
      </h4>
      <p className="mt-1.5 text-xs text-graphite leading-relaxed line-clamp-2">
        {idea.angle}
      </p>
      <button
        onClick={handleWrite}
        className="mt-3 text-xs font-medium text-ink underline underline-offset-2 hover:text-ink/70"
      >
        Write this
      </button>
    </article>
  )
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}
