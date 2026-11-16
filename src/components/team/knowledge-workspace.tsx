'use client'

/**
 * Knowledge workspace — manage the person's canonical knowledge in place.
 *
 * Profile fields and skill arrays go through the profile-intelligence PATCH,
 * which records human-verified edits so later imports cannot override them.
 * Experience, projects, claims and proof go through the canonical knowledge
 * endpoint, which writes the existing tables and appends an audit row. Nothing
 * is treated as verified evidence without its recorded authority.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { V4Panel, V4PanelHeader, V4Chip } from '@/components/v4/primitives'
import { cn } from 'cn'
import type { ProfileOperatingModel } from '@/lib/profiles/operating-model'

interface ExperienceRow { id?: string; role: string; company: string; startDate: string; endDate: string; current: boolean }
interface ProjectRow { id?: string; title: string; role: string; description: string; clientCompany: string }

export function KnowledgeWorkspace({ model, canManage }: { model: ProfileOperatingModel; canManage: boolean }) {
  const router = useRouter()
  const knowledge = model.knowledge
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [headline, setHeadline] = useState(model.headline ?? '')
  const [currentRole, setCurrentRole] = useState(model.knowledge.currentRole ?? '')
  const [summary, setSummary] = useState(model.knowledge.summary ?? '')
  const [skills, setSkills] = useState<string[]>(model.knowledge.skills)
  const [skillDraft, setSkillDraft] = useState('')

  const [experience, setExperience] = useState<ExperienceRow[]>(() =>
    knowledge.experience.map((row) => ({
      role: row.role ?? '', company: row.company ?? '', startDate: row.startDate ?? '', endDate: row.endDate ?? '', current: row.current,
    })),
  )
  const [projects, setProjects] = useState<ProjectRow[]>(() =>
    knowledge.projects.map((row) => ({
      title: row.title ?? '', role: row.role ?? '', description: row.description ?? '', clientCompany: row.clientCompany ?? '',
    })),
  )

  async function run(operations: unknown[], success: string, reason?: string) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch(`/api/team/profiles/${model.personId}/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operations, reason }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Could not save knowledge.')
      setMessage(success)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save knowledge.')
    } finally {
      setBusy(false)
    }
  }

  async function saveProfile() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch(`/api/profile-intelligence/profiles/${model.personId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headline: headline || null,
          current_role: currentRole || null,
          professional_summary: summary || null,
          primary_skills: skills,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Could not save profile.')
      setMessage('Profile knowledge saved (human-verified).')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile.')
    } finally {
      setBusy(false)
    }
  }

  async function uploadCv(file: File) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/profiles/${model.personId}/cv?admin=1`, { method: 'POST', body: form })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Could not upload the CV.')
      setMessage('CV uploaded. It will be parsed into knowledge.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the CV.')
    } finally {
      setBusy(false)
    }
  }

  function addSkill() {
    const value = skillDraft.trim()
    if (!value) return
    if (!skills.includes(value)) setSkills((current) => [...current, value])
    setSkillDraft('')
  }

  function saveExperience() {
    const operations: Array<Record<string, unknown>> = []
    experience.forEach((row, index) => {
      const data: Record<string, unknown> = {
        role: row.role || (row.id ? undefined : `Position ${index + 1}`),
        company: row.company || null,
        start_date: row.startDate || null,
        end_date: row.current ? null : row.endDate || null,
        is_current: row.current,
      }
      if (row.id) operations.push({ entity: 'experience', action: 'update', id: row.id, data })
      else operations.push({ entity: 'experience', action: 'create', data })
    })
    void run(operations, 'Experience saved.')
  }

  function saveProjects() {
    const operations: Array<Record<string, unknown>> = projects.map((row) => {
      const data: Record<string, unknown> = {
        project_title: row.title || (row.id ? undefined : 'Untitled project'),
        my_role: row.role || null,
        description: row.description || null,
        client_company: row.clientCompany || null,
      }
      if (row.id) return { entity: 'project', action: 'update', id: row.id, data }
      return { entity: 'project', action: 'create', data }
    })
    void run(operations, 'Projects saved.')
  }

  const readiness = [
    { label: 'CV / source', ready: knowledge.sources.length > 0, value: knowledge.sources.length > 0 ? `${knowledge.sources.length}` : 'Missing' },
    { label: 'Experience', ready: knowledge.experience.length > 0, value: knowledge.experience.length > 0 ? `${knowledge.experience.length}` : 'Missing' },
    { label: 'Skills', ready: knowledge.skills.length > 0, value: `${knowledge.skills.length}` },
    { label: 'Projects', ready: knowledge.projects.length > 0, value: `${knowledge.projects.length}` },
    { label: 'Proof', ready: knowledge.proof.length > 0, value: `${knowledge.proof.length}` },
    { label: 'Claims', ready: knowledge.claims.length > 0, value: `${knowledge.claims.length}` },
  ]

  return (
    <div className="space-y-4">
      <V4Panel>
        <V4PanelHeader eyebrow="Knowledge" title="Match readiness" hint={knowledge.skills.length > 0 || knowledge.proof.length > 0 ? 'Complete' : 'Incomplete'} />
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] sm:grid-cols-3">
          {readiness.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-2 border-b border-line/50 pb-1">
              <dt className="text-graphite">{row.label}</dt>
              <dd className={cn('font-medium', row.ready ? 'text-status-success' : 'text-status-warning')}>{row.value}</dd>
            </div>
          ))}
        </dl>
      </V4Panel>

      {canManage && (
        <V4Panel>
          <V4PanelHeader eyebrow="Knowledge" title="Profile summary" hint="Manual edits are human-verified." />
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Headline</span>
              <input value={headline} onChange={(event) => setHeadline(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-line bg-bone px-2 text-[13px] text-ink" />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Current role</span>
              <input value={currentRole} onChange={(event) => setCurrentRole(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-line bg-bone px-2 text-[13px] text-ink" />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Summary</span>
              <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} className="mt-1 w-full rounded-md border border-line bg-bone px-2 py-1.5 text-[13px] text-ink" />
            </label>
          </div>
          <div className="mt-3">
            <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Skills</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {skills.map((skill) => (
                <button key={skill} type="button" onClick={() => setSkills((current) => current.filter((row) => row !== skill))} className="rounded-full bg-bone px-2.5 py-1 text-[11px] text-graphite ring-1 ring-line hover:text-ink">
                  {skill} ×
                </button>
              ))}
              {skills.length === 0 && <span className="text-[11px] text-stone">No skills</span>}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={skillDraft}
                onChange={(event) => setSkillDraft(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addSkill() } }}
                placeholder="Add a skill…"
                className="h-9 flex-1 rounded-md border border-line bg-bone px-2 text-[12px] text-ink placeholder:text-stone"
              />
              <button type="button" onClick={addSkill} className="rounded-md border border-line px-3 text-[12px] font-medium text-graphite hover:text-ink">Add</button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void saveProfile()} disabled={busy} className="rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid disabled:opacity-50">
              Save profile knowledge
            </button>
            <label className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-graphite transition-colors hover:text-ink">
              Upload / replace CV
              <input type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void uploadCv(file)
                event.target.value = ''
              }} />
            </label>
          </div>
        </V4Panel>
      )}

      <V4Panel>
        <V4PanelHeader eyebrow="Knowledge" title="Experience" hint={canManage ? 'Add, edit or remove positions' : undefined} />
        <div className="mt-3 space-y-2">
          {experience.map((row, index) => (
            <div key={index} className="grid grid-cols-1 gap-2 rounded-lg border border-line/70 p-2 sm:grid-cols-4">
              <input value={row.role} onChange={(event) => setExperience((current) => current.map((item, i) => i === index ? { ...item, role: event.target.value } : item))} placeholder="Role" disabled={!canManage} className="h-8 rounded-md border border-line bg-bone px-2 text-[12px] text-ink disabled:opacity-60" />
              <input value={row.company} onChange={(event) => setExperience((current) => current.map((item, i) => i === index ? { ...item, company: event.target.value } : item))} placeholder="Company" disabled={!canManage} className="h-8 rounded-md border border-line bg-bone px-2 text-[12px] text-ink disabled:opacity-60" />
              <input value={row.startDate} onChange={(event) => setExperience((current) => current.map((item, i) => i === index ? { ...item, startDate: event.target.value } : item))} placeholder="Start (YYYY-MM)" disabled={!canManage} className="h-8 rounded-md border border-line bg-bone px-2 text-[12px] text-ink disabled:opacity-60" />
              <input value={row.endDate} onChange={(event) => setExperience((current) => current.map((item, i) => i === index ? { ...item, endDate: event.target.value } : item))} placeholder="End (YYYY-MM)" disabled={!canManage || row.current} className="h-8 rounded-md border border-line bg-bone px-2 text-[12px] text-ink disabled:opacity-60" />
            </div>
          ))}
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setExperience((current) => [...current, { role: '', company: '', startDate: '', endDate: '', current: false }])} className="rounded-md border border-line px-2.5 py-1 text-[11px] text-graphite hover:text-ink">
                Add position
              </button>
              <button type="button" onClick={saveExperience} disabled={busy} className="rounded-md bg-bone px-2.5 py-1 text-[11px] font-medium text-ink ring-1 ring-line disabled:opacity-50">
                Save experience
              </button>
            </div>
          )}
        </div>
      </V4Panel>

      <V4Panel>
        <V4PanelHeader eyebrow="Knowledge" title="Projects" hint={canManage ? 'Add, edit or remove portfolio items' : undefined} />
        <div className="mt-3 space-y-2">
          {projects.map((row, index) => (
            <div key={index} className="grid grid-cols-1 gap-2 rounded-lg border border-line/70 p-2 sm:grid-cols-2">
              <input value={row.title} onChange={(event) => setProjects((current) => current.map((item, i) => i === index ? { ...item, title: event.target.value } : item))} placeholder="Project title" disabled={!canManage} className="h-8 rounded-md border border-line bg-bone px-2 text-[12px] text-ink disabled:opacity-60" />
              <input value={row.role} onChange={(event) => setProjects((current) => current.map((item, i) => i === index ? { ...item, role: event.target.value } : item))} placeholder="Your role" disabled={!canManage} className="h-8 rounded-md border border-line bg-bone px-2 text-[12px] text-ink disabled:opacity-60" />
              <textarea value={row.description} onChange={(event) => setProjects((current) => current.map((item, i) => i === index ? { ...item, description: event.target.value } : item))} placeholder="Description" disabled={!canManage} className="h-14 rounded-md border border-line bg-bone px-2 py-1.5 text-[12px] text-ink disabled:opacity-60 sm:col-span-2" />
            </div>
          ))}
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setProjects((current) => [...current, { title: '', role: '', description: '', clientCompany: '' }])} className="rounded-md border border-line px-2.5 py-1 text-[11px] text-graphite hover:text-ink">
                Add project
              </button>
              <button type="button" onClick={saveProjects} disabled={busy} className="rounded-md bg-bone px-2.5 py-1 text-[11px] font-medium text-ink ring-1 ring-line disabled:opacity-50">
                Save projects
              </button>
            </div>
          )}
        </div>
      </V4Panel>

      <V4Panel>
        <V4PanelHeader eyebrow="Knowledge" title="Claims and proof" hint="Manually edited claims are human-verified." />
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {knowledge.claims.map((claim) => (
              <span key={`${claim.key}-${claim.value}`} className="rounded-full bg-bone px-2.5 py-1 text-[11px] text-graphite ring-1 ring-line">
                {claim.key}: {claim.value}
              </span>
            ))}
            {knowledge.claims.length === 0 && <span className="text-[11px] text-stone">No claims extracted yet.</span>}
          </div>
          <div className="space-y-2">
            {knowledge.proof.map((row, index) => (
              <div key={`${row.capability ?? 'proof'}-${index}`} className="rounded-lg border border-line/70 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-medium text-ink">{row.capability ?? 'Capability'}</p>
                  {row.verified ? <V4Chip tone="success">Verified</V4Chip> : <V4Chip tone="warning">Unverified</V4Chip>}
                </div>
                {row.claim && <p className="mt-0.5 text-[12px] text-graphite">{row.claim}</p>}
                {row.reference && <p className="mt-0.5 text-[11px] text-stone">Source: {row.reference}</p>}
              </div>
            ))}
            {knowledge.proof.length === 0 && <span className="text-[11px] text-stone">No proof cards.</span>}
          </div>
          <div className="text-[11px] text-stone">
            {knowledge.sources.length > 0
              ? `Sources: ${knowledge.sources.map((source) => source.filename ?? 'file').join(', ')}`
              : 'No source documents uploaded.'}
          </div>
        </div>
      </V4Panel>

      {message && <p className="text-[12px] text-status-success">{message}</p>}
      {error && <p role="alert" className="text-[12px] text-status-danger">{error}</p>}
    </div>
  )
}
