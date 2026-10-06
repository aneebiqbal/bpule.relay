'use client'

import { useEffect, useState, useCallback } from 'react'
import { Copy, RefreshCw, AlertCircle, Check } from 'lucide-react'
import type { DailyGrowthBrief } from '@/lib/domain/types'

export function GrowthTodayV2() {
  const [data, setData] = useState<DailyGrowthBrief | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [posted, setPosted] = useState(false)

  const fetchBrief = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/growth-v2/daily')
      if (!res.ok) return false
      const json = await res.json()
      if (json.brief) { setData(json.brief); return true }
      return false
    } catch { return false }
  }, [])

  const generateBrief = useCallback(async () => {
    setGenerating(true)
    setError('')
    try {
      const res = await fetch('/api/growth-v2/daily', { method: 'POST' })
      if (!res.ok) throw new Error('Failed')
      const json = await res.json()
      if (json.brief) setData(json.brief)
    } catch { setError('Generation failed. Try again.') }
    finally { setGenerating(false) }
  }, [])

  useEffect(() => {
    fetchBrief().then(ok => { if (!ok) generateBrief() }).finally(() => setLoading(false))
  }, [fetchBrief, generateBrief])

  const handleCopy = () => {
    if (!data?.postCaption) return
    navigator.clipboard.writeText(data.postCaption)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePosted = () => {
    setPosted(true)
    fetch('/api/growth-v2/daily', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markPosted: true }),
    }).catch(() => {})
    setTimeout(() => setPosted(false), 2000)
  }

  return (
    <div className="min-h-screen bg-bone">
      <header className="sticky top-0 z-10 border-b border-line bg-bone/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-[0.15em] text-orange-signal">Relay Growth</span>
            <span className="h-3 w-px bg-line" />
            <span className="text-sm font-medium text-ink/70">Brand account</span>
          </div>
          <span className="font-mono text-[11px] text-ink/30">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
        {loading && !data && (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="mb-4 h-6 w-6 animate-spin rounded-full border-2 border-orange/30 border-t-orange" />
            <p className="text-sm text-ink/40">Preparing today&apos;s post...</p>
          </div>
        )}

        {error && !generating && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-status-danger/20 bg-status-danger/5 px-4 py-3">
            <AlertCircle className="h-4 w-4 shrink-0 text-status-danger" />
            <p className="text-sm text-ink/70 flex-1">{error}</p>
            <button onClick={generateBrief} className="text-sm font-medium text-orange-signal hover:underline">Retry</button>
          </div>
        )}

        {data && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-line bg-bone-raised overflow-hidden">
              <div className="flex items-center gap-3 border-b border-line px-5 py-3">
                <div className="h-10 w-10 rounded-full bg-orange-signal/10 flex items-center justify-center text-orange-signal font-semibold text-sm">R</div>
                <div>
                  <p className="text-sm font-medium text-ink">Relay</p>
                  <p className="text-[11px] text-ink/40">Revenue Intelligence · 1st</p>
                </div>
              </div>

              <div className="px-5 py-5">
                {data.postCaption ? (
                  <div className="whitespace-pre-wrap text-[15px] leading-[1.7] text-ink/80">{data.postCaption}</div>
                ) : (
                  <p className="text-sm text-ink/40">No post generated yet. Click below.</p>
                )}
              </div>

              <div className="flex items-center gap-2 border-t border-line px-5 py-3 bg-bone/50">
                <button
                  onClick={handleCopy}
                  disabled={!data.postCaption}
                  className="flex items-center gap-2 rounded-lg bg-orange-signal px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-orange-dark disabled:opacity-50"
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
                  onClick={generateBrief}
                  disabled={generating}
                  className="ml-auto flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink/40 transition-colors hover:text-orange-signal disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
                  {generating ? 'Generating...' : 'New post'}
                </button>
              </div>
            </div>

            {data.alternateIdeas && data.alternateIdeas.length > 0 && (
              <div className="rounded-xl border border-line bg-bone-raised p-4">
                <p className="mb-3 font-mono text-[11px] uppercase tracking-wider text-ink/30">Other angles</p>
                <div className="space-y-2">
                  {data.alternateIdeas.map((idea, i) => (
                    <div key={i} className="rounded-lg bg-bone px-3 py-2">
                      <p className="text-sm text-ink/70">{idea.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.visualType && data.visualType !== 'NO_VISUAL' && data.visualPrompt && (
              <details className="rounded-xl border border-line bg-bone-raised p-4">
                <summary className="cursor-pointer text-sm text-ink/50">Visual direction</summary>
                <p className="mt-2 text-xs text-ink/50 leading-relaxed">{data.visualPrompt}</p>
              </details>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
