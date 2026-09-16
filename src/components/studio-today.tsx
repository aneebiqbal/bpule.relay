'use client'

import { useMemo, useState } from 'react'
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
  const [error, setError] = useState('')
  const [journeyState, setJourneyState] = useState<'idle' | 'remembered' | 'dismissed'>('idle')

  const allIdeas = useMemo(
    () => [pick, ...alternatives].filter((idea): idea is ContentIdeaCard => Boolean(idea)),
    [pick, alternatives],
  )

  async function refreshIdeas(signalType: 'regeneration' | 'surprise_me' = 'regeneration') {
    setRefreshing(true)
    setError('')
    try {
      if (pick) {
        await recordTasteSignal(persona.id, {
          type: signalType,
          territory: pick.territory,
          metadata: { wasOpinion: pick.sourceKind === 'opinion', wasTechnical: isTechnicalIdea(pick) },
        })
      }
      const res = await fetch('/api/content/intelligence/v2/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId: persona.id }),
      })
      const data = await res.json()
      setPick(data.pick ?? null)
      setAlternatives(data.alternatives ?? [])
    } catch {
      setError('Could not refresh ideas right now.')
    }
    setRefreshing(false)
  }

  async function writeIdea(idea: ContentIdeaCard) {
    setLoadingIdeaId(idea.id)
    setError('')
    try {
      await recordTasteSignal(persona.id, {
        type: 'write_this',
        territory: idea.territory,
        metadata: { wasOpinion: idea.sourceKind === 'opinion', wasTechnical: isTechnicalIdea(idea) },
      })

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

      const data = await res.json()
      if (data.draftId) {
        router.push(`/studio/drafts/${data.draftId}`)
        return
      }

      setError(data.error || 'Draft generation failed.')
    } catch {
      setError('Draft generation failed.')
    }
    setLoadingIdeaId(null)
  }

  async function notForMe(idea: ContentIdeaCard) {
    await recordTasteSignal(persona.id, {
      type: 'not_for_me',
      territory: idea.territory,
      metadata: { wasOpinion: idea.sourceKind === 'opinion', wasTechnical: isTechnicalIdea(idea) },
    })

    const remaining = allIdeas.filter((candidate) => candidate.id !== idea.id)
    setPick(remaining[0] ?? null)
    setAlternatives(remaining.slice(1, 4))
    if (remaining.length === 0) {
      void refreshIdeas('surprise_me')
    }
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
                disabled={refreshing}
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
                disabled={loadingIdeaId === pick.id}
                className="inline-flex items-center gap-2 rounded bg-ink px-4 py-2 text-[12px] font-medium text-bone hover:bg-ink/90 disabled:opacity-60"
              >
                {loadingIdeaId === pick.id ? 'Starting...' : 'Write this'}
                <ArrowRight className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void refreshIdeas('surprise_me')}
                className="rounded border border-line px-3 py-2 text-[12px] text-graphite hover:text-ink"
              >
                Different angle
              </button>
              <button
                type="button"
                onClick={() => void notForMe(pick)}
                className="rounded border border-line px-3 py-2 text-[12px] text-graphite hover:text-ink"
              >
                Not for me
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
            className="mt-3 rounded bg-cobalt px-3 py-2 text-[12px] font-medium text-bone"
          >
            Find directions
          </button>
        </section>
      )}

      {error && (
        <p className="rounded border border-status-danger/30 bg-status-danger/5 px-3 py-2 text-[12px] text-status-danger">{error}</p>
      )}

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <div className="rounded border border-line bg-bone-raised px-4 py-4">
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Other directions</p>
            {alternatives.length > 0 ? (
              <div className="mt-3 space-y-3">
                {alternatives.map((idea, index) => (
                  <article key={idea.id} className="rounded border border-line/70 bg-bone px-3 py-3">
                    <p className="text-mono-medium text-[10px] uppercase tracking-[0.12em] text-stone">
                      {String(index + 1).padStart(2, '0')} / {sourceLabel(idea.sourceKind)}
                    </p>
                    <p className="mt-1 text-[14px] font-medium text-ink">{idea.title}</p>
                    <p className="mt-1 text-[12px] text-graphite">{idea.angle}</p>
                    <div className="mt-2 grid gap-1 text-[11px] text-graphite sm:grid-cols-2">
                      <p><span className="text-ink">Why you:</span> {idea.whyYou}</p>
                      <p><span className="text-ink">Why it may matter:</span> {idea.whyAudience}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void writeIdea(idea)}
                        disabled={loadingIdeaId === idea.id}
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-ink"
                      >
                        Write this
                        <ArrowRight className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void refreshIdeas('regeneration')}
                        className="text-[11px] text-graphite underline underline-offset-2"
                      >
                        Different angle
                      </button>
                      <button
                        type="button"
                        onClick={() => void notForMe(idea)}
                        className="text-[11px] text-graphite underline underline-offset-2"
                      >
                        Not for me
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[12px] text-graphite">Studio is collecting more directions for tomorrow.</p>
            )}
          </div>

          <StudioQuickCapture
            personaId={persona.id}
            initiallyOpen
            title="Tell Relay something"
            subtitle="Messy thoughts are enough. Studio will shape 2-3 strong angles."
          />
        </div>

        <div className="space-y-4">
          <div className="rounded border border-line bg-bone-raised px-4 py-4">
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Content identity</p>
            <IdentityRow label="Known for" value={identitySummary.knownFor.join(' · ') || 'Still learning your strongest themes'} />
            <IdentityRow label="Territories" value={identitySummary.territories.join(' · ') || 'No territories mapped yet'} />
            <IdentityRow label="Audience" value={identitySummary.audience.join(' · ') || 'Audience not set yet'} />
            <IdentityRow label="Recently used" value={identitySummary.recentlyUsed} />
            <IdentityRow label="Underused" value={identitySummary.underused} />
            <Link href={`/content/${persona.id}/identity`} className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-cobalt">
              View identity
              <ArrowRight className="size-3" />
            </Link>
          </div>

          {journeySuggestion && (
            <div className="rounded border border-line bg-bone-raised px-4 py-4">
              <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Your journey</p>
              <p className="mt-2 text-[13px] font-medium text-ink">{journeySuggestion.title}</p>
              <p className="mt-1 text-[12px] text-graphite">{journeySuggestion.detail}</p>

              {journeyState === 'idle' ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setJourneyState('remembered')} className="rounded border border-line px-2.5 py-1.5 text-[11px] text-ink">
                    Remember
                  </button>
                  <button type="button" onClick={() => setJourneyState('dismissed')} className="rounded border border-line px-2.5 py-1.5 text-[11px] text-graphite">
                    Don&apos;t save
                  </button>
                  <button type="button" onClick={() => void refreshIdeas('surprise_me')} className="rounded bg-cobalt px-2.5 py-1.5 text-[11px] font-medium text-bone">
                    Turn into idea
                  </button>
                </div>
              ) : journeyState === 'remembered' ? (
                <p className="mt-3 text-[11px] text-status-success">Confirmed. Studio can use this as context.</p>
              ) : (
                <p className="mt-3 text-[11px] text-graphite">Ignored for now. Studio will not treat it as a stored fact.</p>
              )}
            </div>
          )}

          <div className="rounded border border-line bg-bone-raised px-4 py-4">
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Studio momentum</p>
            <div className="mt-2 space-y-1 text-[12px] text-ink">
              <p>{weeklyMomentum.ideasExplored} ideas explored</p>
              <p>{weeklyMomentum.draftsCreated} drafts created</p>
              <p>{weeklyMomentum.published} published</p>
            </div>
            <div className="mt-3 space-y-1.5">
              {weeklyMomentum.territoryBalance.map((territory) => (
                <div key={territory.name}>
                  <div className="flex items-center justify-between text-[11px] text-graphite">
                    <span>{territory.name}</span>
                    <span>{territory.weight}%</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded bg-line/60">
                    <div className="h-full rounded bg-cobalt" style={{ width: `${territory.weight}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-graphite">{weeklyMomentum.insight}</p>
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
  try {
    await fetch('/api/content/intelligence/v2/taste', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personaId, signal }),
    })
  } catch {
    // Keep UX uninterrupted if taste logging fails.
  }
}
