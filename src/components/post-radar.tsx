'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from 'cn'
import type { ContentProfile } from '@/lib/domain/types'
import type { ContentPersona, TopicCluster } from '@/lib/domain/types'
import { OpportunityCard, OpportunityData } from '@/components/studio-cards'

export function PostRadar({
  persona,
  topicClusters,
  contentProfile,
  onGenerateOpportunity,
  onDismissOpportunity,
}: {
  persona: ContentPersona
  topicClusters: TopicCluster[]
  contentProfile: ContentProfile | null
  onGenerateOpportunity: (opportunity: OpportunityData) => void
  onDismissOpportunity: (index: number) => void
}) {
  const [opportunities, setOpportunities] = useState<OpportunityData[]>([])
  const [loading, setLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())
  const loadedRef = useRef(false)

  const loadOpportunities = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/content/intelligence/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId: persona.id }),
      })
      if (res.ok) {
        const data = await res.json()
        setOpportunities((data.opportunities ?? []) as OpportunityData[])
        setHasLoaded(true)
      }
    } catch {
      // silent fail
    } finally {
      setLoading(false)
    }
  }, [persona.id])

  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true
      void loadOpportunities()
    }
  }, [loadOpportunities])

  const dismiss = (index: number) => {
    setDismissed((prev) => new Set([...prev, index]))
    onDismissOpportunity(index)
  }

  const visibleOpportunities = opportunities.filter((_, i) => !dismissed.has(i))

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-heading text-base text-ink">Today</h2>
        <button
          onClick={loadOpportunities}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm text-graphite transition-colors hover:bg-bone disabled:opacity-50"
        >
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} aria-hidden="true" />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {loading && !hasLoaded ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-line/60 bg-bone-raised p-5 animate-pulse">
              <div className="flex items-start gap-4">
                <div className="size-9 rounded-xl bg-bone" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-20 rounded bg-bone" />
                  <div className="h-4 w-3/4 rounded bg-bone" />
                  <div className="h-3 w-full rounded bg-bone" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : visibleOpportunities.length > 0 ? (
        <div className="space-y-3">
          {visibleOpportunities.map((opp, idx) => (
            <OpportunityCard
              key={`${opp.type}-${idx}`}
              opportunity={opp}
              onExplore={() => onGenerateOpportunity(opp)}
              onDismiss={() => dismiss(idx)}
              onAlreadyTalked={() => dismiss(idx)}
              index={idx}
            />
          ))}
        </div>
      ) : hasLoaded && visibleOpportunities.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-bone-raised p-6">
          <p className="text-sm text-graphite">
            Nothing strong is standing out right now. Check back later or tell Relay what you&apos;ve been working on.
          </p>
        </div>
      ) : null}
    </section>
  )
}
