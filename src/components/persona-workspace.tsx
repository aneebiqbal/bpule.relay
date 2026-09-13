'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, AlertTriangle, CheckCircle2, Copy, Check, RefreshCw, Sparkles, Plus } from 'lucide-react'
import { cn } from 'cn'
import type {
  ContentPersona,
  TopicCluster,
  ContentDraft,
  ContentHistoryEntry,
  ContentResearchFinding,
} from '@/lib/domain/types'

type DailyDecision = {
  decisionType: 'question' | 'react' | 'ready' | 'none'
  prompt?: string
  reason?: string
  topicCluster?: TopicCluster | null
  finding?: ContentResearchFinding | null
}

export function PersonaWorkspace({
  persona,
  topicClusters,
  drafts,
  history,
  findings,
}: {
  persona: ContentPersona
  topicClusters: TopicCluster[]
  drafts: ContentDraft[]
  history: ContentHistoryEntry[]
  findings: ContentResearchFinding[]
}) {
  const router = useRouter()
  const [sourceMaterial, setSourceMaterial] = useState('')
  const [selectedTopicClusterId, setSelectedTopicClusterId] = useState(topicClusters[0]?.id ?? '')
  const [platform, setPlatform] = useState<'linkedin' | 'x'>('linkedin')
  const [decision, setDecision] = useState<DailyDecision | null>(null)
  const [loadingDecision, setLoadingDecision] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [draftText, setDraftText] = useState('')
  const [hookScore, setHookScore] = useState<number | null>(null)
  const [hookFeedback, setHookFeedback] = useState('')
  const [selfCheckPassed, setSelfCheckPassed] = useState(false)
  const [selfCheckNote, setSelfCheckNote] = useState('')
  const [bannedHits, setBannedHits] = useState<string[]>([])
  const [specificityHit, setSpecificityHit] = useState(true)
  const [copied, setCopied] = useState(false)

  const [showAddCluster, setShowAddCluster] = useState(false)
  const [newClusterName, setNewClusterName] = useState('')
  const [newClusterDescription, setNewClusterDescription] = useState('')
  const [addingCluster, setAddingCluster] = useState(false)

  const [showAddFinding, setShowAddFinding] = useState(false)
  const [findingClusterId, setFindingClusterId] = useState(topicClusters[0]?.id ?? '')
  const [findingText, setFindingText] = useState('')
  const [findingSourceLabel, setFindingSourceLabel] = useState('')
  const [findingSourceUrl, setFindingSourceUrl] = useState('')
  const [addingFinding, setAddingFinding] = useState(false)

  const activeDrafts = drafts.filter((d) => d.status === 'draft' || d.status === 'ready')

  const metrics = useMemo(() => {
    const captureDates = Array.from(new Set(drafts
      .filter((d) => d.sourceMaterial.trim().length > 0)
      .map((d) => new Date(d.createdAt).toISOString().slice(0, 10))))
      .sort((a, b) => b.localeCompare(a))

    let streak = 0
    if (captureDates.length > 0) {
      const cursor = new Date()
      cursor.setHours(0, 0, 0, 0)
      for (let i = 0; i < 120; i += 1) {
        const day = cursor.toISOString().slice(0, 10)
        if (!captureDates.includes(day)) break
        streak += 1
        cursor.setDate(cursor.getDate() - 1)
      }
    }

    const withSpecificity = drafts.filter((d) => d.selfCheckPassed).length
    const specificCount = drafts.filter((d) => d.selfCheckPassed && d.specificityHit).length
    const specificityRate = withSpecificity > 0 ? Math.round((specificCount / withSpecificity) * 100) : 0
    return {
      streak,
      specificityRate,
      questionComments: 0,
    }
  }, [drafts])

  const loadDecision = useCallback(async () => {
    setLoadingDecision(true)
    try {
      const res = await fetch(`/api/content/daily?personaId=${persona.id}`)
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Failed to load daily brief.')
      setDecision(data as DailyDecision)
      if (data?.topicCluster?.id && !selectedTopicClusterId) {
        setSelectedTopicClusterId(data.topicCluster.id)
      }
    } catch {
      setDecision({ decisionType: 'none', reason: 'No daily brief available right now.' })
    } finally {
      setLoadingDecision(false)
    }
  }, [persona.id, selectedTopicClusterId])

  useEffect(() => {
    void loadDecision()
  }, [loadDecision])

  const runGeneration = useCallback(async () => {
    setGenerating(true)
    setDraftError(null)
    setStatusMessage('Starting...')
    setDraftText('')
    setHookScore(null)
    setHookFeedback('')
    setSelfCheckPassed(false)
    setSelfCheckNote('')
    setBannedHits([])
    setSpecificityHit(true)

    try {
      const payload: Record<string, unknown> = {
        personaId: persona.id,
        topicClusterId: selectedTopicClusterId || decision?.topicCluster?.id || null,
        sourceMaterial: sourceMaterial.trim(),
        platform,
      }

      if (decision?.decisionType === 'react' && decision.finding?.id) payload.findingId = decision.finding.id
      if (decision?.decisionType === 'ready' && !sourceMaterial.trim()) payload.useStoredOpinion = true

      const res = await fetch('/api/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'Generation failed.')
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response stream.')

      const decoder = new TextDecoder()
      let buffer = ''
      let finalResult: Record<string, unknown> | null = null
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const frames = buffer.split('\n\n')
        buffer = frames.pop() ?? ''
        for (const frame of frames) {
          if (!frame.startsWith('data: ')) continue
          const event = JSON.parse(frame.slice(6)) as { type: string; message?: string; result?: Record<string, unknown> }
          if (event.type === 'status') setStatusMessage(event.message ?? null)
          if (event.type === 'done') finalResult = event.result ?? null
          if (event.type === 'error') throw new Error(event.message ?? 'Generation failed.')
        }
      }

      if (finalResult) {
        setDraftText((finalResult.caption as string) ?? '')
        setHookScore((finalResult.hookScore as number) ?? null)
        setHookFeedback((finalResult.hookFeedback as string) ?? '')
        setSelfCheckPassed((finalResult.selfCheckPassed as boolean) ?? false)
        setSelfCheckNote((finalResult.selfCheckNote as string) ?? '')
        setBannedHits((finalResult.bannedHits as string[]) ?? [])
        setSpecificityHit((finalResult.specificityHit as boolean) ?? true)
      }
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : 'Generation failed.')
    } finally {
      setGenerating(false)
      setStatusMessage(null)
    }
  }, [persona.id, platform, selectedTopicClusterId, sourceMaterial, decision])

  async function copyDraft() {
    if (!draftText) return
    try {
      await navigator.clipboard.writeText(draftText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // no-op
    }
  }

  async function addCluster() {
    if (!newClusterName.trim()) return
    setAddingCluster(true)
    try {
      const res = await fetch('/api/content/topic-clusters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaId: persona.id,
          clusterName: newClusterName.trim(),
          description: newClusterDescription.trim(),
        }),
      })
      if (!res.ok) throw new Error('Failed to add topic.')
      window.location.reload()
    } catch {
      setAddingCluster(false)
    }
  }

  async function addFinding() {
    if (!findingClusterId || !findingText.trim() || !findingSourceLabel.trim() || !findingSourceUrl.trim()) return
    setAddingFinding(true)
    try {
      const res = await fetch('/api/content/research-findings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaId: persona.id,
          topicClusterId: findingClusterId,
          finding: findingText.trim(),
          sourceLabel: findingSourceLabel.trim(),
          sourceUrl: findingSourceUrl.trim(),
        }),
      })
      if (!res.ok) throw new Error('Failed to add finding.')
      window.location.reload()
    } catch {
      setAddingFinding(false)
    }
  }

  return (
    <div className="space-y-6">
      <header className="reveal-up space-y-2">
        <button onClick={() => router.push('/content')} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate transition-colors hover:bg-paper-tint hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Content
        </button>
        <h1 className="text-heading text-2xl text-ink sm:text-3xl">{persona.displayName}</h1>
        <p className="text-sm text-slate">{persona.platforms.join(', ')}</p>
      </header>

      <section className="rounded-2xl border border-line/60 bg-surface-raised p-5">
        <h2 className="text-heading text-base text-ink">Metrics</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <MetricCard label="Capture streak" value={`${metrics.streak} days`} />
          <MetricCard label="Specific detail rate" value={`${metrics.specificityRate}%`} />
          <MetricCard label="Question comments" value={String(metrics.questionComments)} />
          <MetricCard label="Followers (passive)" value="-" />
        </div>
      </section>

      <section className="rounded-2xl border border-line/60 bg-surface-raised p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-heading text-base text-ink">Daily brief</h2>
            <p className="mt-1 text-sm text-slate">The system decides whether to ask, react, generate, or stay quiet.</p>
          </div>
          <button onClick={() => void loadDecision()} className="rounded-lg border border-line px-3 py-1.5 text-sm text-slate hover:bg-paper-tint" disabled={loadingDecision}>
            {loadingDecision ? 'Checking...' : 'Refresh brief'}
          </button>
        </div>

        {decision && (
          <div className="mt-3 rounded-xl bg-paper-tint/30 p-3 text-sm text-ink">
            <p className="font-medium capitalize">{decision.decisionType}</p>
            <p className="mt-1 text-slate">{decision.prompt ?? decision.reason}</p>
            {decision.finding && (
              <p className="mt-2 text-xs text-slate">Source: {decision.finding.sourceLabel} - {decision.finding.sourceUrl}</p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-line/60 bg-surface-raised p-6">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-gold" aria-hidden="true" />
          <h2 className="text-heading text-base text-ink">Generate from real material</h2>
        </div>
        <p className="mt-1 text-sm text-slate">No invented anecdotes. If there is no real input or stored conviction, no post.</p>

        <textarea
          value={sourceMaterial}
          onChange={(e) => setSourceMaterial(e.target.value)}
          placeholder="Optional if daily brief says 'ready'. Otherwise add one real line from today."
          rows={3}
          className="mt-4 w-full rounded-xl border border-line bg-paper-raised px-3.5 py-2.5 text-sm outline-none focus-visible:border-gold/40 focus-visible:ring-2 focus-visible:ring-gold/20"
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select value={selectedTopicClusterId} onChange={(e) => setSelectedTopicClusterId(e.target.value)} className="h-8 rounded-lg border border-line bg-paper-raised px-2 text-sm text-ink">
            {topicClusters.length === 0 && <option value="">No topic clusters</option>}
            {topicClusters.map((c) => (
              <option key={c.id} value={c.id}>{c.clusterName}</option>
            ))}
          </select>
          <div className="flex gap-1">
            {(['linkedin', 'x'] as const).map((p) => (
              <button key={p} type="button" onClick={() => setPlatform(p)} className={cn('rounded-lg px-3 py-1 text-sm font-medium', platform === p ? 'bg-ink text-paper' : 'bg-paper-tint text-slate hover:text-ink')}>
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button onClick={() => void runGeneration()} disabled={generating} className="inline-flex items-center gap-2 rounded-xl gradient-gold px-5 py-2.5 text-sm font-semibold text-paper disabled:opacity-50">
            {generating ? <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="size-3.5" aria-hidden="true" />}
            {generating ? (statusMessage ?? 'Generating...') : 'Generate draft'}
          </button>
        </div>
        {draftError && <p className="mt-3 text-sm text-status-no">{draftError}</p>}
      </section>

      {draftText && (
        <section className="rounded-2xl border border-line/60 bg-surface-raised p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-heading text-base text-ink">Draft</h2>
            <button onClick={() => void copyDraft()} className="inline-flex items-center gap-1.5 rounded-lg bg-paper-tint px-3 py-1.5 text-sm text-ink hover:bg-line">
              {copied ? <Check className="size-3.5 text-status-send" /> : <Copy className="size-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="mt-4 rounded-xl border border-ink/10 bg-paper-tint/20 p-4">
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{draftText}</p>
          </div>
          {hookScore !== null && <p className="mt-2 text-sm text-slate">Hook {hookScore}/10 - {hookFeedback}</p>}
          <div className="mt-3 space-y-2">
            <CheckRow ok={selfCheckPassed} label="Self-check" note={selfCheckNote} />
            <CheckRow ok={bannedHits.length === 0} label="No banned phrases" note={bannedHits.join(', ')} />
            <CheckRow ok={specificityHit} label="Specificity" note={specificityHit ? '' : 'No concrete detail found'} />
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-heading text-base text-ink">Topic clusters</h2>
          <button onClick={() => setShowAddCluster((v) => !v)} className="inline-flex items-center gap-1 text-sm text-gold hover:text-gold-dark">
            <Plus className="size-3.5" /> Add
          </button>
        </div>
        {showAddCluster && (
          <div className="rounded-xl border border-line/60 bg-paper-tint/30 p-4 space-y-2">
            <input value={newClusterName} onChange={(e) => setNewClusterName(e.target.value)} placeholder="Cluster name" className="h-9 w-full rounded-lg border border-line bg-paper-raised px-3 text-sm" />
            <input value={newClusterDescription} onChange={(e) => setNewClusterDescription(e.target.value)} placeholder="Short description (optional)" className="h-9 w-full rounded-lg border border-line bg-paper-raised px-3 text-sm" />
            <button onClick={() => void addCluster()} disabled={addingCluster || !newClusterName.trim()} className="rounded-lg gradient-gold px-4 py-1.5 text-sm font-semibold text-paper disabled:opacity-50">{addingCluster ? 'Adding...' : 'Save topic'}</button>
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {topicClusters.map((cluster) => (
            <div key={cluster.id} className="rounded-xl border border-line/60 bg-surface-raised p-4">
              <p className="text-sm font-medium text-ink">{cluster.clusterName}</p>
              {cluster.description && <p className="mt-0.5 text-xs text-slate">{cluster.description}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-heading text-base text-ink">Research findings (source linked)</h2>
          <button onClick={() => setShowAddFinding((v) => !v)} className="inline-flex items-center gap-1 text-sm text-gold hover:text-gold-dark">
            <Plus className="size-3.5" /> Add
          </button>
        </div>
        {showAddFinding && (
          <div className="rounded-xl border border-line/60 bg-paper-tint/30 p-4 space-y-2">
            <select value={findingClusterId} onChange={(e) => setFindingClusterId(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-paper-raised px-3 text-sm">
              {topicClusters.map((cluster) => (
                <option key={cluster.id} value={cluster.id}>{cluster.clusterName}</option>
              ))}
            </select>
            <input value={findingText} onChange={(e) => setFindingText(e.target.value)} placeholder="What happened?" className="h-9 w-full rounded-lg border border-line bg-paper-raised px-3 text-sm" />
            <input value={findingSourceLabel} onChange={(e) => setFindingSourceLabel(e.target.value)} placeholder="Source label (e.g. Gartner, Stripe blog)" className="h-9 w-full rounded-lg border border-line bg-paper-raised px-3 text-sm" />
            <input value={findingSourceUrl} onChange={(e) => setFindingSourceUrl(e.target.value)} placeholder="https://..." className="h-9 w-full rounded-lg border border-line bg-paper-raised px-3 text-sm" />
            <button onClick={() => void addFinding()} disabled={addingFinding} className="rounded-lg gradient-gold px-4 py-1.5 text-sm font-semibold text-paper disabled:opacity-50">{addingFinding ? 'Adding...' : 'Save finding'}</button>
          </div>
        )}

        <div className="space-y-2">
          {findings.slice(0, 8).map((finding) => (
            <div key={finding.id} className="rounded-xl border border-line/60 bg-surface-raised p-3">
              <p className="text-sm text-ink">{finding.finding}</p>
              <p className="mt-1 text-xs text-slate">{finding.sourceLabel} - {finding.sourceUrl}</p>
            </div>
          ))}
        </div>
      </section>

      {history.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-heading text-base text-ink">Recently posted</h2>
          <ul className="overflow-hidden rounded-2xl border border-line/60 bg-surface-raised divide-y divide-line/50">
            {history.slice(0, 5).map((h) => (
              <li key={h.id} className="px-5 py-3">
                <p className="line-clamp-1 text-sm text-ink">{h.openingLine}</p>
                <p className="mt-0.5 text-xs text-slate">{h.platform} - {new Date(h.postedAt).toLocaleDateString()}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {activeDrafts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-heading text-base text-ink">Drafts</h2>
          <ul className="overflow-hidden rounded-2xl border border-line/60 bg-surface-raised divide-y divide-line/50">
            {activeDrafts.slice(0, 5).map((d) => (
              <li key={d.id} className="px-5 py-3">
                <p className="line-clamp-2 text-sm text-ink">{d.caption || 'Empty draft'}</p>
                <p className="mt-0.5 text-xs text-slate">{d.platform} - {d.status}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function CheckRow({ ok, label, note }: { ok: boolean; label: string; note?: string }) {
  return (
    <div className={cn('flex items-start gap-2.5 text-sm', ok ? 'text-status-send' : 'text-status-research')}>
      {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
      <span>
        {label}
        {note && <span className="block text-xs text-slate">{note}</span>}
      </span>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-paper-tint/40 p-3">
      <p className="text-label">{label}</p>
      <p className="mt-1 text-sm text-ink">{value}</p>
    </div>
  )
}
