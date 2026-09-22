'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { QuickCaptureAngle } from '@/lib/domain/types'
import { ArrowRight, Sparkles } from 'lucide-react'

interface StudioQuickCaptureProps {
  personaId: string
  onSelectAngle?: (angle: QuickCaptureAngle) => void
  initiallyOpen?: boolean
  title?: string
  subtitle?: string
}

export function StudioQuickCapture({
  personaId,
  onSelectAngle,
  initiallyOpen = false,
  title = 'Tell Relay something',
  subtitle = 'A rough thought, a lesson, or a work moment. Studio will find the angles.',
}: StudioQuickCaptureProps) {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [angles, setAngles] = useState<QuickCaptureAngle[]>([])
  const [parsing, setParsing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [writingAngleKey, setWritingAngleKey] = useState<string | null>(null)
  const [showInput, setShowInput] = useState(initiallyOpen)
  const [error, setError] = useState('')

  const actionsLocked = parsing || generating

  const handleWriteAngle = async (angle: QuickCaptureAngle) => {
    if (actionsLocked) return
    onSelectAngle?.(angle)
    setGenerating(true)
    setWritingAngleKey(`${angle.title}-${angle.angle}`)
    setError('')
    try {
      const res = await fetch('/api/content/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaId,
          idea: {
            title: angle.title,
            angle: angle.angle,
            territory: angle.type === 'opinion' ? 'perspective' : angle.type === 'technical_lesson' ? 'authority' : 'journey',
            sourceKind: 'idea',
          },
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || `Could not create draft (${res.status})`)
      }
      if (data?.draftId) {
        router.push(`/studio/drafts/${data.draftId}`)
        return
      }
      throw new Error(data?.error || 'Could not create draft from this angle.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create draft from this angle.')
    }
    setGenerating(false)
    setWritingAngleKey(null)
  }

  const handleSubmit = async () => {
    if (input.trim().length < 5 || actionsLocked) return
    setParsing(true)
    setError('')
    try {
      const res = await fetch('/api/content/intelligence/v2/quick-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId, input: input.trim() }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || `Could not analyze this note (${res.status})`)
      }
      const nextAngles = Array.isArray(data?.angles) ? data.angles : []
      if (nextAngles.length === 0) {
        setAngles(parseLocal(input.trim()))
        setError('No clear angles found yet. Showing fallback suggestions.')
      } else {
        setAngles(nextAngles)
      }
    } catch {
      setAngles(parseLocal(input.trim()))
      setError('Could not analyze right now. Showing local fallback angles.')
    }
    setParsing(false)
  }

  if (!showInput) {
    return (
      <button
        type="button"
        onClick={() => setShowInput(true)}
        className="w-full rounded border border-dashed border-line bg-bone-raised px-4 py-4 text-left transition-colors hover:border-cobalt/40"
      >
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-cobalt">Quick capture</p>
        <p className="mt-1 text-[14px] font-medium text-ink">{title}</p>
        <p className="mt-1 text-[12px] text-graphite">{subtitle}</p>
      </button>
    )
  }

  return (
    <div className="rounded border border-line bg-bone-raised px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-cobalt">Tell Relay something</p>
          <p className="text-[12px] text-graphite">Messy is fine. Studio does the organization.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowInput(false)
            setInput('')
            setAngles([])
            setError('')
          }}
          disabled={actionsLocked}
          className="rounded border border-line px-2 py-1 text-[11px] text-graphite hover:text-ink"
        >
          Close
        </button>
      </div>

      <textarea
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="today realized our old rails upgrade got easier after deleting half the abstraction"
        className="mt-3 min-h-[100px] w-full resize-y rounded border border-line bg-bone p-3 text-[13px] leading-relaxed text-ink placeholder:text-stone/70 outline-none focus:border-cobalt/40"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void handleSubmit()
          }
        }}
      />

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[11px] text-stone">{angles.length === 0 ? 'Cmd/Ctrl + Enter to analyze' : 'Pick an angle below'}</span>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={input.trim().length < 5 || actionsLocked}
          className="inline-flex items-center gap-1 rounded bg-cobalt px-3 py-1.5 text-[12px] font-medium text-on-accent disabled:opacity-50"
        >
          <Sparkles className="size-3.5" />
          {parsing ? 'Finding...' : 'Find angles'}
        </button>
      </div>

      {angles.length > 0 && (
        <div className="mt-4 space-y-2">
          {angles.map((angle, index) => (
            <div key={`${angle.title}-${index}`} className="rounded border border-cobalt/25 bg-cobalt/[0.03] px-3 py-2.5">
              <p className="text-mono-medium text-[10px] uppercase tracking-[0.12em] text-cobalt">Angle {String(index + 1).padStart(2, '0')}</p>
              <p className="mt-1 text-[13px] font-medium text-ink">{angle.title}</p>
              <p className="mt-1 text-[12px] text-graphite">{angle.angle}</p>
              <button
                type="button"
                onClick={() => void handleWriteAngle(angle)}
                disabled={actionsLocked}
                className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-cobalt"
              >
                {generating && writingAngleKey === `${angle.title}-${angle.angle}`
                  ? 'Starting...'
                  : `Write ${String(index + 1).padStart(2, '0')}`}
                <ArrowRight className="size-3" />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setAngles([])}
            disabled={actionsLocked}
            className="text-[11px] text-graphite underline underline-offset-2"
          >
            Something different
          </button>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded border border-status-danger/30 bg-status-danger/5 px-3 py-2 text-[11px] text-status-danger">{error}</p>
      )}
    </div>
  )
}

function parseLocal(input: string): QuickCaptureAngle[] {
  const lower = input.toLowerCase()
  const angles: QuickCaptureAngle[] = []

  if (/\b(spent|debugged|fixed|built|shipped|deployed|deleted)\b/.test(lower)) {
    angles.push({
      angle: 'Make this a practical engineering lesson.',
      type: 'technical_lesson',
      title: 'The work that changed my approach',
    })
  }
  if (/\b(learned|lesson|mistake|failed|wrong|realized)\b/.test(lower)) {
    angles.push({
      angle: 'Frame this as a lesson learned under pressure.',
      type: 'technical_lesson',
      title: 'The lesson I had to learn twice',
    })
  }
  if (/\b(i think|i believe|in my opinion|honestly)\b/.test(lower)) {
    angles.push({
      angle: 'Publish this as a direct professional opinion.',
      type: 'opinion',
      title: 'An opinion I can defend with experience',
    })
  }

  if (angles.length === 0) {
    angles.push({
      angle: 'Pull out one concrete observation and its practical implication.',
      type: 'observation',
      title: 'One thing this experience made obvious',
    })
  }

  return angles.slice(0, 3)
}
