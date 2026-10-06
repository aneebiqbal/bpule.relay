'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Shuffle, Check, ChevronRight, AlertCircle, Sparkles, RefreshCw } from 'lucide-react'
import type { DailyContentIdea } from '@/lib/domain/types'

interface StudioTodayV2Props {
  personaId: string
  personaName?: string
  displayName: string
}

interface BriefData {
  brief: { id: string; status: string; localDate: string }
  ideas: DailyContentIdea[]
}

export function StudioTodayV2({ personaId, displayName }: StudioTodayV2Props) {
  const router = useRouter()
  const [data, setData] = useState<BriefData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [posted, setPosted] = useState(false)
  const [activeIdeaId, setActiveIdeaId] = useState<string | null>(null)

  const fetchBrief = useCallback(async (): Promise<boolean> => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/content/intelligence/v2/daily-brief?personaId=${personaId}`)
      if (!res.ok) return false
      const json = await res.json()
      if (json.ideas?.length > 0) {
        setData(json)
        const rec = json.ideas.find((i: DailyContentIdea) => i.ideaType === 'recommended')
        setActiveIdeaId(rec?.id ?? json.ideas[0].id)
        return true
      }
      return false
    } catch {
      return false
    } finally {
      setLoading(false)
    }
  }, [personaId])

  const generateBrief = useCallback(async () => {
    setGenerating(true)
    setError('')
    try {
      const res = await fetch('/api/content/intelligence/v2/daily-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId }),
      })
      if (!res.ok) throw new Error('Failed')
      const json = await res.json()
      if (json.ideas?.length > 0) {
        setData(json)
        setActiveIdeaId(json.ideas[0].id)
      }
    } catch {
      setError('Could not generate. Try again.')
    } finally {
      setGenerating(false)
    }
  }, [personaId])

  const tryAnother = useCallback(async () => {
    if (!data) return
    setGenerating(true)
    try {
      const res = await fetch('/api/content/intelligence/v2/daily-brief/idea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaId,
          excludeIdeas: data.ideas.map(i => ({ title: i.title, territory: i.territory ?? '', angle: i.angle ?? '' })),
        }),
      })
      if (!res.ok) throw new Error('Failed')
      const json = await res.json()
      if (json.idea) {
        setData({ ...data, ideas: [...data.ideas, json.idea] })
        setActiveIdeaId(json.idea.id)
        setPosted(false)
        setCopied(false)
      }
    } catch {
      // Silent — keep current content visible
    } finally {
      setGenerating(false)
    }
  }, [personaId, data])

  useEffect(() => {
    fetchBrief().then(ok => { if (!ok) generateBrief() })
  }, [fetchBrief, generateBrief])

  const activeIdea = data?.ideas.find(i => i.id === activeIdeaId) ?? data?.ideas[0]
  const alternates = (data?.ideas ?? []).filter(i => i.id !== activeIdea?.id).slice(0, 4)

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    fetch(`/api/content/intelligence/v2/daily-brief/copied`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ideaId: activeIdea?.id }),
    }).catch(() => {})
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePosted = (ideaId: string) => {
    setPosted(true)
    fetch(`/api/content/intelligence/v2/daily-brief/copied`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ideaId, markPosted: true }),
    }).catch(() => {})
    setTimeout(() => setPosted(false), 2000)
  }

  return (
    <div className="min-h-screen bg-bone">
      <header className="sticky top-0 z-10 border-b border-line bg-bone/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-[0.15em] text-cobalt">Studio</span>
            <button onClick={() => router.push('/content?manage=1')} className="text-xs text-ink/40 hover:text-cobalt">
              {displayName} →
            </button>
          </div>
          <span className="font-mono text-[11px] text-ink/30">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {loading && !data && (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="mb-3 h-5 w-5 animate-spin rounded-full border-2 border-cobalt/30 border-t-cobalt" />
            <p className="text-sm text-ink/40">Finding today&apos;s best post...</p>
          </div>
        )}

        {error && !generating && (
          <div className="flex items-center gap-3 rounded-lg border border-status-danger/20 bg-status-danger/5 px-4 py-3 mb-6">
            <AlertCircle className="h-4 w-4 shrink-0 text-status-danger" />
            <p className="text-sm text-ink/70 flex-1">{error}</p>
            <button onClick={generateBrief} className="text-sm text-cobalt hover:underline">Retry</button>
          </div>
        )}

        {activeIdea && (
          <div className="space-y-6">
            <div className="rounded-xl border border-line bg-white p-5 sm:p-6">
              {activeIdea.trendGrounded && (
                <span className="mb-3 inline-flex items-center gap-1 rounded-md bg-cobalt/8 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-cobalt">
                  <Sparkles className="h-2.5 w-2.5" /> Trending
                </span>
              )}
              <h2 className="mb-2 text-lg sm:text-xl font-medium text-ink leading-snug">{activeIdea.title}</h2>
              {activeIdea.postCaption && (
                <p className="whitespace-pre-wrap text-[15px] leading-[1.7] text-ink/80">{activeIdea.postCaption}</p>
              )}
              {activeIdea.visualPrompt && activeIdea.visualType !== 'NO_VISUAL' && (
                <details className="mt-4 group">
                  <summary className="cursor-pointer text-[11px] text-ink/40 hover:text-ink/60">Visual direction</summary>
                  <p className="mt-2 text-xs text-ink/50 leading-relaxed">{activeIdea.visualPrompt}</p>
                </details>
              )}
              <div className="mt-5 flex items-center gap-2">
                <button
                  onClick={() => activeIdea.postCaption && handleCopy(activeIdea.postCaption)}
                  className="flex items-center gap-1.5 rounded-lg bg-cobalt px-4 py-2 text-sm text-on-accent hover:bg-cobalt-dark transition-colors"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? 'Copied!' : 'Copy post'}
                </button>
                <button
                  onClick={() => handlePosted(activeIdea.id)}
                  className="flex items-center gap-1.5 rounded-lg border border-line px-4 py-2 text-sm text-ink/60 hover:border-status-success/40 hover:text-status-success transition-colors"
                >
                  <Check className="h-3.5 w-3.5" />
                  {posted ? 'Done!' : 'Posted'}
                </button>
                <button
                  onClick={() => router.push(`/studio/drafts/new?personaId=${personaId}&ideaId=${activeIdea.id}`)}
                  className="rounded-lg px-3 py-2 text-sm text-ink/40 hover:text-ink/70 transition-colors"
                >
                  Edit
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink/30">More ideas</span>
              <button
                onClick={tryAnother}
                disabled={generating}
                className="flex items-center gap-1.5 rounded-lg bg-cobalt px-3 py-2 text-sm text-on-accent hover:bg-cobalt-dark disabled:opacity-50 transition-colors"
              >
                <Shuffle className={`h-3.5 w-3.5 ${generating ? 'animate-spin' : ''}`} />
                {generating ? 'Generating...' : 'New idea'}
              </button>
            </div>

            {alternates.length > 0 && (
              <div className="space-y-2">
                {alternates.map(idea => (
                  <button
                    key={idea.id}
                    onClick={() => { setActiveIdeaId(idea.id); setCopied(false); setPosted(false) }}
                    className={`interactive flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all ${
                      idea.id === activeIdea?.id
                        ? 'border-cobalt/30 bg-cobalt/5'
                        : 'border-line bg-white hover:border-cobalt/20 hover:bg-bone-raised'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink leading-snug">{idea.title}</p>
                      {idea.whyNow && (
                        <p className="mt-0.5 text-[11px] text-ink/40">{idea.whyNow}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {idea.trendGrounded && <span className="h-1.5 w-1.5 rounded-full bg-cobalt" />}
                      <ChevronRight className="h-4 w-4 text-ink/20" />
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="pt-4 border-t border-line">
              <button
                onClick={generateBrief}
                disabled={generating}
                className="flex items-center gap-2 text-sm text-ink/40 hover:text-cobalt transition-colors"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${generating ? 'animate-spin' : ''}`} />
                Regenerate all ideas
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
