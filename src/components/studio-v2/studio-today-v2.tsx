'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Shuffle, Check, AlertCircle, Plus, Users, RefreshCw, Download, Image, Sparkles } from 'lucide-react'
import type { DailyContentIdea } from '@/lib/domain/types'
import { generatePostImage } from '@/lib/ai/fal-image'

interface Props {
  personaId: string
  personaName?: string
  displayName: string
}

interface BriefData {
  brief: { id: string; status: string; localDate: string }
  ideas: DailyContentIdea[]
}

export function StudioTodayV2({ personaId, displayName }: Props) {
  const router = useRouter()
  const [data, setData] = useState<BriefData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [posted, setPosted] = useState(false)
  const [activeIdeaId, setActiveIdeaId] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageLoading, setImageLoading] = useState(false)
  const [imageError, setImageError] = useState('')


  // ── Data fetching ──

  const fetchBrief = useCallback(async (): Promise<boolean> => {
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
    } catch { return false }
  }, [personaId])

  const generateBrief = useCallback(async () => {
    setGenerating(true)
    setError('')
    setImageUrl(null)
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
    } catch { setError('Generation failed. Try again.') }
    finally { setGenerating(false) }
  }, [personaId])

  const tryAnother = useCallback(async () => {
    if (!data) return
    setGenerating(true)
    setImageUrl(null)
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
    } catch { /* keep current */ }
    finally { setGenerating(false) }
  }, [personaId, data])

  useEffect(() => {
    fetchBrief().then(ok => { if (!ok) generateBrief() }).finally(() => setLoading(false))
  }, [fetchBrief, generateBrief])

  // ── Actions ──

  const handleCopy = () => {
    if (!activeIdea?.postCaption) return
    navigator.clipboard.writeText(activeIdea.postCaption)
    setCopied(true)
    fetch(`/api/content/intelligence/v2/daily-brief/copied`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ideaId: activeIdea.id }),
    }).catch(() => {})
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePosted = () => {
    if (!activeIdea) return
    setPosted(true)
    fetch(`/api/content/intelligence/v2/daily-brief/copied`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ideaId: activeIdea.id, markPosted: true }),
    }).catch(() => {})
    setTimeout(() => setPosted(false), 2000)
  }

  // ── Derived state ──

  const activeIdea = data?.ideas.find(i => i.id === activeIdeaId) ?? data?.ideas[0]
  const trendLabel = activeIdea?.trendGrounded ? 'Trending topic' : 'Editorial'

  const generateImage = useCallback(async () => {
    if (!activeIdea) return
    setImageLoading(true)
    setImageError('')
    try {
      const prompt = activeIdea.visualPrompt || `${activeIdea.title}. ${activeIdea.angle || ''}`
      const result = await generatePostImage(prompt, { aspectRatio: '16:9' })
      setImageUrl(result.url)
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Image generation failed')
    } finally {
      setImageLoading(false)
    }
  }, [activeIdea])

  const downloadImage = () => {
    if (!imageUrl) return
    const a = document.createElement('a')
    a.href = imageUrl
    a.download = `relay-post-${Date.now()}.png`
    a.click()
  }

  // ── Render ──

  return (
    <div className="min-h-screen bg-bone">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-line bg-bone/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-[0.15em] text-cobalt">Studio</span>
            <span className="h-3 w-px bg-line" />
            <span className="text-sm font-medium text-ink/70">{displayName}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/content?manage=1')}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-ink/50 transition-colors hover:bg-bone-raised hover:text-cobalt"
            >
              <Users className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Switch</span>
            </button>
            <button
              onClick={() => router.push('/content/new')}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-ink/50 transition-colors hover:bg-bone-raised hover:text-cobalt"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Persona</span>
            </button>
            <span className="font-mono text-[11px] text-ink/30 hidden sm:block">
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
        {/* Loading state */}
        {loading && !data && (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="mb-4 h-6 w-6 animate-spin rounded-full border-2 border-cobalt/30 border-t-cobalt" />
            <p className="text-sm text-ink/40">Preparing today&apos;s post...</p>
          </div>
        )}

        {/* Error state */}
        {error && !generating && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-status-danger/20 bg-status-danger/5 px-4 py-3">
            <AlertCircle className="h-4 w-4 shrink-0 text-status-danger" />
            <p className="text-sm text-ink/70 flex-1">{error}</p>
            <button onClick={generateBrief} className="text-sm font-medium text-cobalt hover:underline">Retry</button>
          </div>
        )}

        {/* Main content */}
        {activeIdea && (
          <div className="space-y-6">
            {/* Post preview card */}
            <div className="rounded-2xl border border-line bg-bone-raised overflow-hidden">
              {/* Post header */}
              <div className="flex items-center gap-3 border-b border-line px-5 py-3">
                <div className="h-10 w-10 rounded-full bg-cobalt/10 flex items-center justify-center text-cobalt font-semibold text-sm">
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-ink">{displayName}</p>
                  <p className="text-[11px] text-ink/40">Original Creator · 1st</p>
                </div>
                <div className="ml-auto">
                  <span className="rounded-full bg-cobalt/8 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-cobalt">
                    {trendLabel}
                  </span>
                </div>
              </div>

              {/* Post body */}
              <div className="px-5 py-5">
                <h2 className="mb-3 text-xl font-semibold text-ink leading-snug">{activeIdea.title}</h2>
                {activeIdea.postCaption && (
                  <div className="whitespace-pre-wrap text-[15px] leading-[1.7] text-ink/80">
                    {activeIdea.postCaption}
                  </div>
                )}
                {activeIdea.angle && !activeIdea.postCaption && (
                  <p className="text-sm leading-relaxed text-ink/60">{activeIdea.angle}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 border-t border-line px-5 py-3 bg-bone/50">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-2 rounded-lg bg-cobalt px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-cobalt-dark"
                >
                  <Copy className="h-4 w-4" />
                  {copied ? 'Copied!' : 'Copy post'}
                </button>
                <button
                  onClick={handlePosted}
                  className="flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink/60 transition-colors hover:border-status-success/40 hover:text-status-success"
                >
                  <Check className="h-4 w-4" />
                  {posted ? 'Posted!' : 'Mark posted'}
                </button>
                <button
                  onClick={tryAnother}
                  disabled={generating}
                  className="flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink/60 transition-colors hover:border-cobalt/40 hover:text-cobalt disabled:opacity-50"
                >
                  <Shuffle className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
                  {generating ? 'Generating...' : 'Try another'}
                </button>
                <button
                  onClick={() => router.push(`/studio/drafts/new?personaId=${personaId}&ideaId=${activeIdea.id}`)}
                  className="ml-auto rounded-lg px-3 py-2 text-sm text-ink/40 transition-colors hover:text-ink/70"
                >
                  Edit
                </button>
              </div>
            </div>

            {/* Image generation */}
            <div className="rounded-2xl border border-line bg-bone-raised p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Image className="h-4 w-4 text-cobalt" />
                  <span className="text-sm font-medium text-ink">Post Image</span>
                </div>
                <button
                  onClick={generateImage}
                  disabled={imageLoading}
                  className="flex items-center gap-1.5 rounded-lg bg-cobalt px-3 py-1.5 text-xs font-medium text-on-accent hover:bg-cobalt-dark disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${imageLoading ? 'animate-spin' : ''}`} />
                  {imageLoading ? 'Creating...' : imageUrl ? 'Regenerate' : 'Generate'}
                </button>
              </div>

              {imageError && (
                <div className="mb-3 flex items-center gap-2 rounded-lg bg-status-danger/5 px-3 py-2">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-status-danger" />
                  <p className="text-xs text-ink/60">{imageError}</p>
                </div>
              )}

              {imageUrl ? (
                <div className="space-y-3">
                  <img src={imageUrl} alt="Post visual" className="w-full rounded-lg border border-line" />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={downloadImage}
                      className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-ink/60 hover:border-cobalt/40 hover:text-cobalt"
                    >
                      <Download className="h-3 w-3" />
                      Download
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-line/50 py-12 text-center">
                  <Image className="mb-3 h-8 w-8 text-ink/20" />
                  <p className="text-sm text-ink/40">Generate an image for this post</p>
                  <p className="mt-1 text-[11px] text-ink/30">1200×630 branded visual via FAL.AI</p>
                </div>
              )}


            </div>

            {/* Source context */}
            {activeIdea.whyNow && activeIdea.trendGrounded && (
              <div className="flex items-center gap-2 rounded-xl bg-cobalt/5 px-4 py-3">
                <span className="h-2 w-2 rounded-full bg-cobalt" />
                <p className="text-xs text-ink/50">
                  <span className="font-medium text-cobalt">Why now:</span> {activeIdea.whyNow}
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
