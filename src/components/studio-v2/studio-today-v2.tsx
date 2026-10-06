'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, RefreshCw, ChevronRight, Sparkles, AlertCircle, Plus, Shuffle, Check, Users, Eye, ThumbsUp, TrendingUp } from 'lucide-react'
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

export function StudioTodayV2({ personaId, displayName }: StudioTodayV2Props) {
  const router = useRouter()
  const [data, setData] = useState<BriefData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [newIdeaLoading, setNewIdeaLoading] = useState(false)
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [postedId, setPostedId] = useState<string | null>(null)
  const [activeIdeaId, setActiveIdeaId] = useState<string | null>(null)
  const [showFeedback, setShowFeedback] = useState<string | null>(null)
  const [feedbackData, setFeedbackData] = useState<Record<string, { likes?: number; views?: number }>>({})

  const fetchBrief = useCallback(async (): Promise<boolean> => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/content/intelligence/v2/daily-brief?personaId=${personaId}`)
      if (!res.ok) throw new Error('Failed to load')
      const json = await res.json()
      if (json.ideas && json.ideas.length > 0) {
        setData(json)
        const recommended = json.ideas?.find((i: DailyContentIdea) => i.ideaType === 'recommended')
        if (recommended) setActiveIdeaId(recommended.id)
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
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.message || 'Generation failed')
      }
      const json = await res.json()
      if (json.ideas && json.ideas.length > 0) {
        setData(json)
        const recommended = json.ideas?.find((i: DailyContentIdea) => i.ideaType === 'recommended')
        if (recommended) setActiveIdeaId(recommended.id)
      } else {
        throw new Error('No ideas generated')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed. Try again in a moment.')
    } finally {
      setGenerating(false)
    }
  }, [personaId])

  const generateNewIdea = useCallback(async () => {
    if (!data) return
    setNewIdeaLoading(true)
    setError('')
    try {
      const res = await fetch('/api/content/intelligence/v2/daily-brief/idea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaId,
          excludeIdeas: data.ideas.map(i => ({ title: i.title, territory: i.territory ?? '', angle: i.angle ?? '' })),
        }),
      })
      if (!res.ok) throw new Error('Failed to generate new idea')
      const json = await res.json()
      if (json.idea) {
        const updatedIdeas = [...data.ideas, json.idea]
        setData({ ...data, ideas: updatedIdeas })
        setActiveIdeaId(json.idea.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate new idea')
    } finally {
      setNewIdeaLoading(false)
    }
  }, [personaId, data])

  useEffect(() => {
    fetchBrief().then(ok => {
      if (!ok && !error) generateBrief()
    })
  }, [fetchBrief, generateBrief])

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

  const handleMarkPosted = async (ideaId: string) => {
    setPostedId(ideaId)
    await fetch(`/api/content/intelligence/v2/daily-brief/copied`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ideaId, markPosted: true }),
    }).catch(() => {})
    setTimeout(() => {
      setPostedId(null)
      setShowFeedback(ideaId)
    }, 1000)
  }

  const submitFeedback = async (ideaId: string) => {
    const fb = feedbackData[ideaId]
    if (!fb) return
    await fetch('/api/content/intelligence/v2/daily-brief/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ideaId, ...fb }),
    }).catch(() => {})
    setShowFeedback(null)
  }

  const activeIdea = data?.ideas.find(i => i.id === activeIdeaId)
    ?? data?.ideas.find(i => i.ideaType === 'recommended')
    ?? data?.ideas[0]

  const alternates = data?.ideas.filter(i => i.id !== activeIdea?.id) ?? []

  return (
    <div className="min-h-screen bg-bone">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-line bg-bone/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="font-mono text-xs uppercase tracking-[0.15em] text-cobalt">Studio</span>
            <span className="h-3 w-px bg-line hidden sm:block" />
            <span className="text-sm text-ink/70 truncate max-w-[120px] sm:max-w-none">{displayName}</span>
            <button
              onClick={() => router.push('/content?manage=1')}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-ink/40 transition-colors hover:text-cobalt"
              title="Switch persona"
            >
              <Users className="h-3 w-3" />
              <span className="hidden sm:inline">Switch</span>
            </button>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="font-mono text-[11px] text-ink/40 hidden sm:block">
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
            <button
              onClick={() => router.push('/content/new')}
              className="interactive flex items-center gap-1 rounded-md border border-line bg-bone-raised px-2 py-1.5 text-[11px] text-ink/70 transition-colors hover:border-cobalt/40 hover:text-cobalt"
              title="New persona"
            >
              <Plus className="h-3 w-3" />
              <span className="hidden sm:inline">Persona</span>
            </button>
            <button
              onClick={generateBrief}
              disabled={generating}
              className="interactive flex items-center gap-1.5 rounded-md border border-line bg-bone-raised px-2 sm:px-3 py-1.5 text-[11px] text-ink/70 transition-colors hover:border-cobalt/40 hover:text-cobalt disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${generating ? 'animate-spin' : ''}`} />
              {generating ? 'Generating...' : 'Refresh'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {loading && !data && (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="mb-4 h-5 w-5 animate-spin rounded-full border-2 border-cobalt/30 border-t-cobalt" />
            <p className="text-sm text-ink/50">Preparing your editorial brief...</p>
          </div>
        )}

        {error && !generating && (
          <div className="mb-6 rounded-md border border-status-danger/20 bg-status-danger/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-status-danger" />
              <p className="text-sm text-ink/70">{error}</p>
            </div>
            <button
              onClick={generateBrief}
              className="mt-3 flex items-center gap-1.5 rounded-md bg-cobalt px-4 py-2 text-sm text-on-accent transition-colors hover:bg-cobalt-dark"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Generate today&apos;s post
            </button>
          </div>
        )}

        {generating && !data && (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="mb-4 h-5 w-5 animate-spin rounded-full border-2 border-cobalt/30 border-t-cobalt" />
            <p className="text-sm text-ink/50">Preparing your editorial brief...</p>
          </div>
        )}

        {activeIdea && (
          <div className="space-y-8">
            {/* Recommended Post */}
            <section>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-cobalt" />
                  <h2 className="font-mono text-xs uppercase tracking-[0.12em] text-ink/50">
                    Your post for today
                  </h2>
                </div>
                <button
                  onClick={generateNewIdea}
                  disabled={newIdeaLoading}
                  className="interactive flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[11px] text-ink/60 transition-colors hover:border-cobalt/40 hover:text-cobalt disabled:opacity-50"
                >
                  <Shuffle className={`h-3 w-3 ${newIdeaLoading ? 'animate-spin' : ''}`} />
                  {newIdeaLoading ? 'Thinking...' : 'Try another'}
                </button>
              </div>

              <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
                {/* Post content */}
                <div className="rounded-lg border border-line bg-bone-raised p-4 sm:p-6">
                  <h3 className="mb-3 text-base sm:text-lg font-medium text-ink leading-snug">{activeIdea.title}</h3>
                  {activeIdea.angle && (
                    <p className="mb-4 text-sm leading-relaxed text-ink/60">{activeIdea.angle}</p>
                  )}
                  {activeIdea.postCaption && (
                    <div className="whitespace-pre-wrap border-l-2 border-cobalt/30 pl-4 text-[14px] sm:text-[15px] leading-[1.7] text-ink/85">
                      {activeIdea.postCaption}
                    </div>
                  )}
                  <div className="mt-6 flex flex-wrap items-center gap-2 sm:gap-3">
                    <button
                      onClick={() => activeIdea.postCaption && handleCopy(activeIdea.postCaption, activeIdea.id)}
                      className="flex items-center gap-1.5 rounded-md bg-cobalt px-3 sm:px-4 py-2 text-sm text-on-accent transition-colors hover:bg-cobalt-dark"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copiedId === activeIdea.id ? 'Copied!' : 'Copy post'}
                    </button>
                    <button
                      onClick={() => handleMarkPosted(activeIdea.id)}
                      className="flex items-center gap-1.5 rounded-md border border-line px-3 sm:px-4 py-2 text-sm text-ink/70 transition-colors hover:border-status-success/40 hover:text-status-success"
                    >
                      <Check className="h-3.5 w-3.5" />
                      {postedId === activeIdea.id ? 'Marked!' : 'Mark posted'}
                    </button>
                    <button
                      onClick={() => router.push(`/studio/drafts/new?personaId=${personaId}&ideaId=${activeIdea.id}`)}
                      className="interactive flex items-center gap-1.5 rounded-md border border-line px-3 sm:px-4 py-2 text-sm text-ink/70 transition-colors hover:border-ink/30"
                    >
                      Edit
                    </button>
                  </div>
                </div>

                {/* Visual direction */}
                <div className="rounded-lg border border-line bg-bone-raised p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="rounded-md bg-cobalt/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-cobalt">
                      {activeIdea.visualType === 'NO_VISUAL' ? 'Text Only' : 'Visual'}
                    </span>
                    {activeIdea.visualPrompt && (
                      <button
                        onClick={() => handleCopy(activeIdea.visualPrompt!, 'visual')}
                        className="flex items-center gap-1 text-[11px] text-cobalt hover:underline"
                      >
                        <Copy className="h-3 w-3" />
                        {copiedId === 'visual' ? 'Copied!' : 'Copy prompt'}
                      </button>
                    )}
                  </div>
                  <p className="mb-2 text-sm font-medium text-ink">{activeIdea.visualConcept}</p>
                  {activeIdea.visualPrompt && (
                    <p className="text-xs leading-relaxed text-ink/60">{activeIdea.visualPrompt}</p>
                  )}
                  {activeIdea.visualReason && (
                    <p className="mt-2 text-[11px] text-ink/40">{activeIdea.visualReason}</p>
                  )}
                </div>
              </div>

              {/* Source provenance */}
              {activeIdea.whyNow && (
                <div className="mt-3 flex items-center gap-2 text-[11px] text-ink/40">
                  <span className="rounded-md bg-ink/5 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider">
                    {activeIdea.sourceFreshness ?? 'editorial'}
                  </span>
                  <span>{activeIdea.whyNow}</span>
                </div>
              )}

              {/* Feedback prompt after marking posted */}
              {showFeedback === activeIdea.id && (
                <div className="mt-4 rounded-md border border-cobalt/20 bg-cobalt/5 p-4">
                  <p className="mb-3 text-sm font-medium text-ink">How did this post perform?</p>
                  <p className="mb-3 text-xs text-ink/50">This helps Studio learn what works for your audience.</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-ink/70">
                      <ThumbsUp className="h-3.5 w-3.5" />
                      <span>Likes</span>
                      <input
                        type="number"
                        min={0}
                        placeholder="0"
                        onChange={e => setFeedbackData(prev => ({
                          ...prev,
                          [activeIdea.id]: { ...prev[activeIdea.id], likes: parseInt(e.target.value) || 0 },
                        }))}
                        className="w-16 rounded border border-line px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-ink/70">
                      <Eye className="h-3.5 w-3.5" />
                      <span>Views</span>
                      <input
                        type="number"
                        min={0}
                        placeholder="0"
                        onChange={e => setFeedbackData(prev => ({
                          ...prev,
                          [activeIdea.id]: { ...prev[activeIdea.id], views: parseInt(e.target.value) || 0 },
                        }))}
                        className="w-16 rounded border border-line px-2 py-1 text-sm"
                      />
                    </label>
                    <button
                      onClick={() => submitFeedback(activeIdea.id)}
                      className="rounded-md bg-cobalt px-3 py-1.5 text-sm text-on-accent hover:bg-cobalt-dark"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setShowFeedback(null)}
                      className="text-sm text-ink/40 hover:text-ink/60"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Alternate Ideas */}
            {alternates.length > 0 && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-mono text-xs uppercase tracking-[0.12em] text-ink/50">
                    Other ideas today
                  </h2>
                  <span className="text-[11px] text-ink/30">{alternates.length} alternatives</span>
                </div>
                <div className="space-y-2">
                  {alternates.map(idea => (
                    <button
                      key={idea.id}
                      onClick={() => setActiveIdeaId(idea.id)}
                      className={`interactive flex w-full items-center justify-between rounded-md border px-4 py-3 text-left transition-colors ${
                        idea.id === activeIdea?.id
                          ? 'border-cobalt/40 bg-cobalt/5'
                          : 'border-line bg-bone-raised hover:border-cobalt/30'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{idea.title}</p>
                        {idea.whyNow && (
                          <p className="mt-0.5 truncate text-xs text-ink/40">{idea.whyNow}</p>
                        )}
                      </div>
                      <div className="ml-3 flex items-center gap-2 shrink-0">
                        {idea.trendGrounded && (
                          <TrendingUp className="h-3 w-3 text-cobalt" />
                        )}
                        <ChevronRight className="h-4 w-4 text-ink/30" />
                      </div>
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
