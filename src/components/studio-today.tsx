'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, RefreshCw } from 'lucide-react'
import type { ContentIdeaCard, ContentPersona } from '@/lib/domain/types'
import { StudioQuickCapture } from '@/components/studio-quick-capture'

interface StudioTodayProps {
  persona: ContentPersona
  initialPick: ContentIdeaCard | null
  initialAlternatives: ContentIdeaCard[]
  identitySummary: {
    knownFor: string[]
    territories: string[]
    audience: string[]
    recentlyUsed: string
    underused: string
  }
  journeySuggestion: {
    title: string
    detail: string
  } | null
  weeklyMomentum: {
    ideasExplored: number
    draftsCreated: number
    published: number
    territoryBalance: Array<{ name: string; weight: number }>
    insight: string
  }
}

export function StudioToday({
  persona,
  initialPick,
  initialAlternatives,
  identitySummary,
  journeySuggestion,
  weeklyMomentum,
}: StudioTodayProps) {
  const router = useRouter()
  const [pick, setPick] = useState<ContentIdeaCard | null>(initialPick)
  const [alternatives, setAlternatives] = useState<ContentIdeaCard[]>(initialAlternatives)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingIdeaId, setLoadingIdeaId] = useState<string | null>(null)
  const [openingDraftIdeaId, setOpeningDraftIdeaId] = useState<string | null>(null)
  const [dismissingIdeaId, setDismissingIdeaId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [redirectFallbackHref, setRedirectFallbackHref] = useState<string | null>(null)
  const [visualWarning, setVisualWarning] = useState('')
  const [journeyState, setJourneyState] = useState<'idle' | 'remembered' | 'dismissed'>('idle')
  const [savingJourneyChoice, setSavingJourneyChoice] = useState(false)

  const journeyStateKey = useMemo(() => {
    if (!journeySuggestion) return null
    return `studio:journey-state:${persona.id}:${journeySuggestion.title}`
  }, [journeySuggestion, persona.id])

  const actionsLocked = refreshing || Boolean(loadingIdeaId) || Boolean(openingDraftIdeaId) || Boolean(dismissingIdeaId)

  const allIdeas = useMemo(
    () => [pick, ...alternatives].filter((idea): idea is ContentIdeaCard => Boolean(idea)),
    [pick, alternatives],
  )

  useEffect(() => {
    if (!journeyStateKey) {
      setJourneyState('idle')
      return
    }
    try {
      const saved = localStorage.getItem(journeyStateKey)
      if (saved === 'remembered' || saved === 'dismissed') {
        setJourneyState(saved)
        return
      }
    } catch {
      // Ignore storage failures.
    }
    setJourneyState('idle')
  }, [journeyStateKey])

  async function refreshIdeas(signalType: 'regeneration' | 'surprise_me' = 'regeneration') {
    setRefreshing(true)
    setError('')
    try {
      if (pick) {
        await recordTasteSignal(persona.id, {
          type: signalType,
          territory: pick.territory,
          metadata: { wasOpinion: pick.sourceKind === 'opinion', wasTechnical: isTechnicalIdea(pick) },
        }).catch(() => null)
      }
      const res = await fetch('/api/content/intelligence/v2/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId: persona.id }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || `Could not refresh ideas (${res.status})`)
      }
      setPick(data?.pick ?? null)
      setAlternatives(Array.isArray(data?.alternatives) ? data.alternatives.slice(0, 3) : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not refresh ideas right now.')
    }
    setRefreshing(false)
  }

  async function writeIdea(idea: ContentIdeaCard) {
    if (actionsLocked) return
    setLoadingIdeaId(idea.id)
    setOpeningDraftIdeaId(null)
    setRedirectFallbackHref(null)
    setVisualWarning('')
    setError('')
    try {
      const res = await fetch('/api/content/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaId: persona.id,
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

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || `Draft generation failed (${res.status})`)
      }

      // Record taste signal only AFTER successful generation to avoid
      // learning from failed/abandoned generation attempts
      await recordTasteSignal(persona.id, {
        type: 'write_this',
        territory: idea.territory || undefined,
        contentType: idea.sourceKind === 'opinion' ? 'opinion' : idea.sourceKind === 'trend' ? 'timely' : undefined,
        metadata: { wasOpinion: idea.sourceKind === 'opinion', wasTechnical: isTechnicalIdea(idea) },
        idempotencyKey: `write_this:${idea.id}`,
      }).catch(() => null)

      if (data?.draftId) {
        const hasVisualIdea = typeof data.visualIdea === 'string' && data.visualIdea.trim().length > 0
        const hasImagePrompt = typeof data.imagePrompt === 'string' && data.imagePrompt.trim().length > 0
        if (!hasVisualIdea || !hasImagePrompt) {
          setVisualWarning('Draft created. Visual package will be regenerated in workspace from your final post.')
        }

        setOpeningDraftIdeaId(idea.id)
        const check = await fetch(`/api/content/drafts/${data.draftId}`, { method: 'GET' })
        if (!check.ok) {
          setRedirectFallbackHref(`/studio/drafts/${data.draftId}`)
          throw new Error('Draft was created, but workspace did not open automatically. Use the manual link below.')
        }

        router.push(`/studio/drafts/${data.draftId}`)
        return
      }

      throw new Error(data?.error || 'Draft generation failed.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Draft generation failed.')
    }
    setLoadingIdeaId(null)
    setOpeningDraftIdeaId(null)
  }

  async function notForMe(idea: ContentIdeaCard) {
    if (actionsLocked) return
    setDismissingIdeaId(idea.id)
    setError('')
    try {
      await recordTasteSignal(persona.id, {
        type: 'not_for_me',
        territory: idea.territory,
        metadata: { wasOpinion: idea.sourceKind === 'opinion', wasTechnical: isTechnicalIdea(idea) },
        idempotencyKey: `not_for_me:${idea.id}`,
      })

      const remaining = allIdeas.filter((candidate) => candidate.id !== idea.id)
      setPick(remaining[0] ?? null)
      setAlternatives(remaining.slice(1, 4))
      if (remaining.length === 0) {
        await refreshIdeas('surprise_me')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your preference. Try again.')
    } finally {
      setDismissingIdeaId(null)
    }
  }

  async function saveJourneyChoice(next: 'remembered' | 'dismissed') {
    if (!journeyStateKey) return
    setSavingJourneyChoice(true)
    setError('')
    try {
      localStorage.setItem(journeyStateKey, next)
      setJourneyState(next)
    } catch {
      setError('Could not save this journey choice in your browser.')
    }
    setSavingJourneyChoice(false)
  }

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-cobalt">Studio / Today</p>
        <h2 className="text-[32px] font-medium leading-[1.03] tracking-[-0.035em] text-ink">Something worth saying today.</h2>
      </header>

      {pick ? (
        <section className="relative">
          <div className="absolute inset-3 translate-x-1.5 translate-y-1.5 bg-cobalt/[0.10]" aria-hidden="true" />
          <article className="srf-sheet mark-corners relative px-5 py-6 sm:px-7 sm:py-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-cobalt">Today&apos;s pick</p>
              <button
                type="button"
                onClick={() => void refreshIdeas('regeneration')}
                className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] text-graphite hover:text-ink"
                disabled={actionsLocked}
              >
                <RefreshCw className="size-3" />
                {refreshing ? 'Refreshing' : 'Different angle'}
              </button>
            </div>

            <h3 className="mt-8 max-w-3xl text-[34px] font-light leading-[1.03] tracking-[-0.04em] text-ink sm:text-[42px]">
              {pick.title}
            </h3>

            <div className="mt-8 grid gap-6 border-t border-[var(--bone-200)] pt-6 sm:grid-cols-2 lg:grid-cols-4">
              <WhyCell label="Angle" value={pick.angle} />
              <WhyCell label="Why you" value={pick.whyYou} />
              <WhyCell label="Why now" value={pick.sourceKind === 'trend' ? 'Fresh signal from recent movement.' : 'This territory has room to expand.'} />
              <WhyCell label="Why audience cares" value={pick.whyAudience} />
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void writeIdea(pick)}
                disabled={actionsLocked}
                className="inline-flex items-center gap-2 rounded bg-ink px-4 py-2 text-[12px] font-medium text-bone hover:bg-ink/90 disabled:opacity-60"
              >
                {openingDraftIdeaId === pick.id ? 'Opening workspace...' : loadingIdeaId === pick.id ? 'Writing...' : 'Write this'}
                <ArrowRight className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void refreshIdeas('surprise_me')}
                disabled={actionsLocked}
                className="rounded border border-line px-3 py-2 text-[12px] text-graphite hover:text-ink"
              >
                {refreshing ? 'Refreshing...' : 'Different angle'}
              </button>
              <button
                type="button"
                onClick={() => void notForMe(pick)}
                disabled={actionsLocked}
                className="rounded border border-line px-3 py-2 text-[12px] text-graphite hover:text-ink"
              >
                {dismissingIdeaId === pick.id ? 'Saving...' : 'Not for me'}
              </button>
            </div>
          </article>
        </section>
      ) : (
        <section className="rounded border border-dashed border-line bg-bone-raised px-4 py-8 text-center">
          <p className="text-[14px] font-medium text-ink">No idea loaded yet.</p>
          <p className="text-[12px] text-graphite">Studio can still find strong directions from your profile and journey.</p>
          <button
            type="button"
            onClick={() => void refreshIdeas('surprise_me')}
            disabled={actionsLocked}
            className="mt-3 rounded bg-cobalt px-3 py-2 text-[12px] font-medium text-bone disabled:opacity-60"
          >
            Find directions
          </button>
        </section>
      )}

      {error && (
        <p className="rounded border border-status-danger/30 bg-status-danger/5 px-3 py-2 text-[12px] text-status-danger">{error}</p>
      )}
      {redirectFallbackHref && (
        <Link href={redirectFallbackHref} className="inline-flex text-[12px] font-medium text-cobalt underline underline-offset-2">
          Open the created draft manually
        </Link>
      )}
      {visualWarning && (
        <p className="rounded border border-status-warning/30 bg-status-warning/5 px-3 py-2 text-[12px] text-status-warning">{visualWarning}</p>
      )}

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          {alternatives.length > 0 && (
            <div>
              <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Other directions</p>
              <div className="mt-2 space-y-0">
                {alternatives.map((idea, index) => (
                  <div key={idea.id} className="flex items-baseline justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-ink">{idea.title}</p>
                      <p className="text-[11px] text-graphite">{idea.angle}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void writeIdea(idea)}
                      disabled={actionsLocked}
                      className="shrink-0 text-[11px] font-medium text-cobalt"
                    >
                      {openingDraftIdeaId === idea.id ? 'Opening...' : loadingIdeaId === idea.id ? 'Writing...' : 'Write this →'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <StudioQuickCapture
            personaId={persona.id}
            initiallyOpen
            title="Tell Relay something"
            subtitle="Messy thoughts are enough. Studio will shape 2-3 strong angles."
          />
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Content identity</p>
            <p className="mt-1 text-[11px] text-graphite">
              {(identitySummary.knownFor ?? []).join(' · ') || 'Still learning your themes'}
              {identitySummary.territories?.length ? ` · ${identitySummary.territories.join(' · ')}` : ''}
            </p>
            <Link href={`/content/${persona.id}/identity`} className="mt-1 inline-block text-[11px] font-medium text-cobalt">
              View identity →
            </Link>
          </div>

          {journeySuggestion && (
            <div>
              <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Your journey</p>
              <p className="mt-1 text-[12px] font-medium text-ink">{journeySuggestion.title}</p>
              <p className="mt-0.5 text-[11px] text-graphite">{journeySuggestion.detail}</p>

              {journeyState === 'idle' ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => void saveJourneyChoice('remembered')} disabled={savingJourneyChoice} className="text-[11px] text-ink disabled:opacity-60">
                    {savingJourneyChoice ? 'Saving...' : 'Remember'}
                  </button>
                  <button type="button" onClick={() => void saveJourneyChoice('dismissed')} disabled={savingJourneyChoice} className="text-[11px] text-graphite disabled:opacity-60">
                    Don&apos;t save
                  </button>
                  <button type="button" onClick={() => void refreshIdeas('surprise_me')} disabled={actionsLocked} className="text-[11px] font-medium text-cobalt disabled:opacity-60">
                    Turn into idea
                  </button>
                </div>
              ) : journeyState === 'remembered' ? (
                <p className="mt-1 text-[10px] text-status-success">Confirmed.</p>
              ) : (
                <p className="mt-1 text-[10px] text-graphite">Ignored.</p>
              )}
            </div>
          )}

          <div>
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Momentum</p>
            <p className="mt-1 text-[11px] text-graphite">
              {weeklyMomentum.ideasExplored} explored · {weeklyMomentum.draftsCreated} drafts · {weeklyMomentum.published} published
            </p>
            <p className="mt-1 text-[10px] text-stone">{weeklyMomentum.insight}</p>
          </div>
        </div>
      </section>
    </div>
  )
}

function WhyCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-mono-medium text-[9px] uppercase tracking-[0.12em] text-graphite">{label}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-ink">{value}</p>
    </div>
  )
}

function IdentityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-2 border-b border-line/70 pb-2 last:border-b-0">
      <p className="text-mono-medium text-[9px] uppercase tracking-[0.12em] text-stone">{label}</p>
      <p className="mt-0.5 text-[12px] text-ink">{value}</p>
    </div>
  )
}

function sourceLabel(source: ContentIdeaCard['sourceKind']): string {
  switch (source) {
    case 'project':
      return 'experience'
    case 'opinion':
      return 'opinion'
    case 'trend':
      return 'observation'
    case 'journey':
      return 'journey'
    case 'audience_gap':
      return 'audience'
    case 'evergreen':
      return 'evergreen'
    case 'expertise':
      return 'expertise'
  }
}

function isTechnicalIdea(idea: ContentIdeaCard): boolean {
  const text = `${idea.title} ${idea.angle} ${idea.territory}`.toLowerCase()
  return /engineer|technical|system|architecture|legacy|rails|ai|code/.test(text)
}

async function recordTasteSignal(personaId: string, signal: Record<string, unknown>) {
  const res = await fetch('/api/content/intelligence/v2/taste', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personaId, signal }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error || `Could not save preference (${res.status})`)
  }
}
