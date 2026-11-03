'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, Check, Copy, Plus, RefreshCw, Shuffle, Sparkles } from 'lucide-react'
import { cn } from 'cn'
import { V3PageHeader } from '@/components/v3/primitives'
import { copyFeedbackLabel, publishFeedbackLabel } from '@/lib/content/studio-feedback'

export interface StudioIdea {
  id: string
  ideaType: 'recommended' | 'alternate'
  title: string
  angle: string | null
  whyNow: string | null
  territory: string | null
  trendGrounded: boolean
  postCaption: string | null
  postPlatform: string
  visualType: string | null
  visualConcept: string | null
  visualPrompt: string | null
  visualReason: string | null
  sourceFreshness: string | null
  formatSuggestion: string | null
  copiedAt: string | null
  postedAt: string | null
}

export interface StudioPersona {
  id: string
  displayName: string
  personaRole: string | null
  platforms: string[]
}

export interface StudioMemory {
  memoryType: string
  content: string
}

export interface StudioHistoryEntry {
  id: string
  postedAt: string
  platform: string
  caption: string
  topic?: string | null
}

type Platform = 'linkedin' | 'x'

/**
 * Studio — the daily creation workspace. It reads the canonical daily brief
 * (daily_content_briefs + daily_content_ideas) and content memory; it never
 * invents a second content engine.
 */
