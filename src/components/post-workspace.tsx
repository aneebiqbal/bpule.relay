'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { ContentIdeaCard } from '@/lib/domain/types'
import { buildRegenerateRequest, draftBufferStorageKey, normalizeDraftWorkspacePlatform } from '@/lib/content/draft-workspace'

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

export function PostWorkspace({ initialDraft, initialVisual }: { initialDraft?: DraftData; initialVisual?: VisualData | null } = {}) {
  const params = useParams()
  const router = useRouter()
  const draftId = params.id as string

  const [draft, setDraft] = useState<DraftData | null>(initialDraft ?? null)
  const [caption, setCaption] = useState(initialDraft?.caption ?? '')
  const [visual, setVisual] = useState<VisualData | null>(initialVisual ?? null)
  const [loading, setLoading] = useState(!initialDraft)
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [posting, setPosting] = useState(false)
  const [regenerating, setRegenerating] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const [copyPromptState, setCopyPromptState] = useState<'idle' | 'copied' | 'error'>('idle')
  const [showImagePrompt, setShowImagePrompt] = useState(false)
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
      if (pendingSaveCaptionRef.current !== null && pendingSaveCaptionRef.current !== lastSavedCaptionRef.current) {
        void processPendingSave()
      }
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
          setDraft(data.draft)
          setCaption(data.draft.caption)
          lastSavedCaptionRef.current = data.draft.caption
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
        setDraft((prev) => prev ? { ...prev, platform: regenerateRequest.platform } : prev)
        autosave(data.caption, true)
      } else {
        setError(data?.error || 'Regeneration failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Regeneration failed')
    }
    setRegenerating(null)
  }

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
          <p className="text-sm text-red-600">{error}</p>
          <button onClick={() => router.back()} className="mt-3 text-sm text-underline text-graphite">
            Go back
          </button>
        </div>
      </div>
    )
  }

  if (!draft) return null

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

        {/* Main Layout */}
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Editor */}
          <div className="space-y-4">
            <textarea
              value={caption}
              onChange={(e) => handleCaptionChange(e.target.value)}
              className="min-h-[300px] w-full resize-none rounded-xl border border-line bg-bone-raised p-4 text-base leading-relaxed text-ink focus:border-line focus:outline-none lg:min-h-[400px]"
              placeholder="Your post..."
            />
            <div className="flex items-center justify-between text-xs text-graphite">
              <span>{caption.length} characters</span>
              <div className="flex gap-3">
                <button onClick={() => void handleCopy()} className="hover:text-ink">
                  {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy'}
                </button>
                <button onClick={() => void handleRegenerate('hook')} disabled={actionsLocked} className="hover:text-ink disabled:opacity-50">
                  {regenerating === 'hook' ? 'Regenerating...' : 'Different hook'}
                </button>
                <button onClick={() => void handleRegenerate('shorter')} disabled={actionsLocked} className="hover:text-ink disabled:opacity-50">
                  {regenerating === 'shorter' ? 'Regenerating...' : 'Shorter'}
                </button>
              </div>
            </div>

            {error && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-600">{error}</p>}

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
              <p className="rounded-lg bg-green-50 p-2 text-xs text-green-600">Thanks! Relay will learn from this.</p>
            )}
          </div>

          {/* Side Panel */}
          <div className="space-y-4">
            {/* Visual */}
            {visual && (
              <div className="rounded-xl border border-line bg-bone-raised p-4">
                <h3 className="text-xs font-medium uppercase tracking-wider text-graphite">Visual Idea</h3>
                <p className="mt-1.5 text-sm text-ink">{visual.idea}</p>
                <button
                  onClick={() => setShowImagePrompt(!showImagePrompt)}
                  className="mt-2 text-xs font-medium text-ink underline underline-offset-2 hover:text-ink/70"
                >
                  {showImagePrompt ? 'Hide' : 'Show'} Image Prompt
                </button>
                {showImagePrompt && (
                  <div className="mt-2 rounded-lg bg-bone p-2.5">
                    <p className="text-xs text-graphite leading-relaxed whitespace-pre-wrap">{visual.imagePrompt}</p>
                    <button
                      onClick={() => void handleCopyImagePrompt()}
                      className="mt-1.5 text-[10px] font-medium text-ink hover:text-ink/70"
                    >
                      {copyPromptState === 'copied' ? 'Copied prompt' : copyPromptState === 'error' ? 'Copy failed' : 'Copy prompt'}
                    </button>
                  </div>
                )}
              </div>
            )}

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
  if (status === 'saved') return <span className="text-xs text-green-600">Saved</span>
  if (status === 'error') {
    return (
      <span className="text-xs text-red-600">
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
