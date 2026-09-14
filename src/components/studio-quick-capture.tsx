'use client'

import { useState } from 'react'
import type { QuickCaptureAngle } from '@/lib/domain/types'

interface StudioQuickCaptureProps {
  personaId: string
  onSelectAngle: (angle: QuickCaptureAngle) => void
}

export function StudioQuickCapture({ personaId, onSelectAngle }: StudioQuickCaptureProps) {
  const [input, setInput] = useState('')
  const [angles, setAngles] = useState<QuickCaptureAngle[]>([])
  const [parsing, setParsing] = useState(false)
  const [showInput, setShowInput] = useState(false)

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
      // Parse locally as fallback
      setAngles(parseLocal(input.trim()))
    }
    setParsing(false)
  }

  if (!showInput) {
    return (
      <button
        onClick={() => setShowInput(true)}
        className="w-full rounded-xl border border-dashed border-ink/20 p-4 text-left hover:border-ink/30 transition-colors"
      >
        <p className="text-sm font-medium text-ink">Tell Relay something</p>
        <p className="mt-0.5 text-xs text-graphite">
          A work moment, a thought, a lesson — Relay will find the angles.
        </p>
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-ink/10 bg-white p-4">
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Spent 4 hours debugging a race condition in production..."
        className="w-full resize-none rounded-lg border-0 bg-bone/50 p-3 text-sm text-ink placeholder:text-graphite/50 focus:outline-none focus:ring-1 focus:ring-ink/20"
        rows={3}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit()
        }}
      />
      {angles.length === 0 ? (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-graphite">
            ⌘+Enter to analyze
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowInput(false); setInput(''); setAngles([]) }}
              className="rounded-lg px-3 py-1.5 text-xs text-graphite hover:text-ink"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={input.trim().length < 5 || parsing}
              className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-bone hover:bg-ink/90 disabled:opacity-50"
            >
              {parsing ? 'Analyzing...' : 'Find angles'}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-graphite">
            This could become:
          </p>
          {angles.map((angle, i) => (
            <button
              key={i}
              onClick={() => onSelectAngle(angle)}
              className="w-full rounded-lg border border-ink/10 p-3 text-left hover:border-ink/25 hover:bg-bone/30 transition-colors"
            >
              <p className="text-sm font-medium text-ink">{angle.title}</p>
              <p className="mt-1 text-xs text-graphite leading-relaxed">
                {angle.angle}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function parseLocal(input: string): QuickCaptureAngle[] {
  const lower = input.toLowerCase()
  const angles: QuickCaptureAngle[] = []

  if (/\b(spent|debugged|fixed|built|shipped|deployed)\b/.test(lower)) {
    angles.push({
      angle: 'Turn this into a technical lesson.',
      type: 'technical_lesson',
      title: 'The problem that took hours to solve',
    })
  }
  if (/\b(learned|lesson|mistake|failed|wrong|realized)\b/.test(lower)) {
    angles.push({
      angle: 'Share this as a lesson.',
      type: 'technical_lesson',
      title: 'The lesson I learned the hard way',
    })
  }
  if (/\b(i think|i believe|in my opinion|honestly)\b/.test(lower)) {
    angles.push({
      angle: 'Share this opinion.',
      type: 'opinion',
      title: 'My honest take on this',
    })
  }

  if (angles.length === 0) {
    angles.push({
      angle: "What's the lesson here?",
      type: 'how_to',
      title: 'What this experience taught me',
    })
  }

  return angles.slice(0, 3)
}