export function StudioHome({
  persona,
  personas,
  initialIdeas,
  memories,
  recentPosts,
}: {
  persona: StudioPersona
  personas: StudioPersona[]
  initialIdeas: StudioIdea[]
  memories: StudioMemory[]
  recentPosts: StudioHistoryEntry[]
}) {
  const router = useRouter()
  const [platform, setPlatform] = useState<Platform>('linkedin')
  const [ideas, setIdeas] = useState<StudioIdea[]>(initialIdeas)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [posted, setPosted] = useState(false)
  const [activeIdeaId, setActiveIdeaId] = useState<string | null>(null)

  const activeIdea = useMemo(
    () => ideas.find((i) => i.id === activeIdeaId) ?? ideas.find((i) => i.ideaType === 'recommended') ?? ideas[0] ?? null,
    [ideas, activeIdeaId],
  )
  const alternates = useMemo(
    () => ideas.filter((i) => i.id !== activeIdea?.id).slice(0, 4),
    [ideas, activeIdea],
  )
  const themes = useMemo(
    () => memories.filter((m) => m.memoryType === 'topic_covered').slice(0, 6).map((m) => m.content),
    [memories],
  )

  const fetchBrief = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`/api/content/intelligence/v2/daily-brief?personaId=${persona.id}&platform=${platform}`)
      if (!res.ok) return false
      const json = await res.json()
      if (json.ideas?.length > 0) {
        setIdeas(json.ideas)
        setActiveIdeaId(json.ideas.find((i: StudioIdea) => i.ideaType === 'recommended')?.id ?? json.ideas[0].id)
        return true
      }
      return false
    } catch {
      return false
    }
  }, [persona.id, platform])

  const generateBrief = useCallback(async () => {
    setGenerating(true)
    setError('')
    try {
      const res = await fetch('/api/content/intelligence/v2/daily-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId: persona.id, platform }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed')
      if (json.ideas?.length > 0) {
        setIdeas(json.ideas)
        setActiveIdeaId(json.ideas.find((i: StudioIdea) => i.ideaType === 'recommended')?.id ?? json.ideas[0].id)
      }
    } catch {
      setError("Couldn't generate today's brief.")
    } finally {
      setGenerating(false)
    }
  }, [persona.id, platform])

  useEffect(() => {
    if (initialIdeas.length > 0) return
    setLoading(true)
    fetchBrief().finally(() => setLoading(false))
  }, [fetchBrief, initialIdeas.length])

  async function tryAnother() {
    if (ideas.length === 0) return
    setGenerating(true)
    setError('')
    try {
      const res = await fetch('/api/content/intelligence/v2/daily-brief/idea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaId: persona.id,
          platform,
          excludeIdeas: ideas.map((i) => ({ title: i.title, territory: i.territory ?? '', angle: i.angle ?? '' })),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (json.idea) {
        setIdeas((prev) => [...prev, json.idea])
        setActiveIdeaId(json.idea.id)
        setPosted(false)
        setCopied(false)
      }
    } catch {
      setError("Couldn't generate another idea.")
    } finally {
      setGenerating(false)
    }
  }

  function copyPost() {
    if (!activeIdea?.postCaption) return
    navigator.clipboard.writeText(activeIdea.postCaption)
    setCopied(true)
    fetch('/api/content/intelligence/v2/daily-brief/copied', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ideaId: activeIdea.id }),
    }).catch(() => {})
    setTimeout(() => setCopied(false), 2000)
  }

  function markPosted() {
    if (!activeIdea) return
    setPosted(true)
    fetch('/api/content/intelligence/v2/daily-brief/copied', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ideaId: activeIdea.id, markPosted: true }),
    }).catch(() => {})
    setTimeout(() => setPosted(false), 2000)
  }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div className="space-y-6 pb-10">
      <V3PageHeader
        title="Studio"
        subtitle="Your content workspace for today."
        meta={
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-graphite">
            <span className="font-medium text-ink">{persona.displayName}</span>
            {persona.personaRole && <span>· {persona.personaRole}</span>}
            <span>· {today}</span>
          </div>
        }
        actions={
          <>
            <button
              type="button"
              onClick={() => void generateBrief()}
              disabled={generating}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-bone px-2.5 text-[13px] text-ink transition-colors hover:bg-bone-raised disabled:opacity-50"
            >
              <RefreshCw className={cn('size-3.5', generating && 'animate-spin')} aria-hidden />
              {generating ? 'Generating…' : 'Regenerate Brief'}
            </button>
            <Link
              href={`/studio/drafts/new?personaId=${persona.id}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-2.5 text-[13px] font-medium text-bone transition-transform active:scale-[0.98] hover:opacity-90"
            >
              <Plus className="size-3.5" aria-hidden />
              Create Post
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-line bg-bone-raised p-0.5" role="group" aria-label="Platform">
          {(['linkedin', 'x'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              aria-pressed={platform === p}
              className={cn(
                'rounded-md px-2.5 py-1 text-[12px] transition-colors',
                platform === p ? 'bg-bone font-medium text-ink shadow-sm' : 'text-graphite hover:text-ink',
              )}
            >
              {p === 'linkedin' ? 'LinkedIn' : 'X'}
            </button>
          ))}
        </div>
        {personas.length > 1 && (
          <label className="flex items-center gap-1.5 text-[12px] text-graphite">
            <span className="sr-only">Persona</span>
            <select
              value={persona.id}
              onChange={(e) => router.push(`/content?persona=${e.target.value}`)}
              className="rounded-md border border-line bg-bone px-2 py-1.5 text-[12px] text-ink"
              aria-label="Persona"
            >
              {personas.map((p) => (
                <option key={p.id} value={p.id}>{p.displayName}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-lg border border-status-warning/30 bg-status-warning/5 px-4 py-3">
          <AlertCircle className="size-4 shrink-0 text-status-warning" aria-hidden />
          <p className="flex-1 text-[13px] text-graphite">{error}</p>
          <button type="button" onClick={() => void generateBrief()} className="text-[13px] font-medium text-ink hover:underline">
            Retry
          </button>
        </div>
      )}

      {loading && !activeIdea ? (
        <div className="flex flex-col items-center py-24 text-center">
          <div className="mb-4 size-6 animate-spin rounded-full border-2 border-orange/30 border-t-orange" />
          <p className="text-[13px] text-graphite">Preparing today&apos;s brief…</p>
        </div>
      ) : !activeIdea ? (
        <div className="flex flex-col items-center rounded-lg border border-dashed border-line bg-bone-raised/60 px-6 py-12 text-center">
          <Sparkles className="size-6 text-orange" aria-hidden />
          <p className="mt-3 text-[15px] font-medium text-ink">Ready to create</p>
          <p className="mt-1 text-[13px] text-graphite">Generate a brief for {persona.displayName}.</p>
          <button
            type="button"
            onClick={() => void generateBrief()}
            disabled={generating}
            className="mt-4 rounded-lg bg-ink px-3 py-2 text-[13px] font-medium text-bone transition-transform active:scale-[0.98] hover:opacity-90 disabled:opacity-50"
          >
            {generating ? 'Generating…' : 'Generate Brief'}
          </button>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <section className="overflow-hidden rounded-lg border border-line bg-bone-raised" aria-label="Today's post">
              <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-stone">Today&apos;s post</p>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-medium',
                    activeIdea.trendGrounded ? 'bg-cobalt/10 text-cobalt' : 'bg-bone text-graphite',
                  )}
                >
                  {activeIdea.trendGrounded ? 'Trend-led' : 'Editorial'}
                </span>
              </div>
              <div className="px-4 py-4">
                <h2 className="text-[18px] font-medium leading-snug text-ink">{activeIdea.title}</h2>
                {activeIdea.angle && <p className="mt-2 text-[13px] leading-relaxed text-graphite">{activeIdea.angle}</p>}
                {activeIdea.whyNow && (
                  <p className="mt-3 border-l-2 border-orange/40 pl-3 text-[12px] text-graphite">
                    <span className="font-medium text-ink">Why now · </span>{activeIdea.whyNow}
                  </p>
                )}
                {activeIdea.visualConcept && (
                  <p className="mt-3 text-[12px] text-graphite">
                    <span className="font-medium text-ink">Visual · </span>{activeIdea.visualConcept}
                  </p>
                )}
                {activeIdea.postCaption && (
                  <p className="mt-4 whitespace-pre-wrap border-t border-line pt-3 text-[13px] leading-relaxed text-ink">
                    {activeIdea.postCaption}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-line bg-bone/60 px-4 py-2.5">
                <Link
                  href={`/studio/drafts/new?personaId=${persona.id}&ideaId=${activeIdea.id}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-ink px-2.5 text-[13px] font-medium text-bone transition-transform active:scale-[0.98] hover:opacity-90"
                >
                  Draft Post
                </Link>
                <button
                  type="button"
                  onClick={copyPost}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-bone px-2.5 text-[13px] text-ink transition-colors hover:bg-bone-raised"
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
                  onClick={() => void tryAnother()}
                  disabled={generating}
                  className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-graphite transition-colors hover:text-ink disabled:opacity-50"
                >
                  <Shuffle className={cn('size-3.5', generating && 'animate-spin')} aria-hidden />
                  {generating ? 'Generating…' : 'Try another'}
                </button>
              </div>
            </section>

            {alternates.length > 0 && (
              <section aria-label="Alternate ideas">
                <h3 className="mb-2 text-[12px] font-medium uppercase tracking-[0.06em] text-stone">Alternates</h3>
                <ul className="divide-y divide-line/70 overflow-hidden rounded-lg border border-line">
                  {alternates.map((idea) => (
                    <li key={idea.id}>
                      <button
                        type="button"
                        onClick={() => setActiveIdeaId(idea.id)}
                        className="block w-full px-3 py-2.5 text-left transition-colors hover:bg-bone-raised"
                      >
                        <p className="text-[13px] font-medium text-ink">{idea.title}</p>
                        {idea.angle && <p className="mt-0.5 line-clamp-2 text-[12px] text-graphite">{idea.angle}</p>}
                        <p className="mt-1 text-[11px] text-stone">
                          {idea.territory ?? 'Editorial'}{idea.trendGrounded ? ' · Trend-led' : ''}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <div className="space-y-5">
            <section className="rounded-lg border border-line bg-bone-raised px-3 py-3" aria-label="Trend context">
              <h3 className="text-[12px] font-medium uppercase tracking-[0.06em] text-stone">Trend context</h3>
              <dl className="mt-2 space-y-1.5 text-[12px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-stone">Source</dt>
                  <dd className="text-ink">{activeIdea.trendGrounded ? 'Trend' : 'Editorial'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-stone">Topic</dt>
                  <dd className="text-right text-ink">{activeIdea.territory ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-stone">Freshness</dt>
                  <dd className="text-ink">{activeIdea.sourceFreshness ?? '—'}</dd>
                </div>
              </dl>
              {activeIdea.whyNow && <p className="mt-2 text-[12px] text-graphite">{activeIdea.whyNow}</p>}
            </section>

            <section className="rounded-lg border border-line bg-bone-raised px-3 py-3" aria-label="Content memory">
              <h3 className="text-[12px] font-medium uppercase tracking-[0.06em] text-stone">Recently used themes</h3>
              {themes.length === 0 ? (
                <p className="mt-2 text-[12px] text-graphite">No themes yet. Published work builds your memory.</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {themes.map((theme) => (
                    <li key={theme} className="rounded-full bg-bone px-2 py-0.5 text-[11px] text-graphite">
                      {theme}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {recentPosts.length > 0 && (
              <section className="rounded-lg border border-line bg-bone-raised px-3 py-3" aria-label="Recent posts">
                <h3 className="text-[12px] font-medium uppercase tracking-[0.06em] text-stone">Recent posts</h3>
                <ul className="mt-2 space-y-1.5">
                  {recentPosts.slice(0, 4).map((post) => (
                    <li key={post.id} className="text-[12px]">
                      <p className="line-clamp-2 text-ink">{post.topic || post.caption}</p>
                      <p className="text-[10px] text-stone">{post.platform}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
