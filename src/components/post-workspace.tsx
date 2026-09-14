'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { ContentIdeaCard } from '@/lib/domain/types'

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
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const [showImagePrompt, setShowImagePrompt] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [feedbackReason, setFeedbackReason] = useState('')

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load draft if not provided initially
  useEffect(() => {
    if (initialDraft) return
    fetch(`/api/content/drafts/${draftId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.draft) {
          setDraft(data.draft)
          setCaption(data.draft.caption)
        } else {
          setError('Draft not found')
        }
      })
      .catch(() => setError('Failed to load draft'))
      .finally(() => setLoading(false))
  }, [draftId, initialDraft])

  // Autosave
  const autosave = useCallback((newCaption: string) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    setSaving('saving')
    saveTimeoutRef.current = setTimeout(() => {
      fetch(`/api/content/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption: newCaption }),
      })
        .then(() => setSaving('saved'))
        .catch(() => setSaving('idle'))
    }, 800)
  }, [draftId])

  const handleCaptionChange = (newCaption: string) => {
    setCaption(newCaption)
    autosave(newCaption)
  }

  // Actions
  const handleCopy = () => {
    navigator.clipboard.writeText(caption)
  }

  const handleCopyImagePrompt = () => {
    if (visual?.imagePrompt) {
      navigator.clipboard.writeText(visual.imagePrompt)
    }
  }

  const handlePosting = async () => {
    if (!draft) return
    setPosting(true)
    setError('')
    try {
      const res = await fetch(`/api/content/drafts/${draftId}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption }),
      })
      const data = await res.json()
      if (data.success) {
        router.push(`/content/${draft.personaId}/library?posted=${draftId}`)
      } else {
        setError(data.error || 'Failed to mark as posted')
      }
    } catch {
      setError('Failed to mark as posted')
    }
    setPosting(false)
  }

  const submitFeedback = async (reason: string) => {
    setFeedbackReason(reason)
    if (!draft) return
    try {
      await fetch(`/api/content/drafts/${draftId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, reaction: 'not_for_me' }),
      })
    } catch {
      // Silent
    }
    setFeedbackSent(true)
    setShowFeedback(false)
  }

  const handleRegenerate = async (variant: string) => {
    if (!draft) return
    setLoading(true)
    try {
      const res = await fetch('/api/content/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaId: draft.personaId,
          idea: {
            title: variant === 'hook' ? `Different hook for: ${draft.sourceMaterial}` : draft.sourceMaterial,
            angle: variant,
            territory: 'authority',
            sourceKind: 'idea',
          },
          platform: draft.platform as 'linkedin' | 'x',
        }),
      })
      const data = await res.json()
      if (data.draftId) {
        router.push(`/studio/drafts/${data.draftId}`)
      } else if (data.caption) {
        setCaption(data.caption)
        autosave(data.caption)
      } else {
        setError(data.error || 'Regeneration failed')
      }
    } catch {
      setError('Regeneration failed')
    }
    setLoading(false)
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
        <header className="mb-6 flex items-center justify-between">
          <div>
            <button onClick={() => router.back()} className="text-sm text-graphite hover:text-ink">
              ← Back
            </button>
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded-full bg-ink/10 px-2 py-0.5 text-xs font-medium uppercase">
                {draft.platform}
              </span>
              <SaveStatus status={saving} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFeedback(true)}
              className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs hover:border-ink/30"
            >
              Not for me
            </button>
            <button
              onClick={() => handleRegenerate('angle')}
              className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs hover:border-ink/30"
            >
              Different angle
            </button>
            <button
              onClick={handlePosting}
              disabled={posting || caption.length < 10}
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
              className="min-h-[300px] w-full resize-none rounded-xl border border-ink/10 bg-white p-4 text-base leading-relaxed text-ink focus:border-ink/20 focus:outline-none lg:min-h-[400px]"
              placeholder="Your post..."
            />
            <div className="flex items-center justify-between text-xs text-graphite">
              <span>{caption.length} characters</span>
              <div className="flex gap-3">
                <button onClick={handleCopy} className="hover:text-ink">Copy</button>
                <button onClick={() => handleRegenerate('hook')} className="hover:text-ink">Different hook</button>
                <button onClick={() => handleRegenerate('shorter')} className="hover:text-ink">Shorter</button>
              </div>
            </div>

            {error && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-600">{error}</p>}

            {/* Feedback */}
            {showFeedback && !feedbackSent && (
              <div className="rounded-lg border border-ink/10 bg-white p-3">
                <p className="text-xs font-medium text-ink">Why not?</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {['Too generic', 'Not my voice', 'Too basic', 'Wrong angle', "I wouldn't say this"].map((reason) => (
                    <button
                      key={reason}
                      onClick={() => submitFeedback(reason)}
                      className={`rounded-full border px-2.5 py-1 text-xs ${
                        feedbackReason === reason ? 'border-ink bg-ink text-bone' : 'border-ink/15 hover:border-ink/30'
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
              <div className="rounded-xl border border-ink/10 bg-white p-4">
                <h3 className="text-xs font-medium uppercase tracking-wider text-graphite">Visual Idea</h3>
                <p className="mt-1.5 text-sm text-ink">{visual.idea}</p>
                <button
                  onClick={() => setShowImagePrompt(!showImagePrompt)}
                  className="mt-2 text-xs font-medium text-ink underline underline-offset-2 hover:text-ink/70"
                >
                  {showImagePrompt ? 'Hide' : 'Show'} Image Prompt
                </button>
                {showImagePrompt && (
                  <div className="mt-2 rounded-lg bg-bone/50 p-2.5">
                    <p className="text-xs text-graphite leading-relaxed whitespace-pre-wrap">{visual.imagePrompt}</p>
                    <button
                      onClick={handleCopyImagePrompt}
                      className="mt-1.5 text-[10px] font-medium text-ink hover:text-ink/70"
                    >
                      Copy prompt
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Quick Actions */}
            <div className="rounded-xl border border-ink/10 bg-white p-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-graphite">Adjust</h3>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <AdjustButton label="More Technical" onClick={() => handleRegenerate('technical')} />
                <AdjustButton label="More Personal" onClick={() => handleRegenerate('personal')} />
                <AdjustButton label="Shorter" onClick={() => handleRegenerate('shorter')} />
                <AdjustButton label="Longer" onClick={() => handleRegenerate('longer')} />
              </div>
            </div>

            {/* Platform */}
            <div className="rounded-xl border border-ink/10 bg-white p-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-graphite">Platform</h3>
              <div className="mt-2 flex gap-1.5">
                {['linkedin', 'x', 'instagram'].map((p) => (
                  <button
                    key={p}
                    onClick={() => handleRegenerate(`platform:${p}`)}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-xs capitalize ${
                      draft.platform === p ? 'bg-ink text-bone' : 'bg-ink/5 text-graphite hover:bg-ink/10'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SaveStatus({ status }: { status: 'idle' | 'saving' | 'saved' }) {
  if (status === 'saving') return <span className="text-xs text-amber-600">Saving…</span>
  if (status === 'saved') return <span className="text-xs text-green-600">Saved</span>
  return null
}

function AdjustButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-ink/10 px-2 py-1.5 text-xs text-graphite hover:border-ink/25 hover:text-ink"
    >
      {label}
    </button>
  )
}
