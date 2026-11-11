'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Check, Copy, RefreshCw } from 'lucide-react'
import { cn } from 'cn'
import { copyFeedbackLabel, publishFeedbackLabel } from '@/lib/content/studio-feedback'

export interface GrowthTrend {
  id: string
  title: string
  url: string | null
  topics: string[]
  evidenceQuality: string | null
  whyNow: string
  phase: string | null
}

interface GrowthBrief {
  id: string
  postCaption: string | null
  visualPrompt: string | null
  alternateIdeas: Array<{ title: string; angle: string; whyNow: string }>
}

/**
 * Growth — the Relay brand account's daily content. It reads the canonical
 * growth brief and ranked public trends; it does not rebuild ranking.
 */
export function GrowthV3({ trends }: { trends: GrowthTrend[] }) {
  const [brief, setBrief] = useState<GrowthBrief | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [posted, setPosted] = useState(false)
  const [selectedAngle, setSelectedAngle] = useState<{ title: string; angle: string } | null>(null)

  const generate = useCallback(async () => {
    setGenerating(true)
    setError('')
    try {
      const res = await fetch('/api/growth-v2/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed')
      if (json.brief) setBrief(json.brief)
    } catch {
      setError("Couldn't load today's growth post.")
    } finally {
      setGenerating(false)
    }
  }, [])

  useEffect(() => {
    fetch('/api/growth-v2/daily')
      .then((r) => (r.ok ? r.json() : {}))
      .then((json: { brief?: GrowthBrief }) => {
        if (json.brief) setBrief(json.brief)
        else return generate()
      })
      .catch(() => generate())
      .finally(() => setLoading(false))
  }, [generate])

  function copyPost() {
    const text = selectedAngle ? `${selectedAngle.title}\n\n${selectedAngle.angle}` : brief?.postCaption
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function markPosted() {
    setPosted(true)
    fetch('/api/growth-v2/daily', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markPosted: true }),
    }).catch(() => {})
    setTimeout(() => setPosted(false), 2000)
  }

  if (loading && !brief) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <div className="mb-4 size-6 animate-spin rounded-full border-2 border-orange/30 border-t-orange" />
        <p className="text-[13px] text-graphite">Preparing today&apos;s growth post…</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-lg border border-status-warning/30 bg-status-warning/5 px-4 py-3">
          <AlertCircle className="size-4 shrink-0 text-status-warning" aria-hidden />
          <p className="flex-1 text-[13px] text-graphite">{error}</p>
          <button type="button" onClick={() => void generate()} className="text-[13px] font-medium text-ink hover:underline">Retry</button>
        </div>
      )}

      <section className="overflow-hidden rounded-lg border border-line bg-bone-raised" aria-label="Recommended growth post">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-stone">Today&apos;s post</p>
          {brief && <span className="text-[11px] text-stone">{brief.id === 'emergency' ? 'Fallback' : 'Ready'}</span>}
        </div>
        <div className="px-4 py-4">
          {selectedAngle ? (
            <div className="space-y-2">
              <p className="text-[15px] font-medium text-ink">{selectedAngle.title}</p>
              <p className="text-[13px] leading-relaxed text-graphite">{selectedAngle.angle}</p>
              <button type="button" onClick={() => setSelectedAngle(null)} className="text-[12px] text-stone hover:text-ink">
                ← Back to post
              </button>
            </div>
          ) : brief?.postCaption ? (
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{brief.postCaption}</p>
          ) : (
            <p className="text-[13px] text-graphite">No post yet. Generate one below.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-bone/60 px-4 py-2.5">
          <button
            type="button"
            onClick={copyPost}
            disabled={!selectedAngle && !brief?.postCaption}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-ink px-2.5 text-[13px] font-medium text-bone transition-transform active:scale-[0.98] hover:opacity-90 disabled:opacity-50"
          >
            {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            {copyFeedbackLabel(copied)}
          </button>
          <button
            type="button"
            onClick={markPosted}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-bone px-2.5 text-[13px] text-ink transition-colors hover:bg-bone-raised"
          >
            <Check className="size-3.5" aria-hidden />
            {publishFeedbackLabel(posted)}
          </button>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={generating}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-graphite transition-colors hover:text-ink disabled:opacity-50"
          >
            <RefreshCw className={cn('size-3.5', generating && 'animate-spin')} aria-hidden />
            {generating ? 'Generating…' : 'New post'}
          </button>
        </div>
      </section>

      {brief?.alternateIdeas && brief.alternateIdeas.length > 0 && (
        <section aria-label="Alternate angles">
          <h3 className="mb-2 text-[12px] font-medium uppercase tracking-[0.06em] text-stone">Other angles</h3>
          <ul className="divide-y divide-line/70 overflow-hidden rounded-lg border border-line">
            {brief.alternateIdeas.map((idea, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setSelectedAngle({ title: idea.title, angle: idea.angle })}
                  className="block w-full px-3 py-2.5 text-left transition-colors hover:bg-bone-raised"
                >
                  <p className="text-[13px] font-medium text-ink">{idea.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[12px] text-graphite">{idea.angle}</p>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-line bg-bone-raised px-3 py-3" aria-label="Trends">
        <h3 className="text-[12px] font-medium uppercase tracking-[0.06em] text-stone">Trends worth using</h3>
        {trends.length === 0 ? (
          <p className="mt-2 text-[12px] text-graphite">No ranked trends right now.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {trends.map((trend) => (
              <li key={trend.id} className="border-b border-line/60 pb-2 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-[13px] font-medium text-ink">{trend.title}</p>
                  {trend.url && (
                    <a href={trend.url} target="_blank" rel="noreferrer" className="shrink-0 text-[11px] text-cobalt-ink hover:underline">
                      Source
                    </a>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-stone">
                  {trend.topics.slice(0, 3).join(' · ') || 'General'}
                  {trend.phase ? ` · ${trend.phase}` : ''}
                  {trend.evidenceQuality ? ` · ${trend.evidenceQuality}` : ''}
                </p>
                {trend.whyNow && <p className="mt-0.5 text-[12px] text-graphite">{trend.whyNow}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="rounded-lg border border-line bg-bone-raised/60 px-3 py-2 text-[11px] text-stone">
        Growth drafts from public trend signals and the Relay brand persona. It never reads private conversations or personal profiles.
      </p>
    </div>
  )
}
