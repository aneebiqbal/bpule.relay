'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogActions } from '@/components/ui/dialog'
import { cn } from 'cn'
import type { Profile, ProofItem, Rep } from '@/lib/domain/types'

type Platform = 'linkedin' | 'upwork'

interface ProfileDraft {
  repId: string
  id?: string
  platform: Platform
  label: string
  profileUrl: string
  headline: string
}

const emptyProfileDraft = (repId: string): ProfileDraft => ({
  repId,
  platform: 'linkedin',
  label: '',
  profileUrl: '',
  headline: '',
})

interface ProofDraft {
  profileId: string
  id?: string
  projectSummary: string
  reviewQuote: string
  permissionOnFile: boolean
  clientName: string
  tags: string[]
}

const emptyProofDraft = (profileId: string): ProofDraft => ({
  profileId,
  projectSummary: '',
  reviewQuote: '',
  permissionOnFile: false,
  clientName: '',
  tags: [],
})

function parseTags(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,\n]+/)
        .map((t) => t.trim().toLowerCase().replace(/\s+/g, '-'))
        .filter((t) => t.length > 0),
    ),
  ].slice(0, 12)
}

export function ManageProfiles({
  initialReps,
  initialProfiles,
  isAdmin,
  currentRepId,
}: {
  initialReps: Rep[]
  initialProfiles: Profile[]
  isAdmin: boolean
  currentRepId: string
}) {
  const [profiles, setProfiles] = useState<Profile[]>(initialProfiles)
  const [proofsByProfile, setProofsByProfile] = useState<Record<string, ProofItem[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [profileDraft, setProfileDraft] = useState<ProfileDraft | null>(null)
  const [proofDraft, setProofDraft] = useState<ProofDraft | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cvBusyFor, setCvBusyFor] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<
    { kind: 'profile'; profileId: string } | { kind: 'proof'; profileId: string; itemId: string } | null
  >(null)

  async function loadProofs(profileId: string) {
    if (proofsByProfile[profileId]) return
    const params = new URLSearchParams({ profileId })
    if (isAdmin) params.set('admin', '1')
    const res = await fetch(`/api/proofs?${params.toString()}`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Failed to load proof items.')
    setProofsByProfile((p) => ({ ...p, [profileId]: data.items ?? [] }))
  }

  async function openProfile(profileId: string) {
    const next = expanded === profileId ? null : profileId
    setExpanded(next)
    setError(null)
    if (next) {
      try {
        await loadProofs(profileId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load proof items.')
      }
    }
  }

  async function saveProfile() {
    if (!profileDraft) return
    if (!profileDraft.label.trim() && !profileDraft.profileUrl.trim()) {
      setError('Give the profile a label or a URL so it is recognizable.')
      return
    }
    setSaving('profile')
    setError(null)
    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: profileDraft.id,
          repId: profileDraft.repId,
          platform: profileDraft.platform,
          label: profileDraft.label.trim() || null,
          profileUrl: profileDraft.profileUrl.trim() || null,
          headline: profileDraft.headline.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save profile.')
      setProfiles((p) =>
        p.some((x) => x.id === data.profile.id)
          ? p.map((x) => (x.id === data.profile.id ? data.profile : x))
          : [...p, data.profile],
      )
      setProfileDraft(null)
      setExpanded(data.profile.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile.')
    } finally {
      setSaving(null)
    }
  }

  async function uploadCv(profileId: string, file: File) {
    setCvBusyFor(profileId)
    setError(null)
    try {
      const form = new FormData()
      form.set('file', file)
      const res = await fetch(`/api/profiles/${profileId}/cv?admin=1`, {
        method: 'POST',
        body: form,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed.')
      setProfiles((p) => p.map((x) => (x.id === profileId ? data.profile : x)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setCvBusyFor(null)
    }
  }

  async function deleteProfile(profileId: string) {
    setDeletingId(profileId)
    setError(null)
    try {
      const res = await fetch(`/api/profiles/${profileId}?admin=1`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'Failed to delete profile.')
      }
      setProfiles((p) => p.filter((x) => x.id !== profileId))
      setProofsByProfile((m) => {
        const next = { ...m }
        delete next[profileId]
        return next
      })
      if (expanded === profileId) setExpanded(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete profile.')
    } finally {
      setDeletingId(null)
    }
  }

  async function saveProof() {
    if (!proofDraft) return
    if (!proofDraft.projectSummary.trim()) {
      setError('A proof item needs a project summary.')
      return
    }
    setSaving('proof')
    setError(null)
    try {
      const res = await fetch('/api/proofs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin: true,
          id: proofDraft.id,
          profileId: proofDraft.profileId,
          projectSummary: proofDraft.projectSummary.trim(),
          reviewQuote: proofDraft.reviewQuote.trim() || null,
          permissionOnFile: proofDraft.permissionOnFile,
          clientName: proofDraft.permissionOnFile ? proofDraft.clientName.trim() : null,
          tags: proofDraft.tags,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save proof item.')
      setProofsByProfile((m) => {
        const existing = m[proofDraft.profileId] ?? []
        const withoutOld = existing.filter((x) => x.id !== data.item.id)
        return { ...m, [proofDraft.profileId]: [data.item, ...withoutOld] }
      })
      setProofDraft(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save proof item.')
    } finally {
      setSaving(null)
    }
  }

  async function deleteProof(profileId: string, itemId: string) {
    setError(null)
    try {
      const res = await fetch(`/api/proofs/${itemId}?admin=1`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'Failed to delete proof item.')
      }
      setProofsByProfile((m) => ({
        ...m,
        [profileId]: (m[profileId] ?? []).filter((x) => x.id !== itemId),
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete proof item.')
    }
  }

  function confirmDelete() {
    if (!pendingDelete) return
    const target = pendingDelete
    setPendingDelete(null)
    if (target.kind === 'profile') void deleteProfile(target.profileId)
    else void deleteProof(target.profileId, target.itemId)
  }

  const repsWithProfiles = initialReps
    .filter((r) => r.role !== 'sourcer')
    .map((rep) => ({
      rep,
      profiles: profiles.filter((p) => p.repId === rep.id),
    }))

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-heading text-2xl text-ink sm:text-3xl">
          Manage Profiles
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate">
          {isAdmin
            ? 'Every rep’s identities and proof items in one place. Real client names, CVs, and project history are shared business data, edited here deliberately rather than by whoever is logged in.'
            : 'A read-only view of every rep’s identities and proof items, for reference. Only an admin can add, edit, or remove this data.'}
        </p>
      </header>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Something failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-6">
        {repsWithProfiles.map(({ rep, profiles: repProfiles }) => (
          <section key={rep.id} className="rounded-2xl border border-line/60 bg-surface-raised">
            <div className="flex items-center justify-between gap-3 border-b border-line bg-paper-tint/40 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink">{rep.name}</span>
                <span className="rounded-md bg-paper-tint px-2 py-0.5 font-mono text-xs text-slate">
                  {rep.role}
                </span>
              </div>
              {isAdmin ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setError(null)
                    setProfileDraft(emptyProfileDraft(rep.id))
                  }}
                >
                  Add identity
                </Button>
              ) : null}
            </div>

            <div>
              {repProfiles.length === 0 ? (
                <div className="p-4 text-sm leading-relaxed text-slate">
                  No profiles yet.
                  {rep.name === 'Fizza' ? (
                    <span className="mt-1 block font-medium text-status-research">
                      Fizza still has no project history in anything provided. Her profile
                      URL, headline, CV, and proof items need to be added here once the real
                      information is available.
                    </span>
                  ) : null}
                </div>
              ) : (
                <div className="divide-y divide-line">
                {repProfiles.map((p) => (
                  <ProfileCard
                    key={p.id}
                    profile={p}
                    proofs={proofsByProfile[p.id] ?? []}
                    expanded={expanded === p.id}
                    deleting={deletingId === p.id}
                    cvBusy={cvBusyFor === p.id}
                    isAdmin={isAdmin}
                    canViewCv={isAdmin || p.repId === currentRepId}
                    onToggle={() => void openProfile(p.id)}
                    onEdit={() =>
                      setProfileDraft({
                        repId: rep.id,
                        id: p.id,
                        platform: p.platform,
                        label: p.label ?? '',
                        profileUrl: p.profileUrl ?? '',
                        headline: p.headline ?? '',
                      })
                    }
                    onDelete={() => setPendingDelete({ kind: 'profile', profileId: p.id })}
                    onProofStart={() => setProofDraft(emptyProofDraft(p.id))}
                    onEditProof={(item) =>
                      setProofDraft({
                        profileId: p.id,
                        id: item.id,
                        projectSummary: item.projectSummary,
                        reviewQuote: item.reviewQuote ?? '',
                        permissionOnFile: item.permissionOnFile,
                        clientName: item.clientName ?? '',
                        tags: item.tags,
                      })
                    }
                    onDeleteProof={(itemId) =>
                      setPendingDelete({ kind: 'proof', profileId: p.id, itemId })
                    }
                    onCvFile={(file) => void uploadCv(p.id, file)}
                  />
                ))}
                </div>
              )}
            </div>
          </section>
        ))}
      </div>

      {isAdmin && profileDraft ? (
        <section className="rounded-2xl border border-line/60 bg-surface-raised p-5">
          <h2 className="text-sm font-medium text-ink">
            {profileDraft.id ? 'Edit identity' : 'New identity'}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Platform</Label>
              <Select
                value={profileDraft.platform}
                onChange={(e) =>
                  setProfileDraft({ ...profileDraft, platform: e.target.value as Platform })
                }
              >
                <option value="linkedin">LinkedIn</option>
                <option value="upwork">Upwork</option>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Label</Label>
              <Input
                value={profileDraft.label}
                onChange={(e) => setProfileDraft({ ...profileDraft, label: e.target.value })}
                placeholder="Hassan Raza"
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Profile URL</Label>
              <Input
                value={profileDraft.profileUrl}
                onChange={(e) => setProfileDraft({ ...profileDraft, profileUrl: e.target.value })}
                placeholder="https://linkedin.com/in/..."
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Headline (as it appears on the platform)</Label>
              <Input
                value={profileDraft.headline}
                onChange={(e) => setProfileDraft({ ...profileDraft, headline: e.target.value })}
                placeholder="Senior full-stack engineer at Scout"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end gap-3">
            <Button variant="outline" onClick={() => setProfileDraft(null)}>
              Cancel
            </Button>
            <Button
              variant="gold"
              onClick={() => void saveProfile()}
              disabled={saving === 'profile'}
            >
              {saving === 'profile' ? 'Saving...' : 'Save identity'}
            </Button>
          </div>
        </section>
      ) : null}

      {isAdmin && proofDraft ? (
        <ProofForm
          draft={proofDraft}
          saving={saving === 'proof'}
          onChange={setProofDraft}
          onCancel={() => setProofDraft(null)}
          onSave={() => void saveProof()}
        />
      ) : null}

      {isAdmin ? (
        <Dialog
          open={Boolean(pendingDelete)}
          onClose={() => setPendingDelete(null)}
          title={pendingDelete?.kind === 'profile' ? 'Delete this identity?' : 'Delete this proof item?'}
          description={
            pendingDelete?.kind === 'profile'
              ? 'This removes the profile and every proof item attached to it. It cannot be undone.'
              : 'The project will no longer be matchable to leads. It cannot be undone.'
          }
        >
          <DialogActions>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      ) : null}
    </div>
  )
}

function ProfileCard({
  profile,
  proofs,
  expanded,
  deleting,
  cvBusy,
  isAdmin,
  canViewCv,
  onToggle,
  onEdit,
  onDelete,
  onProofStart,
  onEditProof,
  onDeleteProof,
  onCvFile,
}: {
  profile: Profile
  proofs: ProofItem[]
  expanded: boolean
  deleting: boolean
  cvBusy: boolean
  isAdmin: boolean
  canViewCv: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onProofStart: () => void
  onEditProof: (item: ProofItem) => void
  onDeleteProof: (itemId: string) => void
  onCvFile: (file: File) => void
}) {
  const [cvUrl, setCvUrl] = useState<string | null>(null)
  const [cvLoading, setCvLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  async function openCv() {
    if (cvUrl) {
      window.open(cvUrl, '_blank', 'noopener,noreferrer')
      return
    }
    if (cvLoading || cvBusy) return
    setCvLoading(true)
    try {
      const params = isAdmin ? '?admin=1' : ''
      const res = await fetch(`/api/profiles/${profile.id}/cv${params}`)
      const data = await res.json()
      if (data.signedUrl) {
        setCvUrl(data.signedUrl)
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
      }
    } catch {
      setCvUrl(null)
    } finally {
      setCvLoading(false)
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'rounded-md px-2 py-1 font-mono text-xs',
              profile.platform === 'linkedin' ? 'bg-[color-mix(in_oklch,#0a66c2_10%,transparent)] text-[#0a66c2]' : 'bg-[color-mix(in_oklch,#14a800_10%,transparent)] text-[#14a800]',
            )}
          >
            {profile.platform}
          </span>
          <div>
            <div className="text-sm font-medium text-ink">
              {profile.label ?? profile.headline ?? 'Unnamed profile'}
            </div>
            {profile.headline ? <div className="text-xs text-slate">{profile.headline}</div> : null}
            {profile.profileUrl ? (
              <a
                href={profile.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gold hover:underline"
              >
                {profile.profileUrl}
              </a>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {profile.cvPath && canViewCv ? (
            <Button variant="outline" size="sm" onClick={() => void openCv()} disabled={cvLoading || cvBusy}>
              {cvLoading ? 'Opening...' : 'View CV'}
            </Button>
          ) : null}
          {isAdmin ? (
            <>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) onCvFile(file)
                }}
              />
              <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={cvBusy}>
                {cvBusy ? 'Uploading...' : profile.cvPath ? 'Replace CV' : 'Add CV'}
              </Button>
              <Button variant="outline" size="sm" onClick={onEdit}>
                Edit
              </Button>
            </>
          ) : null}
          <Button variant="outline" size="sm" onClick={onToggle}>
            {expanded ? 'Hide proof' : `Proof (${proofs.length})`}
          </Button>
          {isAdmin ? (
            <Button
              variant="outline"
              size="sm"
              className="text-status-no hover:border-status-no/40"
              onClick={onDelete}
              disabled={deleting}
            >
              Delete
            </Button>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className="space-y-4 border-t border-line p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-ink">Proof items</h3>
            {isAdmin ? (
              <Button variant="gold" size="sm" onClick={onProofStart}>
                Add proof
              </Button>
            ) : null}
          </div>

          {proofs.length === 0 ? (
            <p className="text-sm text-slate">No proof items yet.</p>
          ) : (
            <ul className="space-y-2">
              {proofs.map((item) => (
                <li key={item.id} className="rounded-md border border-line p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm leading-relaxed text-ink">
                        {item.permissionOnFile && item.clientName ? item.clientName : 'Client protected'}
                        {item.reviewQuote ? (
                          <span className="block text-slate">&ldquo;{item.reviewQuote}&rdquo;</span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-slate">{item.projectSummary}</p>
                    </div>
                    {isAdmin ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => onEditProof(item)}>
                          Edit
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => onDeleteProof(item.id)}>
                          Remove
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {item.tags.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.tags.map((t) => (
                        <span key={t} className="rounded-md bg-paper-tint px-2 py-0.5 font-mono text-xs text-ink">
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  )
}

function ProofForm({
  draft,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  draft: ProofDraft
  saving: boolean
  onChange: (d: ProofDraft) => void
  onCancel: () => void
  onSave: () => void
}) {
  const [tagInput, setTagInput] = useState('')
  const permission = draft.permissionOnFile

  return (
    <section className="rounded-2xl border border-line/60 bg-surface-raised p-5">
      <h2 className="text-sm font-medium text-ink">{draft.id ? 'Edit proof item' : 'New proof item'}</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate">
        Tags are what match this project to leads. Leave them blank and a single cheap
        classification call will suggest them once, cached forever on the row.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label>Project summary</Label>
          <Textarea
            rows={3}
            value={draft.projectSummary}
            onChange={(e) => onChange({ ...draft, projectSummary: e.target.value })}
            placeholder="Trading dashboard for a fintech team: 4x faster decisioning, 60k users..."
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label>Review quote (optional, their words)</Label>
          <Input
            value={draft.reviewQuote}
            onChange={(e) => onChange({ ...draft, reviewQuote: e.target.value })}
            placeholder="e.g. Took over a stalled dashboard and shipped the compliance module."
          />
        </div>
        <label className="flex items-start gap-2.5 rounded-lg border border-line p-3 sm:col-span-2">
          <input
            type="checkbox"
            checked={permission}
            onChange={(e) => onChange({ ...draft, permissionOnFile: e.target.checked })}
            className="mt-0.5 size-4 accent-gold"
          />
          <span className="text-sm leading-relaxed text-ink">
            Permission to name the client is on file.
            <span className="block text-xs text-slate">
              This unlocks the client-name field. Without it the draft describes the project by
              shape and never prints a name, in code, server-side.
            </span>
          </span>
        </label>
        {permission ? (
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Client name</Label>
            <Input
              value={draft.clientName}
              onChange={(e) => onChange({ ...draft, clientName: e.target.value })}
              placeholder="Acme Industries"
            />
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg bg-paper-tint px-3 py-2 text-xs text-slate sm:col-span-2">
            Client name field stays locked until permission is confirmed.
          </div>
        )}
        <div className="grid gap-1.5 sm:col-span-2">
          <Label>Tags (comma or newline separated)</Label>
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onBlur={() => {
              const parsed = parseTags(tagInput)
              if (parsed.length > 0) {
                onChange({ ...draft, tags: [...draft.tags, ...parsed] })
                setTagInput('')
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const parsed = parseTags(tagInput)
                if (parsed.length > 0) {
                  onChange({ ...draft, tags: [...draft.tags, ...parsed] })
                  setTagInput('')
                }
              }
            }}
            placeholder="react, fintech, dashboards"
          />
          {draft.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {draft.tags.map((t) => (
                <span
                  key={t}
                  className="flex items-center gap-1 rounded-md bg-paper-tint px-2 py-0.5 font-mono text-xs text-ink"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => onChange({ ...draft, tags: draft.tags.filter((x) => x !== t) })}
                    className="text-slate hover:text-ink"
                    aria-label={`Remove tag ${t}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end gap-3">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="gold"
          onClick={onSave}
          disabled={saving || !draft.projectSummary.trim()}
        >
          {saving ? 'Saving...' : 'Save proof'}
        </Button>
      </div>
    </section>
  )
}
