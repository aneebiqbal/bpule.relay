'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, ChevronDown, ChevronRight, Archive, Trash2, UserPlus, Shield, ExternalLink, Save, X, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogActions } from '@/components/ui/dialog'
import { cn } from 'cn'
import type { RevenueIdentity, RevenueIdentityChannel, IdentityAssignment, Rep } from '@/lib/domain/types'

interface IdentityForm {
  identityName: string
  slug: string
  title: string
  positioning: string
  profileUrl: string
  skills: string
  industries: string
  technologies: string
  channel: RevenueIdentityChannel
  proposalPositioning: string
}

const INITIAL_FORM: IdentityForm = {
  identityName: '',
  slug: '',
  title: '',
  positioning: '',
  profileUrl: '',
  skills: '',
  industries: '',
  technologies: '',
  channel: 'linkedin',
  proposalPositioning: '',
}

function parseTags(raw: string): string[] {
  return [...new Set(raw.split(/[,\n]+/).map((t) => t.trim()).filter(Boolean))].slice(0, 20)
}

function serializeTags(tags: string[] | string | null | undefined): string {
  if (!tags) return ''
  if (typeof tags === 'string') return tags
  if (!Array.isArray(tags)) return ''
  return tags.join(', ')
}

export function RevenueIdentityManager() {
  const [identities, setIdentities] = useState<RevenueIdentity[]>([])
  const [reps, setReps] = useState<Rep[]>([])
  const [assignments, setAssignments] = useState<IdentityAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<IdentityForm | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [assignDialog, setAssignDialog] = useState<string | null>(null)
  const [selectedRep, setSelectedRep] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  const loadData = useCallback(async () => {
    try {
      const [idRes, repRes, asgnRes] = await Promise.all([
        fetch('/api/admin/revenue-identities'),
        fetch('/api/reps'),
        fetch('/api/admin/assignments'),
      ])
      const idData = await idRes.json()
      const repData = await repRes.json()
      const asgnData = await asgnRes.json()
      if (!idRes.ok) throw new Error(idData.error ?? 'Failed to load identities')
      setIdentities(idData.identities ?? [])
      setReps(repData.reps ?? [])
      setAssignments(asgnData.assignments ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      await loadData()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openCreate() {
    setForm({ ...INITIAL_FORM })
    setEditId(null)
    setError(null)
    setTimeout(() => nameRef.current?.focus(), 50)
  }

  function openEdit(id: string) {
    const ri = identities.find((r) => r.id === id)
    if (!ri) return
    setForm({
      identityName: ri.identityName,
      slug: ri.slug,
      title: ri.title ?? '',
      positioning: ri.positioning ?? '',
      profileUrl: ri.profileUrl ?? '',
      skills: serializeTags(ri.skills),
      industries: serializeTags(ri.industries),
      technologies: serializeTags(ri.technologies),
      channel: ri.channel,
      proposalPositioning: ri.proposalPositioning ?? '',
    })
    setEditId(id)
    setError(null)
  }

  function closeForm() {
    setForm(null)
    setEditId(null)
  }

  async function saveForm() {
    if (!form) return
    if (!form.identityName.trim() || !form.slug.trim()) {
      setError('Name and slug are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const url = editId ? `/api/admin/revenue-identities/${editId}` : '/api/admin/revenue-identities'
      const method = editId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identityName: form.identityName.trim(),
          slug: form.slug.trim(),
          title: form.title.trim() || null,
          positioning: form.positioning.trim() || null,
          profileUrl: form.profileUrl.trim() || null,
          skills: parseTags(form.skills),
          industries: parseTags(form.industries),
          technologies: parseTags(form.technologies),
          channel: form.channel,
          proposalPositioning: form.proposalPositioning.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      closeForm()
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function archiveIdentity(id: string) {
    const res = await fetch(`/api/admin/revenue-identities/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    })
    if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Archive failed'); return }
    await loadData()
  }

  async function deleteIdentity() {
    if (!pendingDelete) return
    const res = await fetch(`/api/admin/revenue-identities/${pendingDelete}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Delete failed') }
    setPendingDelete(null)
    await loadData()
  }

  async function assignRep() {
    if (!assignDialog || !selectedRep) return
    const res = await fetch(`/api/admin/revenue-identities/${assignDialog}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repId: selectedRep }),
    })
    if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Assign failed') }
    setAssignDialog(null)
    setSelectedRep('')
    await loadData()
  }

  async function unassignRep(identityId: string, repId: string) {
    const res = await fetch(`/api/admin/revenue-identities/${identityId}/assign?repId=${encodeURIComponent(repId)}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Unassign failed') }
    await loadData()
  }

  const assignedReps = (identityId: string) => {
    return assignments.filter((a) => a.revenueIdentityId === identityId)
  }

  if (loading) return <div className="text-sm text-slate">Loading revenue identities…</div>

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate">{identities.length} identity{identities.length !== 1 ? 'ies' : ''}</p>
        <Button onClick={openCreate} size="sm">
          <Plus className="size-3.5 mr-1.5" /> Create Identity
        </Button>
      </div>

      {form && (
        <div className="rounded-xl border border-line bg-bone-raised p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-ink">{editId ? 'Edit Identity' : 'New Revenue Identity'}</h3>
            <button onClick={closeForm} className="text-slate hover:text-ink"><X className="size-4" /></button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ri-name">Identity Name</Label>
              <Input id="ri-name" ref={nameRef} value={form.identityName} onChange={(e) => setForm({ ...form, identityName: e.target.value })} placeholder="e.g. Mehak" />
            </div>
            <div>
              <Label htmlFor="ri-slug">Slug</Label>
              <Input id="ri-slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} placeholder="mehak-linkedin" />
            </div>
            <div>
              <Label htmlFor="ri-title">Title</Label>
              <Input id="ri-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Senior Engineer" />
            </div>
            <div>
              <Label htmlFor="ri-channel">Channel</Label>
              <Select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as RevenueIdentityChannel })}>
                <option value="linkedin">LinkedIn</option>
                <option value="upwork">Upwork</option>
                <option value="other">Other</option>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="ri-positioning">Positioning</Label>
              <Textarea id="ri-positioning" value={form.positioning} onChange={(e) => setForm({ ...form, positioning: e.target.value })} rows={2} placeholder="What this identity is known for…" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="ri-url">Profile URL</Label>
              <Input id="ri-url" value={form.profileUrl} onChange={(e) => setForm({ ...form, profileUrl: e.target.value })} placeholder="https://…" />
            </div>
            <div>
              <Label htmlFor="ri-skills">Skills (comma-separated)</Label>
              <Input id="ri-skills" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="React, Node.js, AWS" />
            </div>
            <div>
              <Label htmlFor="ri-industries">Industries</Label>
              <Input id="ri-industries" value={form.industries} onChange={(e) => setForm({ ...form, industries: e.target.value })} placeholder="SaaS, FinTech" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="ri-tech">Technologies</Label>
              <Input id="ri-tech" value={form.technologies} onChange={(e) => setForm({ ...form, technologies: e.target.value })} placeholder="React, Next.js, Firebase" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="ri-proposal">Proposal Positioning</Label>
              <Textarea id="ri-proposal" value={form.proposalPositioning} onChange={(e) => setForm({ ...form, proposalPositioning: e.target.value })} rows={2} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeForm}>Cancel</Button>
          <Button onClick={() => void saveForm()} disabled={saving}>
              {saving ? <Save className="size-3.5 mr-1.5 animate-spin" /> : <Save className="size-3.5 mr-1.5" />}
              {editId ? 'Save Changes' : 'Create Identity'}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {identities.map((ri) => {
          const isExpanded = expanded === ri.id
          const riAssignments = assignedReps(ri.id)
          return (
            <div key={ri.id} className={cn('rounded-xl border bg-bone-raised', ri.status === 'archived' ? 'border-line/50 opacity-60' : 'border-line')}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setExpanded(isExpanded ? null : ri.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(isExpanded ? null : ri.id) } }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left cursor-pointer"
              >
                {isExpanded ? <ChevronDown className="size-4 text-slate" /> : <ChevronRight className="size-4 text-slate" />}
                <div className={cn('flex size-8 items-center justify-center rounded-lg text-xs font-medium',
                  ri.channel === 'linkedin' ? 'bg-[#0a66c2]/10 text-[#0a66c2]' :
                  ri.channel === 'upwork' ? 'bg-[#14a800]/10 text-[#14a800]' :
                  'bg-graphite/10 text-graphite'
                )}>
                  {ri.channel === 'linkedin' ? 'in' : ri.channel === 'upwork' ? 'U' : '•'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink truncate">{ri.identityName}</span>
                    <span className="text-xs text-slate">{ri.title}</span>
                    {ri.status === 'archived' && <span className="rounded bg-stone/20 px-1.5 py-0.5 text-[10px] text-slate">ARCHIVED</span>}
                  </div>
                  <p className="text-xs text-slate truncate">{ri.slug} · {riAssignments.length} rep{riAssignments.length !== 1 ? 's' : ''} assigned</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); openEdit(ri.id) }}
                    className="rounded-md p-1.5 text-slate hover:bg-bone hover:text-ink"
                    title="Edit"
                  >
                    <Save className="size-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setAssignDialog(ri.id) }}
                    className="rounded-md p-1.5 text-slate hover:bg-bone hover:text-ink"
                    title="Assign to rep"
                  >
                    <UserPlus className="size-3.5" />
                  </button>
                  {ri.status === 'active' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); void archiveIdentity(ri.id) }}
                      className="rounded-md p-1.5 text-slate hover:bg-bone hover:text-amber-600"
                      title="Archive"
                    >
                      <Archive className="size-3.5" />
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setPendingDelete(ri.id) }}
                    className="rounded-md p-1.5 text-stone hover:bg-bone hover:text-status-danger"
                    title="Delete"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className="border-t border-line px-4 py-3 space-y-3">
                  {ri.positioning && <p className="text-xs text-graphite">{ri.positioning}</p>}
                  {ri.profileUrl && (
                    <a href={ri.profileUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-cobalt hover:underline">
                      <ExternalLink className="size-3" /> Profile
                    </a>
                  )}
                  {Array.isArray(ri.skills) && ri.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {ri.skills.slice(0, 8).map((s) => (
                        <span key={s} className="rounded bg-bone px-1.5 py-0.5 text-[10px] text-graphite">{s}</span>
                      ))}
                    </div>
                  )}
                  <div>
                    <p className="text-label text-stone mb-1">Assigned Reps</p>
                    {riAssignments.length === 0 ? (
                      <p className="text-xs text-slate">No reps assigned</p>
                    ) : (
                      <div className="space-y-1">
                        {riAssignments.map((a) => {
                          const rep = reps.find((r) => r.id === a.repId)
                          return (
                            <div key={a.id} className="flex items-center justify-between rounded bg-bone px-2 py-1">
                              <span className="text-xs text-graphite">{rep?.name ?? a.repId}</span>
                              <button onClick={() => void unassignRep(ri.id, a.repId)} className="text-[10px] text-stone hover:text-status-danger">remove</button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {identities.length === 0 && (
          <div className="rounded-xl border border-dashed border-line py-8 text-center">
            <Shield className="mx-auto size-8 text-slate mb-2" />
            <p className="text-sm text-slate">No revenue identities yet. Create one to assign to reps.</p>
          </div>
        )}
      </div>

      {pendingDelete && (
        <Dialog open onClose={() => setPendingDelete(null)} title="Delete Identity">
          <div className="p-5 space-y-3">
            <p className="text-sm text-slate">This permanently removes the revenue identity and its assignments. This cannot be undone.</p>
          </div>
          <DialogActions>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void deleteIdentity()}>Delete</Button>
          </DialogActions>
        </Dialog>
      )}

      {assignDialog && (
        <Dialog open onClose={() => setAssignDialog(null)} title="Assign to Rep">
          <div className="p-5 space-y-3">
            <Select value={selectedRep} onChange={(e) => setSelectedRep(e.target.value)}>
              <option value="">Select a rep…</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </Select>
          </div>
          <DialogActions>
            <Button variant="outline" onClick={() => setAssignDialog(null)}>Cancel</Button>
            <Button onClick={() => void assignRep()}>Assign</Button>
          </DialogActions>
        </Dialog>
      )}
    </div>
  )
}
