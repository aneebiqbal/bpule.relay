'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Plus,
  PenLine,
  CheckCircle2,
  AlertTriangle,
  Copy,
  RefreshCw,
  Check,
  Sparkles,
} from 'lucide-react'
import { cn } from 'cn'
import type {
  ContentPersona,
  ContentPillar,
  ContentDraft,
  ContentHistoryEntry,
  TrendingAngle,
} from '@/lib/domain/types'

type DraftStatus = ContentDraft['status']

interface SuggestedAngle {
  id: string
  pillarId: string
  pillarName: string
  angleDescription: string
  sourceNote: string
}

export function PersonaWorkspace({
  persona,
  pillars,
  drafts,
  history,
}: {
  persona: ContentPersona
  pillars: ContentPillar[]
  drafts: ContentDraft[]
  history: ContentHistoryEntry[]
}) {
  const router = useRouter()
  const [sourceMaterial, setSourceMaterial] = useState('')
  const [selectedPillar, setSelectedPillar] = useState<string>(pillars[0]?.id ?? '')
  const [platform, setPlatform] = useState<'linkedin' | 'x'>('linkedin')
  const [generating, setGenerating] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [draftText, setDraftText] = useState('')
  const [hookScore, setHookScore] = useState<number | null>(null)
  const [hookFeedback, setHookFeedback] = useState('')
  const [selfCheckPassed, setSelfCheckPassed] = useState(false)
  const [selfCheckNote, setSelfCheckNote] = useState('')
  const [bannedHits, setBannedHits] = useState<string[]>([])
  const [specificityHit, setSpecificityHit] = useState(true)
  const [showAddPillar, setShowAddPillar] = useState(false)
  const [showAddAngle, setShowAddAngle] = useState(false)
  const [copied, setCopied] = useState(false)
  const [suggestions, setSuggestions] = useState<SuggestedAngle[]>([])
  const [capped, setCapped] = useState(false)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [skippedSuggestionIds, setSkippedSuggestionIds] = useState<string[]>([])
  const [angleInputById, setAngleInputById] = useState<Record<string, string>>({})
  const [allAngles, setAllAngles] = useState<Array<TrendingAngle & { pillarName: string }>>([])

  const activeDrafts = drafts.filter((d) => d.status === 'draft' || d.status === 'ready')

  const loadSuggestions = useCallback(async () => {
    setLoadingSuggestions(true)
    try {
      const res = await fetch(`/api/content/suggestions?personaId=${persona.id}`)
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Failed to load suggestions.')
      setSuggestions((data?.suggestions ?? []) as SuggestedAngle[])
      setCapped(Boolean(data?.capped))
    } catch {
      setSuggestions([])
      setCapped(false)
    } finally {
      setLoadingSuggestions(false)
    }
  }, [persona.id])

  const loadAngles = useCallback(async () => {
    try {
      const res = await fetch(`/api/content/trending-angles?personaId=${persona.id}`)
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Failed to load angles.')
      setAllAngles((data?.angles ?? []) as Array<TrendingAngle & { pillarName: string }>)
    } catch {
      setAllAngles([])
    }
  }, [persona.id])

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSuggestions()
      void loadAngles()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadSuggestions, loadAngles])

  const runGeneration = useCallback(async (payload: Record<string, unknown>) => {
    setGenerating(true)
    setDraftError(null)
    setStatusMessage('Starting...')
    setDraftText('')
    setHookScore(null)
    setHookFeedback('')
    setSelfCheckPassed(false)
    setSelfCheckNote('')
    setBannedHits([])
    setSpecificityHit(true)

    try {
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
          try {
            const event = JSON.parse(frame.slice(6)) as { type: string; message?: string; result?: Record<string, unknown> }
            if (event.type === 'status') {
              setStatusMessage(event.message ?? null)
            } else if (event.type === 'done') {
              finalResult = event.result ?? null
            } else if (event.type === 'error') {
              throw new Error(event.message ?? 'Generation failed.')
            }
          } catch {
            // skip malformed frame
          }
        }
      }

      if (finalResult) {
        setDraftText((finalResult.caption as string) ?? '')
        setHookScore((finalResult.hookScore as number) ?? null)
        setHookFeedback((finalResult.hookFeedback as string) ?? '')
        setSelfCheckPassed((finalResult.selfCheckPassed as boolean) ?? false)
        setSelfCheckNote((finalResult.selfCheckNote as string) ?? '')
        setBannedHits((finalResult.bannedHits as string[]) ?? [])
        setSpecificityHit((finalResult.specificityHit as boolean) ?? true)
      }
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : 'Generation failed.')
    } finally {
      setGenerating(false)
      setStatusMessage(null)
      await loadSuggestions()
    }
  }, [loadSuggestions])

  const generateDraft = useCallback(async () => {
    if (!sourceMaterial.trim()) {
      setDraftError('What is one real thing from today? A sentence or two is enough.')
      return
    }
    await runGeneration({
      personaId: persona.id,
      pillarId: selectedPillar || null,
      sourceMaterial: sourceMaterial.trim(),
      platform,
    })
  }, [sourceMaterial, selectedPillar, platform, persona.id, runGeneration])

  const generateFromSuggestion = useCallback(async (suggestion: SuggestedAngle) => {
    await runGeneration({
      personaId: persona.id,
      angleId: suggestion.id,
      pillarId: suggestion.pillarId,
      personalLine: angleInputById[suggestion.id] ?? '',
      platform,
    })
  }, [angleInputById, persona.id, platform, runGeneration])

  async function copyDraft() {
    if (!draftText) return
    try {
      await navigator.clipboard.writeText(draftText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable; text is selectable
    }
  }

  async function updateStatus(draftId: string, status: DraftStatus) {
    try {
      await fetch(`/api/content/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      window.location.reload()
    } catch {
      // silent
    }
  }

  function skipSuggestion(angleId: string) {
    setSkippedSuggestionIds((prev) => [...prev, angleId])
  }

  const visibleSuggestions = suggestions.filter((s) => !skippedSuggestionIds.includes(s.id))

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="reveal-up space-y-2">
        <button
          onClick={() => router.push('/content')}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate transition-colors hover:bg-paper-tint hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Content
        </button>
        <div className="flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-gold/15 to-gold/5">
            <PenLine className="size-5 text-gold" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-heading text-2xl text-ink sm:text-3xl">{persona.displayName}</h1>
            <p className="text-sm text-slate">{persona.platforms.join(', ')}</p>
          </div>
        </div>
      </header>

      <section className="reveal-up rounded-2xl border border-line/60 bg-surface-raised p-5">
        <h2 className="text-heading text-base text-ink">Persona profile</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-paper-tint/40 p-3">
            <p className="text-label">Humor style</p>
            <p className="mt-1 text-sm text-ink">{persona.humorStyle || 'Not set yet'}</p>
          </div>
          <div className="rounded-xl bg-paper-tint/40 p-3 sm:col-span-2">
            <p className="text-label">Values and opinions</p>
            {persona.valuesAndOpinions.length === 0 ? (
              <p className="mt-1 text-sm text-slate">No convictions captured yet.</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {persona.valuesAndOpinions.slice(0, 3).map((op, idx) => (
                  <li key={`${idx}-${op}`} className="text-sm text-ink">- {op}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="reveal-up stagger-1 rounded-[1.75rem] border border-line/60 bg-surface-raised p-6">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-gold" aria-hidden="true" />
          <h2 className="text-heading text-base text-ink">Today&apos;s suggested angles</h2>
        </div>
        <p className="mt-1 text-sm text-slate">
          Up to two curated angles from your pillars. Add one real line for a personal story, or leave it blank for a values-based opinion post.
        </p>

        {capped && (
          <p className="mt-3 rounded-lg bg-paper-tint/40 px-3 py-2 text-sm text-slate">
            Daily cap reached for this persona (2 generated drafts).
          </p>
        )}

        {!capped && loadingSuggestions && (
          <p className="mt-3 text-sm text-slate">Loading suggestions...</p>
        )}

        {!capped && !loadingSuggestions && visibleSuggestions.length === 0 && (
          <p className="mt-3 text-sm text-slate">No fresh suggestions right now. Skip is a valid outcome.</p>
        )}

        <div className="mt-4 space-y-3">
          {visibleSuggestions.map((suggestion) => (
            <article key={suggestion.id} className="rounded-xl border border-line/60 bg-paper-tint/20 p-4">
              <p className="text-xs text-slate">{suggestion.pillarName}</p>
              <p className="mt-1 text-sm text-ink">Angle: {suggestion.angleDescription}</p>
              <input
                value={angleInputById[suggestion.id] ?? ''}
                onChange={(e) => setAngleInputById((prev) => ({ ...prev, [suggestion.id]: e.target.value }))}
                placeholder="Got something real of your own on this? (optional one line)"
                className="mt-3 h-9 w-full rounded-lg border border-line bg-paper-raised px-3 text-sm outline-none focus-visible:border-gold/40 focus-visible:ring-2 focus-visible:ring-gold/20"
              />
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => void generateFromSuggestion(suggestion)}
                  disabled={generating}
                  className="rounded-lg gradient-gold px-4 py-1.5 text-sm font-semibold text-paper disabled:opacity-50"
                >
                  Generate
                </button>
                <button
                  onClick={() => skipSuggestion(suggestion.id)}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm text-slate hover:bg-paper-tint"
                >
                  Skip this one
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ── Daily Prompt ── */}
      <section className="reveal-up stagger-1 rounded-[1.75rem] border border-line/60 bg-surface-raised p-6">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-gold" aria-hidden="true" />
          <h2 className="text-heading text-base text-ink">Today&apos;s material</h2>
        </div>
        <p className="mt-1 text-sm text-slate">
          What is one real thing from today related to your pillars? A sentence or two. If nothing real happened, no post today.
        </p>

        <textarea
          value={sourceMaterial}
          onChange={(e) => setSourceMaterial(e.target.value)}
          placeholder="e.g. Spent 3 hours debugging a deployment that failed because someone changed the env vars without telling anyone. Again."
          rows={3}
          className="mt-4 w-full rounded-xl border border-line bg-paper-raised px-3.5 py-2.5 text-sm transition-all outline-none placeholder:text-slate/60 focus-visible:border-gold/40 focus-visible:ring-2 focus-visible:ring-gold/20"
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate">Pillar:</span>
            <select
              value={selectedPillar}
              onChange={(e) => setSelectedPillar(e.target.value)}
              className="h-8 rounded-lg border border-line bg-paper-raised px-2 text-sm text-ink"
            >
              {pillars.length === 0 && <option value="">No pillars</option>}
              {pillars.map((p) => (
                <option key={p.id} value={p.id}>{p.pillarName}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate">Platform:</span>
            <div className="flex gap-1">
              {(['linkedin', 'x'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={cn(
                    'rounded-lg px-3 py-1 text-sm font-medium transition-all',
                    platform === p
                      ? 'bg-ink text-paper'
                      : 'bg-paper-tint text-slate hover:text-ink',
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => void generateDraft()}
            disabled={generating || !sourceMaterial.trim()}
            className="inline-flex items-center gap-2 rounded-xl gradient-gold px-5 py-2.5 text-sm font-semibold text-paper transition-all hover:shadow-gold disabled:opacity-50 active:scale-[0.97]"
          >
            {generating ? (
              <>
                <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
                {statusMessage ?? 'Generating...'}
              </>
            ) : (
              <>
                <Sparkles className="size-3.5" aria-hidden="true" />
                Generate draft
              </>
            )}
          </button>
          {!generating && sourceMaterial.trim() && (
            <span className="text-xs text-slate">{statusMessage}</span>
          )}
        </div>

        {draftError && (
          <p className="mt-3 text-sm text-status-no" role="alert">{draftError}</p>
        )}
      </section>

      {/* ── Draft Result ── */}
      {draftText && (
        <section className="reveal-up stagger-2 rounded-2xl border border-line/60 bg-surface-raised p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-heading text-base text-ink">Draft</h2>
            <button
              onClick={() => void copyDraft()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-paper-tint px-3 py-1.5 text-sm text-ink transition-colors hover:bg-line"
            >
              {copied ? <Check className="size-3.5 text-status-send" /> : <Copy className="size-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-ink/10 bg-paper-tint/20 p-4">
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{draftText}</p>
          </div>

          {/* Hook score */}
          {hookScore !== null && (
            <div className="mt-4 flex items-center gap-4 rounded-xl bg-paper-tint/40 p-3">
              <div className="flex items-center gap-2">
                <span className="text-label">Hook</span>
                <span className={cn(
                  'text-mono-medium text-lg font-medium',
                  hookScore >= 7 ? 'text-status-send' : hookScore >= 4 ? 'text-status-research' : 'text-status-no',
                )}>
                  {hookScore}/10
                </span>
              </div>
              {hookFeedback && <span className="text-xs text-slate">{hookFeedback}</span>}
            </div>
          )}

          {/* Checks */}
          <div className="mt-3 space-y-2">
            <CheckRow ok={selfCheckPassed} label="Self-check" note={selfCheckNote} />
            <CheckRow ok={bannedHits.length === 0} label="No banned phrases" note={bannedHits.length > 0 ? bannedHits.join(', ') : ''} />
            <CheckRow ok={specificityHit} label="Specificity" note={!specificityHit ? 'No detail from source material' : ''} />
          </div>
        </section>
      )}

      {/* ── Pillars ── */}
      <section className="reveal-up stagger-3 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-heading text-base text-ink">Pillars</h2>
          <button
            onClick={() => setShowAddPillar(true)}
            className="inline-flex items-center gap-1 text-sm text-gold transition-colors hover:text-gold-dark"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add
          </button>
        </div>

        {showAddPillar && (
          <AddPillarForm personaId={persona.id} onClose={() => setShowAddPillar(false)} />
        )}

        {pillars.length === 0 ? (
          <p className="text-sm text-slate">No pillars yet. Add 3-6 topics this persona wants to be known for.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {pillars.map((p) => (
              <div key={p.id} className="rounded-xl border border-line/60 bg-surface-raised p-4">
                <p className="text-sm font-medium text-ink">{p.pillarName}</p>
                {p.description && <p className="mt-0.5 text-xs text-slate">{p.description}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="reveal-up stagger-3 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-heading text-base text-ink">Trending angles</h2>
          <button
            onClick={() => setShowAddAngle(true)}
            className="inline-flex items-center gap-1 text-sm text-gold transition-colors hover:text-gold-dark"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add
          </button>
        </div>

        {showAddAngle && (
          <AddTrendingAngleForm
            personaId={persona.id}
            pillars={pillars}
            defaultPillarId={selectedPillar || pillars[0]?.id || ''}
            onClose={() => setShowAddAngle(false)}
            onAdded={() => {
              void loadAngles()
              void loadSuggestions()
            }}
          />
        )}

        {allAngles.length === 0 ? (
          <p className="text-sm text-slate">No curated angles yet. Add real trends your team actually observed.</p>
        ) : (
          <div className="space-y-2">
            {allAngles.slice(0, 6).map((angle) => (
              <div key={angle.id} className="rounded-xl border border-line/60 bg-surface-raised p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-ink">{angle.angleDescription}</p>
                  <span className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide',
                    angle.used ? 'bg-paper-tint text-slate' : 'bg-gold/10 text-gold',
                  )}>
                    {angle.used ? 'used' : 'fresh'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate">{angle.pillarName}{angle.sourceNote ? ` - ${angle.sourceNote}` : ''}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Recent History ── */}
      {history.length > 0 && (
        <section className="reveal-up stagger-4 space-y-3">
          <h2 className="text-heading text-base text-ink">Recently posted</h2>
          <div className="overflow-hidden rounded-2xl border border-line/60 bg-surface-raised">
            <ul className="divide-y divide-line/50">
              {history.slice(0, 5).map((h) => (
                <li key={h.id} className="px-5 py-3">
                  <p className="line-clamp-1 text-sm text-ink">{h.openingLine}</p>
                  <p className="mt-0.5 text-xs text-slate">{h.platform} · {new Date(h.postedAt).toLocaleDateString()}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ── Recent Drafts ── */}
      {activeDrafts.length > 0 && (
        <section className="reveal-up stagger-4 space-y-3">
          <h2 className="text-heading text-base text-ink">Drafts</h2>
          <div className="overflow-hidden rounded-2xl border border-line/60 bg-surface-raised">
            <ul className="divide-y divide-line/50">
              {activeDrafts.slice(0, 5).map((d) => (
                <li key={d.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm text-ink">{d.caption || 'Empty draft'}</p>
                    <p className="mt-0.5 text-xs text-slate">{d.platform} · {d.status}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {d.status === 'draft' && (
                      <button
                        onClick={() => void updateStatus(d.id, 'ready')}
                        className="rounded-lg px-2 py-1 text-xs text-status-send transition-colors hover:bg-status-send/8"
                      >
                        Ready
                      </button>
                    )}
                    {d.status === 'ready' && (
                      <button
                        onClick={() => void updateStatus(d.id, 'posted')}
                        className="rounded-lg px-2 py-1 text-xs text-gold transition-colors hover:bg-gold/8"
                      >
                        Posted
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  )
}

function CheckRow({ ok, label, note }: { ok: boolean; label: string; note?: string }) {
  return (
    <div className={cn('flex items-start gap-2.5 text-sm', ok ? 'text-status-send' : 'text-status-research')}>
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      )}
      <span>
        {label}
        {note && <span className="block text-xs text-slate">{note}</span>}
      </span>
    </div>
  )
}

function AddPillarForm({ personaId, onClose }: { personaId: string; onClose: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/content/pillars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId, pillarName: name.trim(), description: description.trim() }),
      })
      if (!res.ok) throw new Error('Failed to add pillar.')
      window.location.reload()
    } catch {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-line/60 bg-paper-tint/30 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="pillar-name" className="text-sm font-medium text-ink-soft">Pillar name</label>
          <input
            id="pillar-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Why people fail"
            className="mt-1 h-9 w-full rounded-lg border border-line bg-paper-raised px-3 text-sm outline-none focus-visible:border-gold/40 focus-visible:ring-2 focus-visible:ring-gold/20"
          />
        </div>
        <div>
          <label htmlFor="pillar-desc" className="text-sm font-medium text-ink-soft">Description</label>
          <input
            id="pillar-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
            className="mt-1 h-9 w-full rounded-lg border border-line bg-paper-raised px-3 text-sm outline-none focus-visible:border-gold/40 focus-visible:ring-2 focus-visible:ring-gold/20"
          />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate hover:bg-paper-tint">Cancel</button>
        <button onClick={() => void save()} disabled={saving || !name.trim()} className="rounded-lg gradient-gold px-4 py-1.5 text-sm font-semibold text-paper disabled:opacity-50">
          {saving ? 'Adding...' : 'Add pillar'}
        </button>
      </div>
    </div>
  )
}

function AddTrendingAngleForm({
  personaId,
  pillars,
  defaultPillarId,
  onClose,
  onAdded,
}: {
  personaId: string
  pillars: ContentPillar[]
  defaultPillarId: string
  onClose: () => void
  onAdded: () => void
}) {
  const [pillarId, setPillarId] = useState(defaultPillarId)
  const [angleDescription, setAngleDescription] = useState('')
  const [sourceNote, setSourceNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!pillarId || !angleDescription.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/content/trending-angles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaId,
          pillarId,
          angleDescription: angleDescription.trim(),
          sourceNote: sourceNote.trim(),
        }),
      })
      if (!res.ok) throw new Error('Failed to add angle.')
      onAdded()
      onClose()
    } catch {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-line/60 bg-paper-tint/30 p-4 space-y-3">
      <div>
        <label htmlFor="angle-pillar" className="text-sm font-medium text-ink-soft">Pillar</label>
        <select
          id="angle-pillar"
          value={pillarId}
          onChange={(e) => setPillarId(e.target.value)}
          className="mt-1 h-9 w-full rounded-lg border border-line bg-paper-raised px-3 text-sm text-ink"
        >
          {pillars.map((p) => (
            <option key={p.id} value={p.id}>{p.pillarName}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="angle-desc" className="text-sm font-medium text-ink-soft">Angle</label>
        <input
          id="angle-desc"
          value={angleDescription}
          onChange={(e) => setAngleDescription(e.target.value)}
          placeholder="One real trend your team spotted"
          className="mt-1 h-9 w-full rounded-lg border border-line bg-paper-raised px-3 text-sm outline-none focus-visible:border-gold/40 focus-visible:ring-2 focus-visible:ring-gold/20"
        />
      </div>
      <div>
        <label htmlFor="angle-source" className="text-sm font-medium text-ink-soft">Source note (optional)</label>
        <input
          id="angle-source"
          value={sourceNote}
          onChange={(e) => setSourceNote(e.target.value)}
          placeholder="Where your team saw this"
          className="mt-1 h-9 w-full rounded-lg border border-line bg-paper-raised px-3 text-sm outline-none focus-visible:border-gold/40 focus-visible:ring-2 focus-visible:ring-gold/20"
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate hover:bg-paper-tint">Cancel</button>
        <button
          onClick={() => void save()}
          disabled={saving || !pillarId || !angleDescription.trim()}
          className="rounded-lg gradient-gold px-4 py-1.5 text-sm font-semibold text-paper disabled:opacity-50"
        >
          {saving ? 'Adding...' : 'Add angle'}
        </button>
      </div>
    </div>
  )
}
