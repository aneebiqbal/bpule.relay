'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, PenLine, ChevronRight } from 'lucide-react'
import { cn } from 'cn'
import type { ContentPersona, TopicCluster, ContentDraft } from '@/lib/domain/types'

interface PersonaWithExtras extends ContentPersona {
  topicClusters: TopicCluster[]
  drafts: ContentDraft[]
}

export function ContentDashboard({ personas }: { personas: PersonaWithExtras[] }) {
  const [showNewPersona, setShowNewPersona] = useState(false)

  return (
    <div className="space-y-8">
      <header className="reveal-up flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-2">
          <p className="text-label">Content engine</p>
          <h1 className="text-heading text-3xl text-ink sm:text-4xl">Content</h1>
          <p className="text-[15px] text-slate">
            Real material, shaped into your voice. Never invented, never generic.
          </p>
        </div>
        <button
          onClick={() => setShowNewPersona(true)}
          className="group inline-flex items-center gap-2.5 rounded-2xl gradient-gold px-5 py-3 text-sm font-semibold text-paper transition-all duration-300 hover:shadow-gold active:scale-[0.97]"
        >
          <Plus className="size-4 transition-transform duration-300 group-hover:rotate-90" aria-hidden="true" />
          New persona
        </button>
      </header>

      {showNewPersona && (
        <NewPersonaForm onClose={() => setShowNewPersona(false)} />
      )}

      {personas.length === 0 ? (
        <section className="reveal-up stagger-2 rounded-[1.75rem] border border-dashed border-line bg-surface-raised p-14 text-center">
          <div className="mx-auto max-w-sm space-y-4">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-gold/12 to-gold/4 ring-1 ring-gold/10">
              <PenLine className="size-6 text-gold" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <p className="text-heading text-lg text-ink">No personas yet.</p>
              <p className="text-sm leading-relaxed text-slate">
                Paste a profile or bio, run voice calibration, and capture real material. The app handles the organization in the background.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <div className="space-y-4">
          {personas.map((persona, i) => (
            <article
              key={persona.id}
              className="reveal-up slide-in-right overflow-hidden rounded-[1.25rem] border border-line/60 bg-surface-raised"
              style={{ animationDelay: `${0.05 + i * 0.04}s` }}
            >
              <div className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="flex items-center gap-4">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-gold/15 to-gold/5">
                    <PenLine className="size-5 text-gold" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-heading text-base text-ink">{persona.displayName}</h2>
                    <p className="text-xs text-slate">
                      {persona.topicClusters.length} subject{persona.topicClusters.length === 1 ? '' : 's'} &middot; {persona.platforms.join(', ')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {persona.drafts.filter((d) => d.status === 'draft').length > 0 && (
                    <span className="rounded-full bg-gold/10 px-2.5 py-1 text-mono-medium text-[10px] text-gold">
                      {persona.drafts.filter((d) => d.status === 'draft').length} draft{persona.drafts.filter((d) => d.status === 'draft').length === 1 ? '' : 's'}
                    </span>
                  )}
                  <Link
                    href={`/content/${persona.id}`}
                    className="group inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-paper transition-all hover:bg-ink/90 hover:shadow-md active:scale-[0.97]"
                  >
                    Open
                    <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              {persona.topicClusters.length > 0 && (
                <div className="border-t border-line/40 px-5 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {persona.topicClusters.slice(0, 5).map((p) => (
                      <span key={p.id} className="rounded-lg bg-paper-tint/60 px-2 py-0.5 text-[11px] text-ink-soft">
                        {p.clusterName}
                      </span>
                    ))}
                    {persona.topicClusters.length > 5 && (
                      <span className="rounded-lg bg-paper-tint/60 px-2 py-0.5 text-[11px] text-slate">
                        +{persona.topicClusters.length - 5} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function NewPersonaForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [platforms, setPlatforms] = useState<string[]>([])
  const [profileInput, setProfileInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function togglePlatform(p: string) {
    setPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])
  }

  async function save() {
    if (!name.trim()) { setError('Give this persona a name.'); return }
    if (platforms.length === 0) { setError('Pick at least one platform.'); return }
    if (!profileInput.trim()) { setError('Paste a LinkedIn URL or a short bio.'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/content/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: name.trim(),
          platforms,
          profileInput: profileInput.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create persona.')
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create persona.')
      setSaving(false)
    }
  }

  return (
    <section className="reveal-up rounded-2xl border border-line/60 bg-surface-raised p-6">
      <h2 className="text-heading text-base text-ink">New persona</h2>
      <p className="mt-1 text-sm text-slate">Step 1: paste a profile. Step 2: run the existing voice calibration.</p>

      {error && (
        <p className="mt-3 text-sm text-status-no" role="alert">{error}</p>
      )}

      <div className="mt-4 grid gap-4">
        <div className="grid gap-1.5">
          <label htmlFor="persona-name" className="text-sm font-medium text-ink-soft">Display name</label>
          <input
            id="persona-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Madiha, Hassan"
            className="h-9 w-full rounded-xl border border-line bg-paper-raised px-3 text-sm transition-all outline-none focus-visible:border-gold/40 focus-visible:ring-2 focus-visible:ring-gold/20"
          />
        </div>
        <div className="grid gap-1.5">
          <span className="text-sm font-medium text-ink-soft">Platforms</span>
          <div className="flex gap-2">
            {['linkedin', 'x'].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => togglePlatform(p)}
                className={cn(
                  'rounded-xl border px-4 py-2 text-sm font-medium transition-all',
                  platforms.includes(p)
                    ? 'border-gold/30 bg-gold/8 text-gold'
                    : 'border-line bg-paper-raised text-slate hover:bg-paper-tint',
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="profile-input" className="text-sm font-medium text-ink-soft">LinkedIn URL or bio</label>
          <textarea
            id="profile-input"
            value={profileInput}
            onChange={(e) => setProfileInput(e.target.value)}
            rows={4}
            placeholder="Paste a LinkedIn profile URL, About section, or short bio."
            className="w-full rounded-xl border border-line bg-paper-raised px-3 py-2 text-sm transition-all outline-none focus-visible:border-gold/40 focus-visible:ring-2 focus-visible:ring-gold/20"
          />
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-3">
        <button onClick={onClose} className="rounded-xl border border-line px-4 py-2 text-sm text-slate transition-colors hover:bg-paper-tint">
          Cancel
        </button>
        <button onClick={() => void save()} disabled={saving} className="rounded-xl gradient-gold px-5 py-2 text-sm font-semibold text-paper transition-all hover:shadow-gold disabled:opacity-50">
          {saving ? 'Creating...' : 'Create persona'}
        </button>
      </div>
    </section>
  )
}
