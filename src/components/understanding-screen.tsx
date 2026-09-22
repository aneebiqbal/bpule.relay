'use client'

import { useState } from 'react'
import { Check, Pencil, Plus, X, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from 'cn'
import type { ContentPersona, TopicCluster, ContentProfile } from '@/lib/domain/types'

export function UnderstandingScreen({
  persona,
  topicClusters,
  contentProfile,
  onUpdated,
}: {
  persona: ContentPersona
  topicClusters: TopicCluster[]
  contentProfile: ContentProfile | null
  onUpdated: (persona: ContentPersona) => void
}) {
  const [editing, setEditing] = useState(false)
  const [humorStyle, setHumorStyle] = useState(persona.humorStyle)
  const [values, setValues] = useState((persona.valuesAndOpinions ?? []).join('\n'))
  const [admired, setAdmired] = useState((persona.admiredExamples ?? []).join('\n'))
  const [role, setRole] = useState(contentProfile?.role ?? '')
  const [seniority, setSeniority] = useState(contentProfile?.seniority ?? '')
  const [audience, setAudience] = useState(contentProfile?.audience ?? '')
  const [industries, setIndustries] = useState((contentProfile?.industries ?? []).join(', '))
  const [expertise, setExpertise] = useState((contentProfile?.expertise ?? []).map((e) => e.area).join('\n'))
  const [opinions, setOpinions] = useState((contentProfile?.opinions ?? []).map((o) => o.belief).join('\n'))
  const [projects, setProjects] = useState((contentProfile?.projects ?? []).map((p) => p.name).join('\n'))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

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
          contentDna: {
            role: role.trim(),
            seniority: seniority.trim(),
            audience: audience.trim(),
            industries: industries.split(',').map((s) => s.trim()).filter(Boolean),
            expertise: expertise.split('\n').map((a) => ({ area: a.trim(), level: 'proficient' as const, evidence: '' })).filter((e) => e.area.length > 0),
            opinions: opinions.split('\n').map((b) => ({ belief: b.trim(), strength: 'moderate' as const })).filter((o) => o.belief.length > 0),
            projects: projects.split('\n').map((n) => ({ name: n.trim(), description: '', role: '', outcome: '' })).filter((p) => p.name.length > 0),
          },
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

  const focusAreas = topicClusters.filter((c) => c.clusterName.trim().length > 0).slice(0, 6)

  const sections = [
    {
      title: 'I work on',
      view: focusAreas.length > 0
        ? focusAreas.map((c) => c.clusterName).join(', ')
        : null,
      editField: null,
    },
    {
      title: 'Role',
      view: contentProfile?.role || null,
      editField: editing ? (
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="e.g. Staff Engineer, Product Designer"
          className="h-9 w-full rounded-xl border border-line bg-bone-raised px-3 text-sm outline-none focus-visible:border-cobalt/40 focus-visible:ring-2 focus-visible:ring-cobalt/20"
        />
      ) : null,
    },
    {
      title: 'Seniority',
      view: contentProfile?.seniority || null,
      editField: editing ? (
        <input
          value={seniority}
          onChange={(e) => setSeniority(e.target.value)}
          placeholder="e.g. Senior, Staff, Principal"
          className="h-9 w-full rounded-xl border border-line bg-bone-raised px-3 text-sm outline-none focus-visible:border-cobalt/40 focus-visible:ring-2 focus-visible:ring-cobalt/20"
        />
      ) : null,
    },
    {
      title: 'I usually write for',
      view: contentProfile?.audience || null,
      editField: editing ? (
        <input
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          placeholder="e.g. Engineering managers, startup founders"
          className="h-9 w-full rounded-xl border border-line bg-bone-raised px-3 text-sm outline-none focus-visible:border-cobalt/40 focus-visible:ring-2 focus-visible:ring-cobalt/20"
        />
      ) : null,
    },
    {
      title: 'Industries',
      view: contentProfile?.industries.length ? contentProfile.industries.join(', ') : null,
      editField: editing ? (
        <input
          value={industries}
          onChange={(e) => setIndustries(e.target.value)}
          placeholder="e.g. fintech, healthcare, developer tools"
          className="h-9 w-full rounded-xl border border-line bg-bone-raised px-3 text-sm outline-none focus-visible:border-cobalt/40 focus-visible:ring-2 focus-visible:ring-cobalt/20"
        />
      ) : null,
    },
    {
      title: 'I know a lot about',
      view: contentProfile?.expertise.length ? contentProfile.expertise.map((e) => e.area).join(', ') : null,
      editField: editing ? (
        <textarea
          value={expertise}
          onChange={(e) => setExpertise(e.target.value)}
          rows={3}
          placeholder="One area per line"
          className="w-full rounded-xl border border-line bg-bone-raised px-3 py-2 text-sm outline-none focus-visible:border-cobalt/40 focus-visible:ring-2 focus-visible:ring-cobalt/20"
        />
      ) : null,
    },
    {
      title: 'Things I have strong opinions about',
      view: contentProfile?.opinions.length ? contentProfile.opinions.map((o) => o.belief) : null,
      editField: editing ? (
        <textarea
          value={opinions}
          onChange={(e) => setOpinions(e.target.value)}
          rows={4}
          placeholder="One per line"
          className="w-full rounded-xl border border-line bg-bone-raised px-3 py-2 text-sm outline-none focus-visible:border-cobalt/40 focus-visible:ring-2 focus-visible:ring-cobalt/20"
        />
      ) : null,
      isList: true,
    },
    {
      title: 'Experiences Relay remembers',
      view: contentProfile?.projects.length ? contentProfile.projects.map((p) => p.name) : null,
      editField: editing ? (
        <textarea
          value={projects}
          onChange={(e) => setProjects(e.target.value)}
          rows={3}
          placeholder="One per line"
          className="w-full rounded-xl border border-line bg-bone-raised px-3 py-2 text-sm outline-none focus-visible:border-cobalt/40 focus-visible:ring-2 focus-visible:ring-cobalt/20"
        />
      ) : null,
      isList: true,
    },
    {
      title: 'How I tend to write',
      view: [
        persona.humorStyle || null,
        persona.admiredExamples.length ? `Admires: ${persona.admiredExamples.slice(0, 3).join(', ')}` : null,
      ].filter(Boolean).join(' · ') || null,
      editField: editing ? (
        <div className="space-y-3">
          <input
            value={humorStyle}
            onChange={(e) => setHumorStyle(e.target.value)}
            placeholder="e.g. Dry, playful, mostly serious"
            className="h-9 w-full rounded-xl border border-line bg-bone-raised px-3 text-sm outline-none focus-visible:border-cobalt/40 focus-visible:ring-2 focus-visible:ring-cobalt/20"
          />
          <textarea
            value={admired}
            onChange={(e) => setAdmired(e.target.value)}
            rows={2}
            placeholder="Posts you admire tend to be... (one per line)"
            className="w-full rounded-xl border border-line bg-bone-raised px-3 py-2 text-sm outline-none focus-visible:border-cobalt/40 focus-visible:ring-2 focus-visible:ring-cobalt/20"
          />
        </div>
      ) : null,
    },
  ]

  const visibleSections = expanded ? sections : sections.slice(0, 4)

  return (
    <section className="rounded-2xl border border-line/60 bg-bone-raised">
      <div className="flex items-center justify-between p-5 pb-0">
        <div>
          <h2 className="text-heading text-base text-ink">What Relay knows about me</h2>
          <p className="mt-0.5 text-xs text-graphite">Relay gets better as you use Studio.</p>
        </div>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-sm text-graphite transition-colors hover:bg-bone hover:text-ink"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            Edit
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditing(false)
                setHumorStyle(persona.humorStyle)
                setValues(persona.valuesAndOpinions.join('\n'))
                setAdmired(persona.admiredExamples.join('\n'))
              }}
              className="rounded-xl border border-line px-3 py-1.5 text-sm text-graphite transition-colors hover:bg-bone"
            >
              Cancel
            </button>
            <button
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-solid px-3 py-1.5 text-sm font-medium text-on-solid transition-all hover:bg-solid/90 disabled:opacity-50"
            >
              <Check className="size-3.5" aria-hidden="true" />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>

      <div className="p-5 space-y-4">
        {visibleSections.map((section) => (
          <div key={section.title}>
            <p className="text-label text-graphite">{section.title}</p>
            <div className="mt-1">
              {section.editField ?? (
                section.isList && section.view ? (
                  <ul className="space-y-1">
                    {(section.view as string[]).map((item, i) => (
                      <li key={`${i}-${item}`} className="text-sm text-ink">· {item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink">{section.view as string || 'Not set yet.'}</p>
                )
              )}
            </div>
          </div>
        ))}

        {sections.length > 4 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-sm text-graphite transition-colors hover:text-ink"
          >
            {expanded ? (
              <>
                <ChevronUp className="size-3.5" aria-hidden="true" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="size-3.5" aria-hidden="true" />
                Show more
              </>
            )}
          </button>
        )}
      </div>

      {message && (
        <div className="px-5 pb-5">
          <p className={cn('text-sm', message === 'Saved.' ? 'text-status-success' : 'text-status-danger')}>{message}</p>
        </div>
      )}
    </section>
  )
}
