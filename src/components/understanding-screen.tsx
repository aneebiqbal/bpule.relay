'use client'

import { useState } from 'react'
import { Check, Pencil, Sparkles } from 'lucide-react'
import { cn } from 'cn'
import type { ContentPersona, TopicCluster } from '@/lib/domain/types'

export function UnderstandingScreen({
  persona,
  topicClusters,
  onUpdated,
}: {
  persona: ContentPersona
  topicClusters: TopicCluster[]
  onUpdated: (persona: ContentPersona) => void
}) {
  const [editing, setEditing] = useState(false)
  const [humorStyle, setHumorStyle] = useState(persona.humorStyle)
  const [values, setValues] = useState(persona.valuesAndOpinions.join('\n'))
  const [admired, setAdmired] = useState(persona.admiredExamples.join('\n'))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/content/personas/${persona.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          humorStyle: humorStyle.trim(),
          valuesAndOpinions: values.split('\n').map((v) => v.trim()).filter(Boolean),
          admiredExamples: admired.split('\n').map((v) => v.trim()).filter(Boolean),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Failed to save.')
      onUpdated(data.persona)
      setEditing(false)
      setMessage('Saved.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const focusAreas = topicClusters.slice(0, 6)

  return (
    <section className="rounded-2xl border border-line/60 bg-surface-raised p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-studio" aria-hidden="true" />
          <h2 className="text-heading text-base text-ink">What Studio understands about you</h2>
        </div>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-slate transition-colors hover:bg-paper-tint hover:text-ink"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            Edit
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setEditing(false); setHumorStyle(persona.humorStyle); setValues(persona.valuesAndOpinions.join('\n')); setAdmired(persona.admiredExamples.join('\n')) }}
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-slate transition-colors hover:bg-paper-tint"
            >
              Cancel
            </button>
            <button
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg gradient-studio px-3 py-1.5 text-sm font-semibold text-paper transition-all hover:brightness-110 disabled:opacity-50"
            >
              <Check className="size-3.5" aria-hidden="true" />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>

      <p className="text-sm text-slate">
        This is what Studio has inferred from your profile and what you have kept or skipped. Edit anything that is not right.
      </p>

      <div className="space-y-4">
        <Field label="Focus areas">
          {editing ? (
            <p className="text-sm text-slate">Your subjects are learned from your answers and what you keep posting about. They update automatically.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {focusAreas.length === 0 ? (
                <span className="text-sm text-slate">Nothing inferred yet.</span>
              ) : (
                focusAreas.map((c) => (
                  <span key={c.id} className="rounded-lg bg-paper-tint/60 px-2 py-0.5 text-[11px] text-ink-soft">
                    {c.clusterName}
                  </span>
                ))
              )}
            </div>
          )}
        </Field>

        <Field label="Humor style">
          {editing ? (
            <input
              value={humorStyle}
              onChange={(e) => setHumorStyle(e.target.value)}
              placeholder="e.g. Dry, playful, mostly serious"
              className="h-9 w-full rounded-xl border border-line bg-paper-raised px-3 text-sm outline-none focus-visible:border-studio/40 focus-visible:ring-2 focus-visible:ring-studio/20"
            />
          ) : (
            <p className="text-sm text-ink">{persona.humorStyle || 'Not set yet.'}</p>
          )}
        </Field>

        <Field label="Convictions and opinions">
          {editing ? (
            <textarea
              value={values}
              onChange={(e) => setValues(e.target.value)}
              rows={4}
              placeholder="One per line"
              className="w-full rounded-xl border border-line bg-paper-raised px-3 py-2 text-sm outline-none focus-visible:border-studio/40 focus-visible:ring-2 focus-visible:ring-studio/20"
            />
          ) : persona.valuesAndOpinions.length === 0 ? (
            <p className="text-sm text-slate">None captured yet.</p>
          ) : (
            <ul className="space-y-1">
              {persona.valuesAndOpinions.map((v, i) => (
                <li key={`${i}-${v}`} className="text-sm text-ink">- {v}</li>
              ))}
            </ul>
          )}
        </Field>

        <Field label="Posts you admire tend to be...">
          {editing ? (
            <textarea
              value={admired}
              onChange={(e) => setAdmired(e.target.value)}
              rows={3}
              placeholder="One per line"
              className="w-full rounded-xl border border-line bg-paper-raised px-3 py-2 text-sm outline-none focus-visible:border-studio/40 focus-visible:ring-2 focus-visible:ring-studio/20"
            />
          ) : persona.admiredExamples.length === 0 ? (
            <p className="text-sm text-slate">None captured yet.</p>
          ) : (
            <ul className="space-y-1">
              {persona.admiredExamples.map((v, i) => (
                <li key={`${i}-${v}`} className="text-sm text-ink">- {v}</li>
              ))}
            </ul>
          )}
        </Field>
      </div>

      {message && <p className={cn('text-sm', message === 'Saved.' ? 'text-status-send' : 'text-status-no')}>{message}</p>}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-label">{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}
