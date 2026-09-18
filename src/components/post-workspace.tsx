'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { buildRegenerateRequest, draftBufferStorageKey, normalizeDraftWorkspacePlatform } from '@/lib/content/draft-workspace'
import { generateVisualConcept } from '@/lib/writing/visual'

interface DraftData {
  id: string
  personaId: string
  caption: string
  platform: string
  status: string
  hookScore: number
  selfCheckPassed: boolean
  sourceMaterial: string
}

interface VisualData {
  idea: string
  imagePrompt: string
}

type FlowStageStatus = 'complete' | 'active' | 'pending' | 'attention'

export function PostWorkspace({ initialDraft, initialVisual }: { initialDraft?: DraftData; initialVisual?: VisualData | null } = {}) {
  const params = useParams()
  const router = useRouter()
  const draftId = params.id as string

  const [draft, setDraft] = useState<DraftData | null>(initialDraft ?? null)
  const [caption, setCaption] = useState(initialDraft?.caption ?? '')
  const [visual, setVisual] = useState<VisualData | null>(() => {
    if (initialVisual) return initialVisual
    if (initialDraft) {
      return buildVisualData(initialDraft.caption, initialDraft.sourceMaterial, initialDraft.platform)
    }
    return null
  })
  const [visualForCaption, setVisualForCaption] = useState(() => normalizeCaptionForVisual(initialDraft?.caption ?? ''))
  const [loading, setLoading] = useState(!initialDraft)
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [posting, setPosting] = useState(false)
  const [regenerating, setRegenerating] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const [copyBundleState, setCopyBundleState] = useState<'idle' | 'copied' | 'error'>('idle')
  const [copyPromptState, setCopyPromptState] = useState<'idle' | 'copied' | 'error'>('idle')
  const [showImagePrompt, setShowImagePrompt] = useState(true)
  const [visualError, setVisualError] = useState('')
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [feedbackReason, setFeedbackReason] = useState('')

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveInFlightRef = useRef(false)
  const pendingSaveCaptionRef = useRef<string | null>(null)
  const lastSavedCaptionRef = useRef(initialDraft?.caption ?? '')

  const storageKey = draftBufferStorageKey(draftId)
  const actionsLocked = posting || Boolean(regenerating)

  const processPendingSave = useCallback(async () => {
    if (saveInFlightRef.current) return
    const nextCaption = pendingSaveCaptionRef.current
    if (nextCaption === null) return
    if (nextCaption === lastSavedCaptionRef.current) {
      pendingSaveCaptionRef.current = null
      setSaving('saved')
      return
    }

    pendingSaveCaptionRef.current = null
    saveInFlightRef.current = true
    setSaving('saving')

    try {
      const res = await fetch(`/api/content/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption: nextCaption }),
      })
      if (!res.ok) throw new Error('Save failed')
      lastSavedCaptionRef.current = nextCaption
      setSaving('saved')
    } catch {
      pendingSaveCaptionRef.current = nextCaption
      setSaving('error')
    } finally {
      saveInFlightRef.current = false
    }
  }, [draftId])

  const autosave = useCallback((newCaption: string, immediate = false) => {
    pendingSaveCaptionRef.current = newCaption
    if (newCaption === lastSavedCaptionRef.current) {
      setSaving('saved')
      return
    }
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    if (immediate) {
      void processPendingSave()
      return
    }
    setSaving('saving')
    saveTimeoutRef.current = setTimeout(() => {
      void processPendingSave()
    }, 800)
  }, [processPendingSave])

  // Load draft if not provided initially
  useEffect(() => {
    if (initialDraft) {
      lastSavedCaptionRef.current = initialDraft.caption
      return
    }
    fetch(`/api/content/drafts/${draftId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.draft) {
          const nextDraft = data.draft as DraftData
          setDraft(nextDraft)
          setCaption(nextDraft.caption)
          lastSavedCaptionRef.current = nextDraft.caption

          const visualFromApi = isVisualData(data.visual) ? data.visual : null
          if (typeof data.visualError === 'string' && data.visualError.trim().length > 0) {
            setVisualError(data.visualError)
          }
          try {
            const nextVisual = visualFromApi ?? buildVisualData(nextDraft.caption, nextDraft.sourceMaterial, nextDraft.platform)
            setVisual(nextVisual)
            setVisualForCaption(normalizeCaptionForVisual(nextDraft.caption))
          } catch {
            setVisual(null)
            setVisualError('Visual generation failed. Retry "Refresh from post" to regenerate the package.')
          }
        } else {
          setError('Draft not found')
        }
      })
      .catch(() => setError('Failed to load draft'))
      .finally(() => setLoading(false))
  }, [draftId, initialDraft])

  useEffect(() => {
    if (!draft) return
    try {
      const buffered = localStorage.getItem(storageKey)
      if (typeof buffered === 'string' && buffered !== draft.caption) {
        setCaption(buffered)
        autosave(buffered, true)
      }
    } catch {
      // Ignore local storage failures.
    }
  }, [autosave, draft, storageKey])

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, caption)
    } catch {
      // Ignore local storage failures.
    }
  }, [caption, storageKey])

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [])

  const handleCaptionChange = (newCaption: string) => {
    setCaption(newCaption)
    autosave(newCaption)
  }

  // Actions
  const handleCopy = async () => {
    setCopyState('idle')
    try {
      await navigator.clipboard.writeText(caption)
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 1500)
    } catch {
      setCopyState('error')
    }
  }

  const handleCopyPostPackage = async () => {
    if (!visual) return
    setCopyBundleState('idle')
    try {
      const packageText = [`POST`, caption.trim(), '', `VISUAL IDEA`, visual.idea, '', `IMAGE PROMPT`, visual.imagePrompt]
        .join('\n')
      await navigator.clipboard.writeText(packageText)
      setCopyBundleState('copied')
      setTimeout(() => setCopyBundleState('idle'), 1500)
    } catch {
      setCopyBundleState('error')
    }
  }

  const handleCopyImagePrompt = async () => {
    if (visual?.imagePrompt) {
      setCopyPromptState('idle')
      try {
        await navigator.clipboard.writeText(visual.imagePrompt)
        setCopyPromptState('copied')
        setTimeout(() => setCopyPromptState('idle'), 1500)
      } catch {
        setCopyPromptState('error')
      }
    }
  }

  const refreshVisualFromCaption = useCallback((nextCaption: string, platform?: string) => {
    if (!draft) return
    try {
      const nextVisual = buildVisualData(nextCaption, draft.sourceMaterial, platform ?? draft.platform)
      setVisual(nextVisual)
      setVisualForCaption(normalizeCaptionForVisual(nextCaption))
      setVisualError('')
      setShowImagePrompt(true)
    } catch {
      setVisualError('Could not generate visual package from this post. Try again.')
    }
  }, [draft])

  const handlePosting = async () => {
    if (!draft || actionsLocked) return
    setPosting(true)
    setError('')
    try {
      const res = await fetch(`/api/content/drafts/${draftId}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || `Failed to mark as posted (${res.status})`)
      }
      if (data?.success) {
        try {
          localStorage.removeItem(storageKey)
        } catch {
          // Ignore local storage failures.
        }
        router.push(`/content/${draft.personaId}/library?posted=${draftId}`)
      } else {
        setError(data?.error || 'Failed to mark as posted')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark as posted')
    }
    setPosting(false)
  }

  const submitFeedback = async (reason: string) => {
    setFeedbackReason(reason)
    if (!draft || actionsLocked) return
    try {
      const res = await fetch(`/api/content/drafts/${draftId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, reaction: 'not_for_me' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || `Failed to save feedback (${res.status})`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save feedback')
      return
    }
    setFeedbackSent(true)
    setShowFeedback(false)
  }

  const handleRegenerate = async (variant: string) => {
    if (!draft || actionsLocked) return
    let regenerateRequest: { angle: string; platform: 'linkedin' | 'x' }
    try {
      regenerateRequest = buildRegenerateRequest(variant, draft.platform)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Regeneration failed')
      return
    }

    setRegenerating(variant)
    setError('')
    try {
      const res = await fetch('/api/content/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaId: draft.personaId,
          idea: {
            title: variant === 'hook' ? `Different hook for: ${draft.sourceMaterial}` : draft.sourceMaterial,
            angle: regenerateRequest.angle,
            territory: 'authority',
            sourceKind: 'idea',
          },
          platform: regenerateRequest.platform,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || `Regeneration failed (${res.status})`)
      }
      if (data?.draftId) {
        try {
          localStorage.removeItem(storageKey)
        } catch {
          // Ignore local storage failures.
        }
        router.push(`/studio/drafts/${data.draftId}`)
      } else if (data?.caption) {
        setCaption(data.caption)
        setDraft((prev) => prev ? { ...prev, platform: regenerateRequest.platform, caption: data.caption } : prev)
        autosave(data.caption, true)
        refreshVisualFromCaption(data.caption, regenerateRequest.platform)
      } else {
        setError(data?.error || 'Regeneration failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Regeneration failed')
    }
    setRegenerating(null)
  }

  const isVisualStale = Boolean(visual) && normalizeCaptionForVisual(caption) !== visualForCaption

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bone">
        <p className="text-sm text-graphite">Loading your draft...</p>
      </div>
    )
  }

  if (error && !draft) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bone">
        <div className="text-center">
          <p className="text-sm text-status-danger">{error}</p>
          <button onClick={() => router.back()} className="mt-3 text-sm text-underline text-graphite">
            Go back
          </button>
        </div>
      </div>
    )
  }

  if (!draft) return null

  const sourceSummary = draft.sourceMaterial.trim()
  const trimmedCaption = caption.trim()
  const visualIdea = visual?.idea?.trim() ?? ''
  const imagePromptText = visual?.imagePrompt ?? ''
  const finishedPostReady = trimmedCaption.length >= 20
  const hasVisualConcept = visualIdea.length > 0
  const hasImagePrompt = imagePromptText.trim().length > 0

  const flowStages: Array<{
    id: string
    label: string
    title: string
    detail: string
    status: FlowStageStatus
  }> = [
    {
      id: 'write_this',
      label: '01',
      title: 'Write this',
      detail: sourceSummary.length > 0
        ? clipText(sourceSummary, 120)
        : 'Source note missing. Add context before drafting.',
      status: sourceSummary.length > 0 ? 'complete' : 'pending',
    },
    {
      id: 'finished_post',
      label: '02',
      title: 'Finished post',
      detail: finishedPostReady
        ? `Draft ready at ${caption.length} characters.`
        : 'Keep editing until the post is clear and specific.',
      status: finishedPostReady ? 'active' : 'pending',
    },
    {
      id: 'visual_concept',
      label: '03',
      title: 'Visual concept',
      detail: hasVisualConcept
          ? visualError
          ? visualError
          : isVisualStale
            ? 'Post changed. Refresh visual concept to re-sync.'
            : clipText(visualIdea, 120)
        : 'Generate a visual concept from the finished post.',
      status: hasVisualConcept ? (isVisualStale ? 'attention' : 'complete') : 'pending',
    },
    {
      id: 'image_prompt',
      label: '04',
      title: 'Image prompt',
      detail: hasImagePrompt
        ? isVisualStale
          ? 'Prompt is out of sync with your latest post edits.'
          : `Prompt ready (${imagePromptText.length} characters).`
        : 'No image prompt yet. Refresh visual concept to generate one.',
      status: hasImagePrompt ? (isVisualStale ? 'attention' : 'complete') : 'pending',
    },
  ]

  return (
    <div className="min-h-screen bg-bone">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
        {/* Header */}
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <button onClick={() => router.back()} className="text-sm text-graphite hover:text-ink">
              ← Back
            </button>
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded-full bg-ink/10 px-2 py-0.5 text-xs font-medium uppercase">
                {draft.platform}
              </span>
              <SaveStatus status={saving} onRetry={() => autosave(caption, true)} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowFeedback(true)}
              disabled={actionsLocked}
              className="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-ink"
            >
              Not for me
            </button>
            <button
              onClick={() => handleRegenerate('angle')}
              disabled={actionsLocked}
              className="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-ink"
            >
              {regenerating === 'angle' ? 'Regenerating...' : 'Different angle'}
            </button>
            <button
              onClick={handlePosting}
              disabled={posting || caption.length < 10 || Boolean(regenerating)}
              className="rounded-lg bg-ink px-4 py-1.5 text-xs font-medium text-bone hover:bg-ink/90 disabled:opacity-50"
            >
              {posting ? 'Posting...' : 'Posting this'}
            </button>
          </div>
        </header>

        <section className="mb-5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {flowStages.map((stage) => (
            <FlowStageCard
              key={stage.id}
              label={stage.label}
              title={stage.title}
              detail={stage.detail}
              status={stage.status}
            />
          ))}
        </section>

        {/* Main Layout */}
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Editor */}
          <div className="space-y-4">
            <section className="rounded-xl border border-cobalt/30 bg-cobalt/[0.03] p-4">
              <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-cobalt">01 / Write this</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink">{sourceSummary}</p>
              <p className="mt-1.5 text-[11px] text-graphite">
                This source context anchors the draft before visual concept and image prompt are generated.
              </p>
            </section>

            <section className="rounded-xl border border-line bg-bone-raised p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">02 / Finished post</p>
                  <p className="text-[12px] text-graphite">Edit freely. Relay autosaves and keeps this draft synced.</p>
                </div>
                <button onClick={() => void handleCopy()} className="rounded border border-line px-2.5 py-1 text-[11px] text-graphite hover:text-ink">
                  {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy post'}
                </button>
              </div>

            <textarea
              value={caption}
              onChange={(e) => handleCaptionChange(e.target.value)}
              className="min-h-[300px] w-full resize-none rounded-xl border border-line bg-bone-raised p-4 text-base leading-relaxed text-ink focus:border-line focus:outline-none lg:min-h-[400px]"
              placeholder="Your post..."
            />
            <div className="flex items-center justify-between text-xs text-graphite">
              <span>{caption.length} characters</span>
              <div className="flex gap-3">
                <button onClick={() => void handleRegenerate('hook')} disabled={actionsLocked} className="hover:text-ink disabled:opacity-50">
                  {regenerating === 'hook' ? 'Regenerating...' : 'Different hook'}
                </button>
                <button onClick={() => void handleRegenerate('shorter')} disabled={actionsLocked} className="hover:text-ink disabled:opacity-50">
                  {regenerating === 'shorter' ? 'Regenerating...' : 'Shorter'}
                </button>
              </div>
            </div>
            </section>

            {error && <p className="rounded-lg bg-status-danger/5 p-2 text-xs text-status-danger">{error}</p>}

            {/* Feedback */}
            {showFeedback && !feedbackSent && (
              <div className="rounded-lg border border-line bg-bone-raised p-3">
                <p className="text-xs font-medium text-ink">Why not?</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {['Too generic', 'Not my voice', 'Too basic', 'Wrong angle', "I wouldn't say this"].map((reason) => (
                    <button
                      key={reason}
                      onClick={() => void submitFeedback(reason)}
                      disabled={actionsLocked}
                      className={`rounded-full border px-2.5 py-1 text-xs ${
                        feedbackReason === reason ? 'border-ink bg-ink text-bone' : 'border-line hover:border-ink'
                      }`}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {feedbackSent && (
              <p className="rounded-lg bg-status-success/5 p-2 text-xs text-status-success">Thanks! Relay will learn from this.</p>
            )}
          </div>

          {/* Side Panel */}
          <div className="space-y-4">
            {/* Visual concept */}
            <div className="rounded-xl border border-line bg-bone-raised p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wider text-graphite">03 / Visual concept</h3>
                  <p className="mt-0.5 text-[11px] text-graphite">Derived from your finished post.</p>
                </div>
                <button
                  onClick={() => refreshVisualFromCaption(caption)}
                  disabled={!draft || caption.trim().length < 20 || actionsLocked}
                  className="text-[10px] font-medium uppercase tracking-wide text-ink underline underline-offset-2 disabled:opacity-50"
                >
                  Refresh from post
                </button>
              </div>
              {visual ? (
                <>
                  <p className="mt-1.5 text-sm text-ink">{visual.idea}</p>
                  <p className={`mt-1 text-[11px] ${isVisualStale ? 'text-amber-700' : 'text-graphite'}`}>
                    {isVisualStale ? 'Post changed. Refresh visual to sync the image prompt.' : 'Visual and prompt are synced with this draft.'}
                  </p>
                  {visualError ? <p className="mt-1 text-[11px] text-status-danger">{visualError}</p> : null}
                </>
              ) : (
                <>
                  <p className="mt-2 text-xs text-graphite">No visual concept yet. Refresh from post to generate one.</p>
                  {visualError ? <p className="mt-1 text-[11px] text-status-danger">{visualError}</p> : null}
                </>
              )}
            </div>

            {/* Image prompt */}
            <div className="rounded-xl border border-line bg-bone-raised p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wider text-graphite">04 / Image prompt</h3>
                  <p className="mt-0.5 text-[11px] text-graphite">Use this in your preferred image model.</p>
                </div>
                <button
                  onClick={() => setShowImagePrompt(!showImagePrompt)}
                  className="text-[10px] font-medium uppercase tracking-wide text-ink underline underline-offset-2"
                  disabled={!visual?.imagePrompt}
                >
                  {showImagePrompt ? 'Hide' : 'Show'} prompt
                </button>
              </div>

              {visual?.imagePrompt ? (
                <>
                  {showImagePrompt && (
                    <div className="mt-2 rounded-lg bg-bone p-2.5">
                      <p className="whitespace-pre-wrap text-xs leading-relaxed text-graphite">{visual.imagePrompt}</p>
                    </div>
                  )}
                  <p className={`mt-2 text-[11px] ${isVisualStale ? 'text-amber-700' : 'text-graphite'}`}>
                    {isVisualStale ? 'Prompt may be stale after edits. Refresh visual concept first.' : 'Prompt is synced with your latest visual concept.'}
                  </p>
                  <div className="mt-1.5 flex items-center gap-3">
                    <button
                      onClick={() => void handleCopyImagePrompt()}
                      className="text-[10px] font-medium text-ink hover:text-ink/70"
                    >
                      {copyPromptState === 'copied' ? 'Copied prompt' : copyPromptState === 'error' ? 'Copy failed' : 'Copy prompt'}
                    </button>
                    <button
                      onClick={() => void handleCopyPostPackage()}
                      className="text-[10px] font-medium text-ink hover:text-ink/70"
                    >
                      {copyBundleState === 'copied' ? 'Copied full package' : copyBundleState === 'error' ? 'Copy failed' : 'Copy post + prompt'}
                    </button>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-xs text-graphite">No prompt available yet. Refresh visual concept to generate one.</p>
              )}
            </div>

            {/* Quick Actions */}
            <div className="rounded-xl border border-line bg-bone-raised p-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-graphite">Adjust</h3>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <AdjustButton label="More Technical" onClick={() => void handleRegenerate('technical')} disabled={actionsLocked} active={regenerating === 'technical'} />
                <AdjustButton label="More Personal" onClick={() => void handleRegenerate('personal')} disabled={actionsLocked} active={regenerating === 'personal'} />
                <AdjustButton label="Shorter" onClick={() => void handleRegenerate('shorter')} disabled={actionsLocked} active={regenerating === 'shorter'} />
                <AdjustButton label="Longer" onClick={() => void handleRegenerate('longer')} disabled={actionsLocked} active={regenerating === 'longer'} />
              </div>
            </div>

            {/* Platform */}
            <div className="rounded-xl border border-line bg-bone-raised p-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-graphite">Platform</h3>
              <div className="mt-2 flex gap-1.5">
                {[
                  { id: 'linkedin', enabled: true },
                  { id: 'x', enabled: true },
                  { id: 'instagram', enabled: false, reason: 'Instagram draft generation is not available yet.' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      if (!p.enabled) return
                      void handleRegenerate(`platform:${p.id}`)
                    }}
                    disabled={actionsLocked || !p.enabled}
                    title={p.reason}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-xs capitalize ${
                      normalizeDraftWorkspacePlatform(draft.platform) === p.id
                        ? 'bg-ink text-bone'
                        : 'bg-ink/5 text-graphite hover:bg-ink/10'
                    }`}
                  >
                    {p.id}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-graphite">Instagram draft regeneration is disabled until platform-specific generation is available.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SaveStatus({ status, onRetry }: { status: 'idle' | 'saving' | 'saved' | 'error'; onRetry: () => void }) {
  if (status === 'saving') return <span className="text-xs text-amber-600">Saving…</span>
  if (status === 'saved') return <span className="text-xs text-status-success">Saved</span>
  if (status === 'error') {
    return (
      <span className="text-xs text-status-danger">
        Couldn&apos;t save your edit —{' '}
        <button type="button" onClick={onRetry} className="underline underline-offset-2 hover:text-red-700">
          retry
        </button>
      </span>
    )
  }
  return null
}

function AdjustButton({ label, onClick, disabled = false, active = false }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-2 py-1.5 text-xs disabled:opacity-50 ${
        active
          ? 'border-ink bg-ink text-bone'
          : 'border-line text-graphite hover:border-line hover:text-ink'
      }`}
    >
      {active ? 'Regenerating...' : label}
    </button>
  )
}

function FlowStageCard({
  label,
  title,
  detail,
  status,
}: {
  label: string
  title: string
  detail: string
  status: FlowStageStatus
}) {
  const toneClass = status === 'complete'
    ? 'border-status-success/30 bg-status-success/5'
    : status === 'active'
      ? 'border-cobalt/30 bg-cobalt/[0.05]'
      : status === 'attention'
        ? 'border-status-warning/35 bg-status-warning/8'
        : 'border-line bg-bone-raised'

  const statusLabel = status === 'complete'
    ? 'Complete'
    : status === 'active'
      ? 'In progress'
      : status === 'attention'
        ? 'Needs refresh'
        : 'Pending'

  return (
    <article className={`rounded-lg border px-3 py-2.5 ${toneClass}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.12em] text-stone">{label} / {title}</p>
        <span className="rounded bg-bone px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.08em] text-graphite">
          {statusLabel}
        </span>
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-graphite">{detail}</p>
    </article>
  )
}

function isVisualData(input: unknown): input is VisualData {
  if (!input || typeof input !== 'object') return false
  const candidate = input as Record<string, unknown>
  return typeof candidate.idea === 'string' && typeof candidate.imagePrompt === 'string'
}

function normalizeCaptionForVisual(caption: string): string {
  return caption.replace(/\s+/g, ' ').trim()
}

function buildVisualData(caption: string, sourceMaterial: string, platform: string): VisualData {
  const safeCaption = caption.trim()
  const concept = generateVisualConcept({
    postText: safeCaption,
    platform: normalizeDraftWorkspacePlatform(platform),
    angle: sourceMaterial,
    topic: sourceMaterial,
    coreDetail: safeCaption.slice(0, 140),
    tone: 'confident',
  })

  return {
    idea: concept.visualIdea,
    imagePrompt: concept.imagePrompt,
  }
}

function clipText(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1).trimEnd()}...`
}
