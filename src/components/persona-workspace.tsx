'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Copy, Check, RefreshCw, Sparkles, Settings2 } from 'lucide-react'
import { cn } from 'cn'
import type { ContentPersona, TopicCluster, ContentDraft, ContentHistoryEntry, ContentDraftFeedback } from '@/lib/domain/types'
import type { DailyDecision } from '@/lib/content/daily-decision'
import { UnderstandingScreen } from '@/components/understanding-screen'

export function PersonaWorkspace({
  persona,
  topicClusters,
  drafts,
  history,
  feedback,
  initialDecision,
}: {
  persona: ContentPersona
  topicClusters: TopicCluster[]
  drafts: ContentDraft[]
  history: ContentHistoryEntry[]
  feedback: ContentDraftFeedback[]
  initialDecision: DailyDecision
}) {
  const router = useRouter()
  const [platform, setPlatform] = useState<'linkedin' | 'x'>('linkedin')
  const [answer, setAnswer] = useState('')
  const [decision, setDecision] = useState<DailyDecision | null>(initialDecision)
  const [loadingDecision, setLoadingDecision] = useState(false)

  const [generating, setGenerating] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [draftText, setDraftText] = useState('')
  const [editableDraft, setEditableDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const [reacting, setReacting] = useState(false)
  const [reactionMessage, setReactionMessage] = useState<string | null>(null)
  const [historyRows, setHistoryRows] = useState(history)
  const [taggingId, setTaggingId] = useState<string | null>(null)
  const [showUnderstanding, setShowUnderstanding] = useState(false)
  const [personaState, setPersonaState] = useState(persona)
  const [refining, setRefining] = useState(false)
  const [refineMessage, setRefineMessage] = useState<string | null>(null)

  const activeDrafts = drafts.filter((d) => d.status === 'draft' || d.status === 'ready')

  const acceptedCount = feedback.filter((f) => f.reaction === 'posting' || f.reaction === 'posting_after_edit').length
  const rejectedCount = feedback.filter((f) => f.reaction === 'not_for_me').length

  const runRefinement = useCallback(async () => {
    setRefining(true)
    setRefineMessage(null)
    try {
      const res = await fetch(`/api/content/personas/${persona.id}/refine`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Refinement failed.')
      if (data.refined) {
        setPersonaState(data.persona)
        setRefineMessage(data.focusShiftNote || 'Profile updated from your keep/skip patterns.')
      } else {
        setRefineMessage(data.reason || 'No update needed yet.')
      }
    } catch (err) {
      setRefineMessage(err instanceof Error ? err.message : 'Refinement failed.')
    } finally {
      setRefining(false)
    }
  }, [persona.id])

  const metrics = useMemo(() => {
    const accepted = feedback.filter((f) => f.reaction === 'posting' || f.reaction === 'posting_after_edit').length
    const rejected = feedback.filter((f) => f.reaction === 'not_for_me').length
    const keptRate = accepted + rejected > 0 ? Math.round((accepted / (accepted + rejected)) * 100) : 0
    return { keptRate }
  }, [feedback])

  const learningReport = useMemo(() => {
    const bySubject = new Map<string, { kept: number; skipped: number }>()
    const bySource = new Map<'answer' | 'conviction' | 'field_update', { kept: number; skipped: number }>([
      ['answer', { kept: 0, skipped: 0 }],
      ['conviction', { kept: 0, skipped: 0 }],
      ['field_update', { kept: 0, skipped: 0 }],
    ])
    const names = new Map(topicClusters.map((c) => [c.id, c.clusterName]))

    for (const row of feedback) {
      const kept = row.reaction === 'posting' || row.reaction === 'posting_after_edit'
      if (row.topicClusterId) {
        const label = names.get(row.topicClusterId) ?? 'Other'
        const current = bySubject.get(label) ?? { kept: 0, skipped: 0 }
        if (kept) current.kept += 1
        else current.skipped += 1
        bySubject.set(label, current)
      }
      const source = bySource.get(row.sourceKind) ?? { kept: 0, skipped: 0 }
      if (kept) source.kept += 1
      else source.skipped += 1
      bySource.set(row.sourceKind, source)
    }

    const subjects = [...bySubject.entries()]
      .map(([label, counts]) => ({ label, ...counts, total: counts.kept + counts.skipped }))
      .filter((item) => item.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 4)

    const sourceRows = ([
      ['answer', 'From your answer'],
      ['conviction', 'From saved opinions'],
      ['field_update', 'From field updates'],
    ] as const).map(([key, label]) => {
      const counts = bySource.get(key) ?? { kept: 0, skipped: 0 }
      const total = counts.kept + counts.skipped
      const keptRate = total > 0 ? Math.round((counts.kept / total) * 100) : null
      return { label, keptRate, total }
    })

    return { subjects, sourceRows }
  }, [feedback, topicClusters])

  const loadDecision = useCallback(async () => {
    setLoadingDecision(true)
    try {
      const res = await fetch(`/api/content/daily?personaId=${persona.id}`)
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Failed to load question.')
      setDecision(data as DailyDecision)
    } catch {
      setDecision({ decisionType: 'none', reason: 'No question worth asking right now.' })
    } finally {
      setLoadingDecision(false)
    }
  }, [persona.id])

  const generateDraft = useCallback(async () => {
    setGenerating(true)
    setDraftError(null)
    setStatusMessage('Generating...')
    setDraftText('')
    setEditableDraft('')
    setDraftId(null)
    setReactionMessage(null)

    try {
      const payload: Record<string, unknown> = {
        personaId: persona.id,
        topicClusterId: decision?.contextId || topicClusters[0]?.id || null,
        sourceMaterial: answer.trim(),
        platform,
      }
      if (decision?.decisionType === 'react' && decision.fieldUpdate?.id) payload.findingId = decision.fieldUpdate.id
      if (decision?.decisionType === 'ready' && !answer.trim()) payload.useStoredOpinion = true

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

      if (!finalResult) throw new Error('No draft generated.')
      const caption = String(finalResult.caption ?? '').trim()
      setDraftText(caption)
      setEditableDraft(caption)
      setDraftId(String(finalResult.draftId ?? ''))
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : 'Generation failed.')
    } finally {
      setGenerating(false)
      setStatusMessage(null)
    }
  }, [persona.id, decision, answer, platform, topicClusters])

  async function reactToDraft(action: 'posting' | 'not_for_me') {
    if (!draftId) return
    setReacting(true)
    setReactionMessage(null)
    try {
      const res = await fetch(`/api/content/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          editedCaption: editableDraft,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Failed to save reaction.')
      setReactionMessage(action === 'posting' ? 'Saved as posted.' : 'Saved as not for me.')
    } catch (err) {
      setReactionMessage(err instanceof Error ? err.message : 'Failed to save reaction.')
    } finally {
      setReacting(false)
    }
  }

  async function toggleOutcome(historyId: string, next: boolean) {
    setTaggingId(historyId)
    try {
      const res = await fetch(`/api/content/history/${historyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ledToRealOutcome: next }),
      })
      if (!res.ok) return
      setHistoryRows((prev) =>
        prev.map((h) => (h.id === historyId ? { ...h, ledToRealOutcome: next } : h)),
      )
    } finally {
      setTaggingId(null)
    }
  }

  async function copyDraft() {
    if (!editableDraft) return
    try {
      await navigator.clipboard.writeText(editableDraft)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // no-op
    }
  }

  // Trigger refinement after a batch of new accept/reject decisions.
  const totalDecisions = acceptedCount + rejectedCount
  const shouldRefine = totalDecisions >= 6 && totalDecisions % 5 === 0
  const refineRunRef = useRef(false)
  useEffect(() => {
    if (shouldRefine && !refineRunRef.current && !refining) {
      refineRunRef.current = true
      void runRefinement()
    }
  }, [shouldRefine, refining, runRefinement])

  const askLine = decision?.prompt ?? decision?.reason ?? 'No question right now.'
  const canGenerate = Boolean(answer.trim()) || decision?.decisionType === 'ready' || decision?.decisionType === 'react'

  return (
    <div className="space-y-6">
      <header className="reveal-up space-y-2">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/content')} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate transition-colors hover:bg-paper-tint hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to Content
          </button>
          <button
            onClick={() => setShowUnderstanding((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors',
              showUnderstanding
                ? 'border-studio/30 bg-studio/10 text-studio'
                : 'border-line text-slate hover:bg-paper-tint hover:text-ink',
            )}
          >
            <Settings2 className="size-3.5" aria-hidden="true" />
            About you
          </button>
        </div>
        <h1 className="text-heading text-2xl text-ink sm:text-3xl">{personaState.displayName}</h1>
        <p className="text-sm text-slate">Simple loop: Ask, Draft, React.</p>
      </header>

      {showUnderstanding && (
        <UnderstandingScreen
          persona={personaState}
          topicClusters={topicClusters}
          onUpdated={(updated) => { setPersonaState(updated); setShowUnderstanding(false) }}
        />
      )}

      <section className="rounded-2xl border border-line/60 bg-surface-raised p-5 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate">Kept posts: {metrics.keptRate}%</p>
          <button
            onClick={() => void runRefinement()}
            disabled={refining || totalDecisions < 6}
            className="rounded-lg border border-line px-2 py-1 text-xs text-slate transition-colors hover:bg-paper-tint disabled:opacity-40"
            title={totalDecisions < 6 ? 'Need at least 6 keep/skip decisions' : 'Re-analyze from your keep/skip patterns'}
          >
            {refining ? 'Analyzing...' : 'Refresh profile'}
          </button>
        </div>
        {refineMessage && <p className="text-xs text-slate">{refineMessage}</p>}
      </section>

      <section className="rounded-2xl border border-line/60 bg-surface-raised p-5">
        <h2 className="text-heading text-base text-ink">What you keep</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate">By subject</p>
            {learningReport.subjects.length === 0 ? (
              <p className="mt-2 text-sm text-slate">No keep/skip data yet.</p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {learningReport.subjects.map((row) => {
                  const rate = Math.round((row.kept / row.total) * 100)
                  return (
                    <p key={row.label} className="text-sm text-ink">
                      {row.label}: {rate}% kept ({row.kept}/{row.total})
                    </p>
                  )
                })}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate">By draft type</p>
            <div className="mt-2 space-y-1.5">
              {learningReport.sourceRows.map((row) => (
                <p key={row.label} className="text-sm text-ink">
                  {row.label}: {row.keptRate === null ? '-' : `${row.keptRate}%`} {row.total > 0 ? `(${row.total})` : ''}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-line/60 bg-surface-raised p-6">
        <h2 className="text-heading text-base text-ink">1. Ask</h2>
        <p className="mt-2 text-sm text-ink">{askLine}</p>
        {decision?.fieldUpdate && (
          <p className="mt-2 text-xs text-slate">
            Source: {decision.fieldUpdate.sourceLabel} - {decision.fieldUpdate.sourceUrl}
          </p>
        )}
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Add one real line. If it is a no-input day, leave blank and continue only when prompted."
          rows={3}
          className="mt-4 w-full rounded-xl border border-line bg-paper-raised px-3.5 py-2.5 text-sm outline-none focus-visible:border-gold/40 focus-visible:ring-2 focus-visible:ring-gold/20"
        />
        <div className="mt-3 flex items-center gap-2">
          {(['linkedin', 'x'] as const).map((p) => (
            <button key={p} type="button" onClick={() => setPlatform(p)} className={cn('rounded-lg px-3 py-1 text-sm font-medium', platform === p ? 'bg-ink text-paper' : 'bg-paper-tint text-slate hover:text-ink')}>
              {p}
            </button>
          ))}
          <button onClick={() => void loadDecision()} disabled={loadingDecision} className="ml-auto rounded-lg border border-line px-3 py-1 text-sm text-slate hover:bg-paper-tint">
            {loadingDecision ? 'Refreshing...' : 'New question'}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-line/60 bg-surface-raised p-6">
        <h2 className="text-heading text-base text-ink">2. Draft</h2>
        <button onClick={() => void generateDraft()} disabled={generating || !canGenerate} className="mt-3 inline-flex items-center gap-2 rounded-xl gradient-gold px-5 py-2.5 text-sm font-semibold text-paper disabled:opacity-50">
          {generating ? <RefreshCw className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          {generating ? (statusMessage ?? 'Generating...') : 'Generate'}
        </button>
        {draftError && <p className="mt-2 text-sm text-status-no">{draftError}</p>}
        {draftText && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-end">
              <button onClick={() => void copyDraft()} className="inline-flex items-center gap-1.5 rounded-lg bg-paper-tint px-3 py-1.5 text-sm text-ink hover:bg-line">
                {copied ? <Check className="size-3.5 text-status-send" /> : <Copy className="size-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <textarea
              value={editableDraft}
              onChange={(e) => setEditableDraft(e.target.value)}
              rows={8}
              className="w-full rounded-xl border border-line bg-paper-raised px-3.5 py-2.5 text-sm outline-none focus-visible:border-gold/40 focus-visible:ring-2 focus-visible:ring-gold/20"
            />
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-line/60 bg-surface-raised p-6">
        <h2 className="text-heading text-base text-ink">3. React</h2>
        <p className="mt-1 text-sm text-slate">What you pick shapes tomorrow&apos;s post.</p>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => void reactToDraft('posting')} disabled={reacting || !draftId} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-50">
            Posting this
          </button>
          <button onClick={() => void reactToDraft('not_for_me')} disabled={reacting || !draftId} className="rounded-lg border border-line px-4 py-2 text-sm text-slate hover:bg-paper-tint disabled:opacity-50">
            Not for me
          </button>
        </div>
        {reactionMessage && <p className="mt-2 text-sm text-slate">{reactionMessage}</p>}
      </section>

      {historyRows.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-heading text-base text-ink">Recent posts</h2>
          <ul className="overflow-hidden rounded-2xl border border-line/60 bg-surface-raised divide-y divide-line/50">
            {historyRows.slice(0, 5).map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="line-clamp-1 text-sm text-ink">{h.openingLine}</p>
                  <p className="mt-0.5 text-xs text-slate">{new Date(h.postedAt).toLocaleDateString()}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleOutcome(h.id, !h.ledToRealOutcome)}
                  disabled={taggingId === h.id}
                  className={cn(
                    'shrink-0 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                    h.ledToRealOutcome
                      ? 'border-status-send/30 bg-status-send/10 text-status-send'
                      : 'border-line text-slate hover:bg-paper-tint hover:text-ink',
                  )}
                >
                  {h.ledToRealOutcome ? 'Led to something real' : 'This led to something real'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {activeDrafts.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-heading text-base text-ink">Saved drafts</h2>
          <ul className="overflow-hidden rounded-2xl border border-line/60 bg-surface-raised divide-y divide-line/50">
            {activeDrafts.slice(0, 3).map((d) => (
              <li key={d.id} className="px-5 py-3">
                <p className="line-clamp-2 text-sm text-ink">{d.caption}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
