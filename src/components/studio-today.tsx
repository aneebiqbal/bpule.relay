'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
  const [error, setError] = useState('')

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
          onError={setError}
        />
      ) : (
        <div className="rounded-xl border border-dashed border-line p-8 text-center">
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

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-xs text-red-600">{error}</p>
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
  onError,
}: {
  idea: ContentIdeaCard
  variant: 'hero' | 'compact'
  personaId: string
  onRefresh?: () => void
  onError?: (msg: string) => void
}) {
  const router = useRouter()
  const [writing, setWriting] = useState(false)
  const [unsavedCaption, setUnsavedCaption] = useState<string | null>(null)

  const handleWrite = async () => {
    setWriting(true)
    setUnsavedCaption(null)
    try {
      const res = await fetch('/api/content/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaId,
          idea: {
            title: idea.title,
            angle: idea.angle,
            territory: idea.territory,
            sourceKind: idea.sourceKind,
            whyYou: idea.whyYou,
            whyAudience: idea.whyAudience,
          },
        }),
      })
      const data = await res.json()
      if (data.draftId) {
        router.push(`/studio/drafts/${data.draftId}`)
        return
      } else if (data.caption) {
        // Persistence failed but content was generated — keep it visible
        // rather than losing it or navigating to a page that can't exist
        // (there is no persisted draft id to load).
        setUnsavedCaption(data.caption)
        onError?.(data.error || 'Could not save draft. Your content is preserved below.')
      } else {
        onError?.(data.error || 'Generation failed')
      }
    } catch {
      onError?.('Generation failed')
    }
    setWriting(false)
  }

  if (variant === 'hero') {
    return (
      <article className="rounded-2xl border border-line bg-bone-raised p-6 shadow-sm">
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
        <div className="mt-4 space-y-2 rounded-lg bg-bone p-3">
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
        {unsavedCaption && <UnsavedDraft caption={unsavedCaption} />}
      </article>
    )
  }

  return (
    <article className="rounded-xl border border-line bg-bone-raised p-4 hover:border-line transition-colors">
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
      {unsavedCaption && <UnsavedDraft caption={unsavedCaption} />}
    </article>
  )
}

function UnsavedDraft({ caption }: { caption: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(caption)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API unavailable — the caption is still visible to copy manually.
    }
  }

  return (
    <div className="mt-4 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="text-xs text-amber-800">
        We couldn&apos;t save this draft, but your content wasn&apos;t lost — copy it below and try again in a moment.
      </p>
      <p className="whitespace-pre-wrap rounded-md bg-bone-raised p-3 text-sm text-ink">{caption}</p>
      <button
        onClick={copy}
        className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-bone hover:bg-ink/90"
      >
        {copied ? 'Copied' : 'Copy text'}
      </button>
    </div>
  )
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}
