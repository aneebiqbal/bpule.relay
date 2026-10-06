'use client'

import { useEffect, useState, useCallback } from 'react'
import { Copy, RefreshCw, ChevronRight, AlertCircle, Check, Plus } from 'lucide-react'
import type { DailyGrowthBrief } from '@/lib/domain/types'

export function GrowthTodayV2() {
  const [data, setData] = useState<DailyGrowthBrief | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [posted, setPosted] = useState(false)

  const fetchBrief = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/growth-v2/daily')
      if (!res.ok) throw new Error('Failed to load')
      const json = await res.json()
      setData(json.brief)
    } catch {
      setError('Could not load today\'s post.')
    } finally {
      setLoading(false)
    }
  }, [])

  const generateBrief = useCallback(async () => {
    setGenerating(true)
    setError('')
    setPosted(false)
    try {
      const res = await fetch('/api/growth-v2/daily', { method: 'POST' })
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.message || 'Generation failed')
      }
      const json = await res.json()
      setData(json.brief)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed. Try again.')
    } finally {
      setGenerating(false)
    }
  }, [])

  useEffect(() => {
    fetchBrief()
  }, [fetchBrief])

  useEffect(() => {
    if (data?.copiedAt) setPosted(true)
  }, [data?.copiedAt])

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      // ignore
    }
  }

  const handleMarkPosted = async () => {
    setPosted(true)
    await fetch('/api/growth-v2/daily', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markPosted: true }),
    }).catch(() => {})
  }

  return (
    <div className="min-h-screen bg-bone">
      <header className="sticky top-0 z-10 border-b border-line bg-bone/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="font-mono text-xs uppercase tracking-[0.15em] text-orange-signal">Relay Growth</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="font-mono text-[11px] text-ink/40 hidden sm:block">
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
            <button
              onClick={generateBrief}
              disabled={generating}
              className="interactive flex items-center gap-1.5 rounded-md border border-line bg-bone-raised px-2 sm:px-3 py-1.5 text-[11px] text-ink/70 transition-colors hover:border-orange/40 hover:text-orange disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${generating ? 'animate-spin' : ''}`} />
              {generating ? 'Generating...' : 'Try another'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {loading && !data && (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="mb-4 h-5 w-5 animate-spin rounded-full border-2 border-orange/30 border-t-orange" />
            <p className="text-sm text-ink/50">Preparing today&apos;s post...</p>
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
              className="mt-3 flex items-center gap-1.5 rounded-md bg-orange-signal px-4 py-2 text-sm text-on-accent transition-colors hover:bg-orange-dark"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Generate new post
            </button>
          </div>
        )}

        {generating && !data && (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="mb-4 h-5 w-5 animate-spin rounded-full border-2 border-orange/30 border-t-orange" />
            <p className="text-sm text-ink/50">Preparing today&apos;s post...</p>
          </div>
        )}

        {data && (
          <div className="space-y-8">
            {/* Today's Post */}
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-mono text-xs uppercase tracking-[0.12em] text-ink/50">
                  Today&apos;s post
                </h2>
                <button
                  onClick={generateBrief}
                  disabled={generating}
                  className="interactive flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[11px] text-ink/60 transition-colors hover:border-orange/40 hover:text-orange disabled:opacity-50"
                >
                  <Plus className={`h-3 w-3 ${generating ? 'animate-spin' : ''}`} />
                  {generating ? 'Generating...' : 'New post'}
                </button>
              </div>
              <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
                <div className="rounded-lg border border-line bg-bone-raised p-4 sm:p-6">
                  {data.postCaption && (
                    <div className="whitespace-pre-wrap border-l-2 border-orange/30 pl-4 text-[14px] sm:text-[15px] leading-[1.7] text-ink/85">
                      {data.postCaption}
                    </div>
                  )}
                  <div className="mt-6 flex flex-wrap items-center gap-2 sm:gap-3">
                    <button
                      onClick={() => data.postCaption && handleCopy(data.postCaption, 'post')}
                      className="flex items-center gap-1.5 rounded-md bg-orange-signal px-3 sm:px-4 py-2 text-sm text-on-accent transition-colors hover:bg-orange-dark"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copiedField === 'post' ? 'Copied!' : 'Copy post'}
                    </button>
                    <button
                      onClick={handleMarkPosted}
                      className="flex items-center gap-1.5 rounded-md border border-line px-3 sm:px-4 py-2 text-sm text-ink/70 transition-colors hover:border-status-success/40 hover:text-status-success"
                    >
                      <Check className="h-3.5 w-3.5" />
                      {posted ? 'Marked!' : 'Mark posted'}
                    </button>
                  </div>
                </div>

                {/* Visual direction */}
                {data.visualType && data.visualType !== 'NO_VISUAL' && (
                  <div className="rounded-lg border border-line bg-bone-raised p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="rounded-md bg-orange/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-orange">
                        Visual
                      </span>
                      {data.visualPrompt && (
                        <button
                          onClick={() => handleCopy(data.visualPrompt!, 'visual')}
                          className="flex items-center gap-1 text-[11px] text-orange hover:underline"
                        >
                          <Copy className="h-3 w-3" />
                          {copiedField === 'visual' ? 'Copied!' : 'Copy prompt'}
                        </button>
                      )}
                    </div>
                    <p className="mb-2 text-sm font-medium text-ink">{data.visualConcept}</p>
                    {data.visualPrompt && (
                      <p className="text-xs leading-relaxed text-ink/60">{data.visualPrompt}</p>
                    )}
                    {data.visualReason && (
                      <p className="mt-2 text-[11px] text-ink/40">{data.visualReason}</p>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Alternate ideas */}
            {data.alternateIdeas && data.alternateIdeas.length > 0 && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-mono text-xs uppercase tracking-[0.12em] text-ink/50">
                    Other ideas
                  </h2>
                  <span className="text-[11px] text-ink/30">{data.alternateIdeas.length} alternatives</span>
                </div>
                <div className="space-y-2">
                  {data.alternateIdeas.map((idea, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-md border border-line bg-bone-raised px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{idea.title}</p>
                        {idea.whyNow && (
                          <p className="mt-0.5 truncate text-xs text-ink/40">{idea.whyNow}</p>
                        )}
                      </div>
                      <ChevronRight className="ml-3 h-4 w-4 shrink-0 text-ink/30" />
                    </div>
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
