'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, RefreshCw, ChevronRight, Sparkles, AlertCircle } from 'lucide-react'
import type { DailyContentIdea } from '@/lib/domain/types'

interface StudioTodayV2Props {
  personaId: string
  personaName: string
  displayName: string
}

interface BriefData {
  brief: { id: string; status: string; localDate: string }
  ideas: DailyContentIdea[]
}

export function StudioTodayV2({ personaId, personaName, displayName }: StudioTodayV2Props) {
  const router = useRouter()
  const [data, setData] = useState<BriefData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [activeIdeaId, setActiveIdeaId] = useState<string | null>(null)

  const fetchBrief = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/content/intelligence/v2/daily-brief?personaId=${personaId}`)
      if (!res.ok) throw new Error('Failed to load')
      const json = await res.json()
      setData(json)
      const recommended = json.ideas?.find((i: DailyContentIdea) => i.ideaType === 'recommended')
      if (recommended) setActiveIdeaId(recommended.id)
    } catch {
      setError('Could not load today\'s brief. Pull to refresh.')
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
      if (!res.ok) throw new Error('Generation failed')
      const json = await res.json()
      setData(json)
      const recommended = json.ideas?.find((i: DailyContentIdea) => i.ideaType === 'recommended')
      if (recommended) setActiveIdeaId(recommended.id)
    } catch {
      setError('Generation failed. Try again in a moment.')
    } finally {
      setGenerating(false)
    }
  }, [personaId])

  useEffect(() => {
    fetchBrief()
  }, [fetchBrief])

  const handleCopy = async (caption: string, ideaId: string) => {
    try {
      await navigator.clipboard.writeText(caption)
      setCopiedId(ideaId)
      await fetch(`/api/content/intelligence/v2/daily-brief/copied`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideaId }),
      }).catch(() => {})
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // Clipboard may be unavailable
    }
  }

  const activeIdea = data?.ideas.find(i => i.id === activeIdeaId)
    ?? data?.ideas.find(i => i.ideaType === 'recommended')
    ?? data?.ideas[0]

  const alternates = data?.ideas.filter(i => i.id !== activeIdea?.id) ?? []

  return (
    <div className="min-h-screen bg-studio-paper">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-ink/10 bg-studio-paper/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <span className="font-mono text-xs uppercase tracking-[0.15em] text-ink/50">Studio</span>
            <span className="h-3 w-px bg-ink/15" />
            <span className="text-sm text-ink/70">{displayName}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-ink/40">
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
            <button
              onClick={generateBrief}
              disabled={generating}
              className="flex items-center gap-1.5 rounded-md border border-ink/15 bg-white px-3 py-1.5 text-xs text-ink/70 transition-colors hover:border-cobalt/40 hover:text-cobalt disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${generating ? 'animate-spin' : ''}`} />
              {generating ? 'Generating...' : 'Refresh'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {loading && !data && (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="mb-4 h-5 w-5 animate-spin rounded-full border-2 border-cobalt/30 border-t-cobalt" />
            <p className="text-sm text-ink/50">Preparing your editorial brief...</p>
          </div>
        )}

        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-md border border-status-danger/20 bg-status-danger/5 px-4 py-3">
            <AlertCircle className="h-4 w-4 text-status-danger" />
            <p className="text-sm text-ink/70">{error}</p>
          </div>
        )}

        {activeIdea && (
          <div className="space-y-8">
            {/* Recommended Post */}
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cobalt" />
                <h2 className="font-mono text-xs uppercase tracking-[0.12em] text-ink/50">
                  Your post for today
                </h2>
              </div>

              <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
                {/* Post content */}
                <div className="rounded-lg border border-ink/10 bg-white p-6 shadow-sm">
                  <h3 className="mb-3 text-lg font-medium text-ink">{activeIdea.title}</h3>
                  {activeIdea.angle && (
                    <p className="mb-4 text-sm leading-relaxed text-ink/60">{activeIdea.angle}</p>
                  )}
                  {activeIdea.postCaption && (
                    <div className="whitespace-pre-wrap border-l-2 border-cobalt/30 pl-4 text-[15px] leading-[1.7] text-ink/85">
                      {activeIdea.postCaption}
                    </div>
                  )}
                  <div className="mt-6 flex items-center gap-3">
                    <button
                      onClick={() => activeIdea.postCaption && handleCopy(activeIdea.postCaption, activeIdea.id)}
                      className="flex items-center gap-1.5 rounded-md bg-cobalt px-4 py-2 text-sm text-white transition-colors hover:bg-cobalt-dark"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copiedId === activeIdea.id ? 'Copied!' : 'Copy post'}
                    </button>
                    <button
                      onClick={() => router.push(`/studio/drafts/new?personaId=${personaId}&ideaId=${activeIdea.id}`)}
                      className="flex items-center gap-1.5 rounded-md border border-ink/15 px-4 py-2 text-sm text-ink/70 transition-colors hover:border-ink/30"
                    >
                      Edit
                    </button>
                  </div>
                </div>

                {/* Visual direction */}
                {activeIdea.visualType && activeIdea.visualType !== 'NO_VISUAL' && (
                  <div className="rounded-lg border border-ink/10 bg-white p-4">
                    <span className="mb-3 inline-block rounded-md bg-cobalt-faint px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-cobalt">
                      Visual
                    </span>
                    <p className="mb-2 text-sm font-medium text-ink">{activeIdea.visualConcept}</p>
                    {activeIdea.visualPrompt && (
                      <p className="text-xs leading-relaxed text-ink/50">{activeIdea.visualPrompt}</p>
                    )}
                    {activeIdea.visualReason && (
                      <p className="mt-2 text-[11px] text-ink/40">{activeIdea.visualReason}</p>
                    )}
                    {activeIdea.visualPrompt && (
                      <button
                        onClick={() => navigator.clipboard.writeText(activeIdea.visualPrompt!)}
                        className="mt-3 text-[11px] text-cobalt hover:underline"
                      >
                        Copy image prompt
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Source provenance */}
              {activeIdea.whyNow && (
                <div className="mt-3 flex items-center gap-2 text-[11px] text-ink/40">
                  <span className="rounded-sm bg-ink/5 px-1.5 py-0.5 font-mono uppercase">{activeIdea.sourceFreshness ?? 'editorial'}</span>
                  <span>{activeIdea.whyNow}</span>
                </div>
              )}
            </section>

            {/* Alternate Ideas */}
            {alternates.length > 0 && (
              <section>
                <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.12em] text-ink/50">
                  Other ideas today
                </h2>
                <div className="space-y-2">
                  {alternates.map(idea => (
                    <button
                      key={idea.id}
                      onClick={() => setActiveIdeaId(idea.id)}
                      className="flex w-full items-center justify-between rounded-md border border-ink/8 bg-white px-4 py-3 text-left transition-colors hover:border-cobalt/30 hover:bg-cobalt-faint/30"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{idea.title}</p>
                        {idea.whyNow && (
                          <p className="mt-0.5 truncate text-xs text-ink/40">{idea.whyNow}</p>
                        )}
                      </div>
                      <ChevronRight className="ml-3 h-4 w-4 shrink-0 text-ink/30" />
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
