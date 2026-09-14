'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Copy, Check, RefreshCw, Bold, Italic, ThumbsUp, ChevronDown } from 'lucide-react'
import { cn } from 'cn'
import type { ContentPersona, ContentProfile, TopicCluster, ContentDraft, ContentHistoryEntry, ContentDraftFeedback } from '@/lib/domain/types'
import type { DailyDecision } from '@/lib/content/daily-decision'
import { UnderstandingScreen } from '@/components/understanding-screen'
import { PostRadar } from '@/components/post-radar'
import { InterviewFlow } from '@/components/interview-flow'
import { StudioGreeting, QuickCapture, GenerationProgress, OpportunityData } from '@/components/studio-cards'
import { toBoldUnicode, toItalicUnicode } from '@/lib/content/unicode-format'
import { previewTruncation } from '@/lib/content/truncation'


export function PersonaWorkspace({
  persona,
  topicClusters,
  drafts,
  history,
  feedback,
  initialDecision,
  contentProfile,
  allPersonas,
}: {
  persona: ContentPersona
  topicClusters: TopicCluster[]
  drafts: ContentDraft[]
  history: ContentHistoryEntry[]
  feedback: ContentDraftFeedback[]
  initialDecision: DailyDecision
  contentProfile: ContentProfile | null
  allPersonas?: ContentPersona[]
}) {
  const router = useRouter()
  const [platform, setPlatform] = useState<'linkedin' | 'x'>('linkedin')
  const [personaState, setPersonaState] = useState(persona)
  const [showUnderstanding, setShowUnderstanding] = useState(false)
  const [showPersonaSwitcher, setShowPersonaSwitcher] = useState(false)

  const [flow, setFlow] = useState<'home' | 'interview' | 'generating' | 'result'>('home')
  const [sourceMaterial, setSourceMaterial] = useState('')
  const [selectedOpportunity, setSelectedOpportunity] = useState<OpportunityData | null>(null)
  const [interviewAnswers, setInterviewAnswers] = useState<string[]>([])

  const [generating, setGenerating] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [draftText, setDraftText] = useState('')
  const [editableDraft, setEditableDraft] = useState('')
  const [evaluation, setEvaluation] = useState<{ quality: number; distribution: number; specificity: number; slopScore: number } | null>(null)
  const [genomeInfo, setGenomeInfo] = useState<{ topic: string; angle: string; archetype: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [reacting, setReacting] = useState(false)
  const [reactionMessage, setReactionMessage] = useState<string | null>(null)
  const [historyRows, setHistoryRows] = useState(history)
  const [showTruncationPreview, setShowTruncationPreview] = useState(false)
  const [notForMeReasons, setNotForMeReasons] = useState(false)

  const [refining, setRefining] = useState(false)
  const [refineMessage, setRefineMessage] = useState<string | null>(null)


  const [metricsHistoryId, setMetricsHistoryId] = useState<string | null>(null)
  const [taggingId, setTaggingId] = useState<string | null>(null)




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

  const totalDecisions = acceptedCount + rejectedCount
  const shouldRefine = totalDecisions >= 6 && totalDecisions % 5 === 0
  const refineRunRef = useRef(false)
  useEffect(() => {
    if (shouldRefine && !refineRunRef.current && !refining) {
      refineRunRef.current = true
      void runRefinement()
    }
  }, [shouldRefine, refining, runRefinement])

  const handleOpportunitySelect = (opp: OpportunityData) => {
    setSelectedOpportunity(opp)
    setSourceMaterial(opp.description)
    setFlow('interview')
    setDraftError(null)
  }

  const handleQuickCapture = (text: string) => {
    setSelectedOpportunity(null)
    setSourceMaterial(text)
    setFlow('interview')
    setDraftError(null)
  }

  const generateFromIntelligence = async (interviewAns: string[]) => {
    setGenerating(true)
    setDraftError(null)
    setStatusMessage('Finding the strongest angle...')
    setDraftText('')
    setEditableDraft('')
    setDraftId(null)
    setEvaluation(null)
    setGenomeInfo(null)
    setReactionMessage(null)
    setNotForMeReasons(false)

    try {
      const material = interviewAns.length > 0
        ? `${sourceMaterial}\n\n${interviewAns.join('\n')}`
        : sourceMaterial

      const res = await fetch('/api/content/intelligence/forge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaId: persona.id,
          sourceMaterial: material,
          platform,
          opportunityId: null,
          interviewAnswers: interviewAns,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        if (res.status === 422) {
          setDraftError(data?.reason || 'This idea needs more specific material.')
          setFlow('interview')
          return
        }
        throw new Error(data?.error ?? 'Generation failed.')
      }

      const data = await res.json()
      setDraftText(data.draft.caption)
      setEditableDraft(data.draft.caption)
      setDraftId(data.draft.id)
      setEvaluation(data.draft.evaluation)
      setGenomeInfo(data.draft.genome)
      setFlow('result')
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : 'Generation failed.')
      setFlow('home')
    } finally {
      setGenerating(false)
      setStatusMessage(null)
    }
  }

  const handleInterviewComplete = async (answers: string[]) => {
    setInterviewAnswers(answers)
    setFlow('generating')
    await generateFromIntelligence(answers)
  }

  const handleSkipInterview = () => {
    setFlow('generating')
    generateFromIntelligence([])
  }

  const startOver = () => {
    setFlow('home')
    setSourceMaterial('')
    setSelectedOpportunity(null)
    setInterviewAnswers([])
    setDraftText('')
    setEditableDraft('')
    setDraftId(null)
    setEvaluation(null)
    setGenomeInfo(null)
    setDraftError(null)
    setNotForMeReasons(false)
  }

  const regenerateWithAngle = (angle: string) => {
    const angleMaterial = `${sourceMaterial}\n\nTry this direction: ${angle}`
    setSourceMaterial(angleMaterial)
    setFlow('generating')
    generateFromIntelligence([...interviewAnswers, angle])
  }

  function applyFormatting(kind: 'bold' | 'italic') {
    const el = document.getElementById('draft-editor') as HTMLTextAreaElement | null
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    if (start === end) return
    const selected = editableDraft.slice(start, end)
    const styled = kind === 'bold' ? toBoldUnicode(selected) : toItalicUnicode(selected)
    const next = editableDraft.slice(0, start) + styled + editableDraft.slice(end)
    setEditableDraft(next)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start, start + styled.length) })
  }

  async function reactToDraft(action: 'posting' | 'not_for_me') {
    if (!draftId) return
    setReacting(true)
    setReactionMessage(null)
    try {
      const res = await fetch(`/api/content/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, editedCaption: editableDraft }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Failed to save reaction.')
      if (action === 'posting') {
        setReactionMessage('Saved.')
        setTimeout(startOver, 800)
      } else {
        setNotForMeReasons(true)
      }
    } catch (err) {
      setReactionMessage(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setReacting(false)
    }
  }

  async function submitNotForMeReason(_reason: string) {
    if (!draftId) return
    setReacting(true)
    try {
      await fetch(`/api/content/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'not_for_me', editedCaption: editableDraft }),
      })
      setNotForMeReasons(false)
      startOver()
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
      setHistoryRows((prev) => prev.map((h) => (h.id === historyId ? { ...h, ledToRealOutcome: next } : h)))
    } finally {
      setTaggingId(null)
    }
  }

  async function copyDraft() {
    if (!editableDraft) return
    try { await navigator.clipboard.writeText(editableDraft); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* no-op */ }
  }

  const qualityIndicators = useMemo(() => {
    if (!evaluation) return null
    const items: Array<{ label: string; positive: boolean }> = []
    if (evaluation.specificity >= 0.7) items.push({ label: 'Strong detail', positive: true })
    if (evaluation.quality >= 0.7) items.push({ label: 'Specific to your experience', positive: true })
    if (evaluation.distribution >= 0.6) items.push({ label: 'Useful to your audience', positive: true })
    if (evaluation.slopScore > 0.4) items.push({ label: 'Could be more specific', positive: false })
    return items
  }, [evaluation])

  const angleOptions = useMemo(() => {
    if (!genomeInfo) return ['More technical', 'More personal', 'Shorter', 'Sharper opening', 'Turn it into an opinion']
    const base = [genomeInfo.angle]
    if (genomeInfo.archetype?.includes('technical') || genomeInfo.topic?.includes('engineer')) {
      base.push('More technical', 'Focus on the mistake', 'Turn it into an opinion')
    } else {
      base.push('More personal', 'Focus on the lesson', 'Make it a short observation')
    }
    return [...new Set(base)].slice(0, 5)
  }, [genomeInfo])

  const otherPersonas = allPersonas?.filter((p) => p.id !== persona.id) ?? []

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <header className="space-y-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push('/content')}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-graphite transition-colors hover:bg-bone hover:text-ink"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            All personas
          </button>
          <div className="flex items-center gap-2">
            {otherPersonas.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowPersonaSwitcher((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-graphite transition-colors hover:bg-bone hover:text-ink"
                >
                  {personaState.displayName}
                  <ChevronDown className={cn('size-3.5 transition-transform', showPersonaSwitcher && 'rotate-180')} aria-hidden="true" />
                </button>
                {showPersonaSwitcher && (
                  <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-xl border border-line bg-bone-raised py-1 shadow-lg">
                    {otherPersonas.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => { router.push(`/content/${p.id}`); setShowPersonaSwitcher(false) }}
                        className="w-full px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-bone"
                      >
                        {p.displayName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => setShowUnderstanding((v) => !v)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors',
                showUnderstanding ? 'border-cobalt/30 bg-cobalt/10 text-cobalt' : 'border-line text-graphite hover:bg-bone hover:text-ink',
              )}
            >
              About me
            </button>
          </div>
        </div>
      </header>

      {showUnderstanding && (
        <UnderstandingScreen
          persona={personaState}
          topicClusters={topicClusters}
          contentProfile={contentProfile}
          onUpdated={(updated) => { setPersonaState(updated); setShowUnderstanding(false) }}
        />
      )}

      {/* ── Home: Intelligence-first ── */}
      {flow === 'home' && (
        <div className="space-y-8">
          <StudioGreeting
            name={personaState.displayName}
            opportunityCount={0}
            hasPersona={topicClusters.length > 0}
          />

          <PostRadar
            persona={persona}
            topicClusters={topicClusters}
            contentProfile={contentProfile}
            onGenerateOpportunity={handleOpportunitySelect}
            onDismissOpportunity={() => {}}
          />

          <QuickCapture onSubmit={handleQuickCapture} />

          {/* ── Recent posts ── */}
          {historyRows.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-heading text-base text-ink">Recently talked about</h2>
              <div className="rounded-2xl border border-line/60 bg-bone-raised">
                <ul className="divide-y divide-line/50">
                  {historyRows.slice(0, 5).map((h) => (
                    <li key={h.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="line-clamp-1 text-sm text-ink">{h.openingLine}</p>
                          <p className="mt-0.5 text-xs text-graphite">
                            {new Date(h.postedAt).toLocaleDateString()}
                            {h.platform && ` · ${h.platform}`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void toggleOutcome(h.id, !h.ledToRealOutcome)}
                          disabled={taggingId === h.id}
                          className={cn(
                            'shrink-0 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                            h.ledToRealOutcome
                              ? 'border-status-success/30 bg-status-success/10 text-status-success'
                              : 'border-line text-graphite hover:bg-bone hover:text-ink',
                          )}
                        >
                          {h.ledToRealOutcome ? 'Led to something real' : 'This led somewhere'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* ── Learning ── */}
          {totalDecisions >= 4 && (
            <section className="rounded-2xl border border-line/60 bg-bone-raised p-5 space-y-3">
              <h2 className="text-heading text-base text-ink">How Studio is learning</h2>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-graphite">Posts kept</span>
                  <span className="text-ink">{acceptedCount} of {totalDecisions}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-line/60">
                  <div
                    className="h-full rounded-full bg-cobalt transition-all duration-500"
                    style={{ width: `${totalDecisions > 0 ? (acceptedCount / totalDecisions) * 100 : 0}%` }}
                  />
                </div>
                {acceptedCount >= 3 && (
                  <p className="text-xs text-graphite">
                    Relay is learning what you keep and skip to get better at spotting ideas worth your time.
                  </p>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Interview ── */}
      {flow === 'interview' && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <button onClick={startOver} className="inline-flex items-center gap-1 text-sm text-graphite transition-colors hover:text-ink">
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Back
            </button>
          </div>
          {selectedOpportunity && (
            <div className="rounded-2xl border border-line/60 bg-bone-raised p-5">
              <p className="text-label text-cobalt">{selectedOpportunity.type.replace(/_/g, ' ')}</p>
              <p className="mt-1 text-[15px] font-medium text-ink">{selectedOpportunity.title}</p>
            </div>
          )}
          <InterviewFlow
            personaId={persona.id}
            sourceMaterial={sourceMaterial}
            onComplete={handleInterviewComplete}
            onSkip={handleSkipInterview}
            opportunityTitle={selectedOpportunity?.title}
          />
          {draftError && <p className="text-sm text-status-danger">{draftError}</p>}
        </section>
      )}

      {/* ── Generating ── */}
      {flow === 'generating' && (
        <GenerationProgress statusMessage={statusMessage} />
      )}

      {/* ── Result / Editor ── */}
      {flow === 'result' && draftText && (
        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <button onClick={startOver} className="inline-flex items-center gap-1 text-sm text-graphite transition-colors hover:text-ink">
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Back
            </button>
            <div className="flex items-center gap-1 rounded-lg border border-line/60 bg-bone-raised p-0.5">
              {(['linkedin', 'x'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={cn(
                    'rounded-md px-3 py-1 text-sm font-medium transition-all',
                    platform === p ? 'bg-ink text-bone' : 'text-graphite hover:text-ink',
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Draft editor — the hero */}
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => applyFormatting('bold')}
                title="Bold selected text"
                className="inline-flex items-center rounded-lg border border-line p-1.5 text-graphite transition-colors hover:bg-bone hover:text-ink"
              >
                <Bold className="size-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => applyFormatting('italic')}
                title="Italicize selected text"
                className="inline-flex items-center rounded-lg border border-line p-1.5 text-graphite transition-colors hover:bg-bone hover:text-ink"
              >
                <Italic className="size-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setShowTruncationPreview((v) => !v)}
                className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1.5 text-xs text-graphite transition-colors hover:bg-bone hover:text-ink"
              >
                Preview
              </button>
              <div className="ml-auto">
                <button
                  onClick={() => void copyDraft()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-ink transition-colors hover:bg-bone"
                >
                  {copied ? <Check className="size-3.5 text-status-success" /> : <Copy className="size-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <textarea
              id="draft-editor"
              value={editableDraft}
              onChange={(e) => setEditableDraft(e.target.value)}
              rows={12}
              className="w-full rounded-2xl border border-line/60 bg-bone-raised px-5 py-4 text-[15px] leading-relaxed outline-none transition-all focus-visible:border-cobalt/40 focus-visible:ring-2 focus-visible:ring-cobalt/20"
            />
            {showTruncationPreview && (() => {
              const preview = previewTruncation(editableDraft, platform)
              return (
                <div className="rounded-xl border border-line/50 bg-bone/30 p-4">
                  <p className="text-xs uppercase tracking-wide text-graphite">Preview</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{preview.visible}</p>
                  {preview.truncated && (
                    <p className="mt-1 text-xs text-graphite">+{preview.hidden.length} characters hidden</p>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Quality — subtle */}
          {qualityIndicators && qualityIndicators.length > 0 && (
            <div className="rounded-xl border border-line/50 bg-bone-raised p-4">
              <p className="text-xs uppercase tracking-wide text-graphite">
                {qualityIndicators.some((i) => !i.positive) ? 'Could be stronger' : 'Why this works'}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {qualityIndicators.map((item, i) => (
                  <span
                    key={i}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs',
                      item.positive ? 'bg-status-success/8 text-status-success' : 'bg-status-danger/8 text-status-danger',
                    )}
                  >
                    {item.positive ? '✓' : '·'} {item.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void reactToDraft('posting')}
              disabled={reacting || !draftId}
              className="inline-flex items-center gap-1.5 rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-bone transition-all hover:bg-ink/90 active:scale-[0.97] disabled:opacity-50"
            >
              <ThumbsUp className="size-4" aria-hidden="true" />
              Posting this
            </button>
            <button
              onClick={() => void reactToDraft('not_for_me')}
              disabled={reacting || !draftId}
              className="rounded-xl border border-line px-4 py-2.5 text-sm text-graphite transition-colors hover:bg-bone disabled:opacity-50"
            >
              Not for me
            </button>
            <button
              onClick={() => void generateFromIntelligence(interviewAnswers)}
              disabled={generating}
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2.5 text-sm text-graphite transition-colors hover:bg-bone disabled:opacity-50"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Regenerate
            </button>
          </div>

          {/* Not for me reasons */}
          {notForMeReasons && (
            <div className="rounded-xl border border-line/50 bg-bone-raised p-4 space-y-2">
              <p className="text-sm text-graphite">Quick reason (optional):</p>
              <div className="flex flex-wrap gap-2">
                {['Too generic', "Doesn't sound like me", 'Wrong angle', 'Already said this', 'Not useful'].map((reason) => (
                  <button
                    key={reason}
                    onClick={() => void submitNotForMeReason(reason)}
                    className="rounded-lg border border-line px-3 py-1.5 text-sm text-graphite transition-colors hover:bg-bone hover:text-ink"
                  >
                    {reason}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Try another angle */}
          <div className="rounded-xl border border-line/50 bg-bone-raised p-4 space-y-3">
            <p className="text-sm text-graphite">Try a different angle:</p>
            <div className="flex flex-wrap gap-2">
              {angleOptions.map((angle) => (
                <button
                  key={angle}
                  onClick={() => regenerateWithAngle(angle)}
                  className="rounded-lg border border-cobalt/20 bg-cobalt/[0.04] px-3 py-1.5 text-sm text-cobalt transition-colors hover:bg-cobalt/10"
                >
                  {angle}
                </button>
              ))}
            </div>
          </div>

          {reactionMessage && <p className="text-sm text-graphite">{reactionMessage}</p>}
        </section>
      )}
    </div>
  )
}
