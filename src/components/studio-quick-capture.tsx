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
  const [showInput, setShowInput] = useState(initiallyOpen)

  const handleWriteAngle = async (angle: QuickCaptureAngle) => {
    onSelectAngle?.(angle)
    setGenerating(true)
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
      const data = await res.json()
      if (data.draftId) {
        router.push(`/studio/drafts/${data.draftId}`)
      }
    } catch {
      // Keep UI stable if request fails.
    }
    setGenerating(false)
  }

  const handleSubmit = async () => {
    if (input.trim().length < 5) return
    setParsing(true)
    try {
      const res = await fetch('/api/content/intelligence/v2/quick-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId, input: input.trim() }),
      })
      const data = await res.json()
      setAngles(data.angles ?? [])
    } catch {
      setAngles(parseLocal(input.trim()))
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
          }}
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
          disabled={input.trim().length < 5 || parsing}
          className="inline-flex items-center gap-1 rounded bg-cobalt px-3 py-1.5 text-[12px] font-medium text-bone disabled:opacity-50"
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
                disabled={generating}
                className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-cobalt"
              >
                Write {String(index + 1).padStart(2, '0')}
                <ArrowRight className="size-3" />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setAngles([])}
            className="text-[11px] text-graphite underline underline-offset-2"
          >
            Something different
          </button>
        </div>
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
