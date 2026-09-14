'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogActions } from '@/components/ui/dialog'
import { Plus, ChevronDown, ChevronRight, FileText, Trash2, Upload, Lock } from 'lucide-react'
import { cn } from 'cn'
import type { Profile, ProofItem } from '@/lib/domain/types'

type Platform = 'linkedin' | 'upwork'

interface ProfileDraft {
  platform: Platform
  label: string
  profileUrl: string
  headline: string
}

const INITIAL_PROFILE: ProfileDraft = {
  platform: 'linkedin',
  label: '',
  profileUrl: '',
  headline: '',
}

interface ProofDraft {
  profileId: string
  projectSummary: string
  reviewQuote: string
  permissionOnFile: boolean
  clientName: string
  tags: string[]
}

const INITIAL_PROOF: ProofDraft = {
  profileId: '',
  projectSummary: '',
  reviewQuote: '',
  permissionOnFile: false,
  clientName: '',
  tags: [],
}

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

const PLATFORM_STYLE: Record<Platform, { bg: string; text: string }> = {
  linkedin: { bg: 'bg-[color-mix(in_oklch,#0a66c2_10%,transparent)]', text: 'text-[#0a66c2]' },
  upwork: { bg: 'bg-[color-mix(in_oklch,#14a800_10%,transparent)]', text: 'text-[#14a800]' },
}

export function ProfilesManager({ initialProfiles }: { initialProfiles: Profile[] }) {
  const [profiles, setProfiles] = useState<Profile[]>(initialProfiles)
  const [proofsByProfile, setProofsByProfile] = useState<
    Record<string, ProofItem[]>
  >({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [profileDraft, setProfileDraft] = useState<ProfileDraft | null>(null)
  const [proofDraft, setProofDraft] = useState<ProofDraft | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cvBusy, setCvBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<
    { kind: 'profile'; profileId: string } | { kind: 'proof'; profileId: string; itemId: string } | null
  >(null)
  const cvInputRef = useRef<HTMLInputElement | null>(null)

  async function loadProofs(profileId: string) {
    if (proofsByProfile[profileId]) return
    const res = await fetch(`/api/proofs?profileId=${encodeURIComponent(profileId)}`)
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
      const items = proofsByProfile[data.profile.id]
      setProofsByProfile((m) => ({ ...m, [data.profile.id]: items ?? [] }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile.')
    } finally {
      setSaving(null)
    }
  }

  async function uploadCv(profileId: string, file: File) {
    setCvBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.set('file', file)
      const res = await fetch(`/api/profiles/${profileId}/cv`, {
        method: 'POST',
        body: form,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed.')
      setProfiles((p) =>
        p.map((x) => (x.id === profileId ? data.profile : x)),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setCvBusy(false)
      if (cvInputRef.current) cvInputRef.current.value = ''
    }
  }

  async function deleteProfile(profileId: string) {
    setDeletingId(profileId)
    setError(null)
    try {
      const res = await fetch(`/api/profiles/${profileId}`, { method: 'DELETE' })
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
          profileId: proofDraft.profileId,
          projectSummary: proofDraft.projectSummary.trim(),
          reviewQuote: proofDraft.reviewQuote.trim() || null,
          permissionOnFile: proofDraft.permissionOnFile,
          clientName: proofDraft.permissionOnFile
            ? proofDraft.clientName.trim()
            : null,
          tags: proofDraft.tags,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save proof item.')
      setProofsByProfile((m) => ({
        ...m,
        [proofDraft.profileId]: [
          data.item,
          ...(m[proofDraft.profileId] ?? []),
        ],
      }))
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
      const res = await fetch(`/api/proofs/${itemId}`, { method: 'DELETE' })
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

  return (
    <div className="space-y-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Something failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {profiles.length === 0 && !profileDraft ? (
        <div className="rounded-2xl border border-dashed border-line bg-paper/50 py-10 text-center">
          <p className="text-sm text-slate">
            No profiles yet. Add the LinkedIn and Upwork identities you write from.
          </p>
        </div>
      ) : null}

      <div className="space-y-3">
        {profiles.map((p, i) => (
          <ProfileCard
            key={p.id}
            profile={p}
            proofs={proofsByProfile[p.id] ?? []}
            expanded={expanded === p.id}
            deleting={deletingId === p.id}
            cvBusy={cvBusy}
            onToggle={() => void openProfile(p.id)}
            onDelete={() => setPendingDelete({ kind: 'profile', profileId: p.id })}
            onProofStart={() =>
              setProofDraft({
                ...INITIAL_PROOF,
                profileId: p.id,
              })
            }
            onDeleteProof={(itemId) =>
              setPendingDelete({ kind: 'proof', profileId: p.id, itemId })
            }
            onCvFile={(file) => void uploadCv(p.id, file)}
            index={i}
          />
        ))}
      </div>

      {!profileDraft ? (
            <Button variant="outline" onClick={() => { setError(null); setProfileDraft({ ...INITIAL_PROFILE }) }}>
              <Plus className="mr-1.5 size-3.5" aria-hidden="true" />
              Add an identity
            </Button>
      ) : (
        <section className="reveal-up rounded-2xl border border-line bg-paper p-6 card-elevated">
          <h2 className="text-heading text-base text-ink">New identity</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Platform</Label>
              <Select
                value={profileDraft.platform}
                onChange={(e) =>
                  setProfileDraft({
                    ...profileDraft,
                    platform: e.target.value as Platform,
                  })
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
                onChange={(e) =>
                  setProfileDraft({ ...profileDraft, label: e.target.value })
                }
                placeholder="Hassan Raza"
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Profile URL</Label>
              <Input
                value={profileDraft.profileUrl}
                onChange={(e) =>
                  setProfileDraft({ ...profileDraft, profileUrl: e.target.value })
                }
                placeholder="https://linkedin.com/in/..."
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Headline (as it appears on the platform)</Label>
              <Input
                value={profileDraft.headline}
                onChange={(e) =>
                  setProfileDraft({ ...profileDraft, headline: e.target.value })
                }
                placeholder="Senior full-stack engineer at Scout"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end gap-3">
            <Button variant="outline" onClick={() => setProfileDraft(null)}>
              Cancel
            </Button>
            <Button
              variant="orange"
              onClick={() => void saveProfile()}
              disabled={saving === 'profile'}
            >
              {saving === 'profile' ? 'Saving...' : 'Save identity'}
            </Button>
          </div>
        </section>
      )}

      {proofDraft ? (
        <ProofForm
          draft={proofDraft}
          saving={saving === 'proof'}
          onChange={setProofDraft}
          onCancel={() => setProofDraft(null)}
          onSave={() => void saveProof()}
        />
      ) : null}

      <Dialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title={
          pendingDelete?.kind === 'profile'
            ? 'Delete this identity?'
            : 'Delete this proof item?'
        }
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
    </div>
  )
}

function ProfileCard({
  profile,
  proofs,
  expanded,
  deleting,
  cvBusy,
  onToggle,
  onDelete,
  onProofStart,
  onDeleteProof,
  onCvFile,
  index,
}: {
  profile: Profile
  proofs: ProofItem[]
  expanded: boolean
  deleting: boolean
  cvBusy: boolean
  onToggle: () => void
  onDelete: () => void
  onProofStart: () => void
  onDeleteProof: (itemId: string) => void
  onCvFile: (file: File) => void
  index: number
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
      const res = await fetch(`/api/profiles/${profile.id}/cv`)
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

  const platformStyle = PLATFORM_STYLE[profile.platform]

  return (
    <section
      className="slide-in-right overflow-hidden rounded-2xl border border-line bg-paper transition-shadow duration-300 hover:shadow-[0_2px_12px_-4px_color-mix(in_srgb,var(--ink)_8%,transparent)]"
      style={{ animationDelay: `${0.05 + index * 0.04}s` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex size-8 items-center justify-center rounded-lg font-mono text-xs font-medium',
              platformStyle.bg,
              platformStyle.text,
            )}
          >
            {profile.platform === 'linkedin' ? 'in' : 'uw'}
          </span>
          <div>
            <div className="text-sm font-medium text-ink">
              {profile.label ?? profile.headline ?? 'Unnamed profile'}
            </div>
            {profile.headline ? (
              <div className="text-xs text-slate">{profile.headline}</div>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {profile.cvPath ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void openCv()}
              disabled={cvLoading || cvBusy}
            >
              <FileText className="mr-1 size-3" />
              {cvLoading ? 'Opening...' : 'CV'}
            </Button>
          ) : null}
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={cvBusy}
          >
            <Upload className="mr-1 size-3" />
            {cvBusy ? '...' : profile.cvPath ? 'Replace' : 'Add CV'}
          </Button>
          <Button variant="outline" size="sm" onClick={onToggle}>
            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            Proof ({proofs.length})
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-status-danger hover:border-status-danger/40 hover:bg-status-danger/5"
            onClick={onDelete}
            disabled={deleting}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-line bg-bone/20 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-heading text-sm text-ink">Proof items</h3>
            <Button variant="orange" size="sm" onClick={onProofStart}>
              <Plus className="mr-1 size-3" aria-hidden="true" />
              Add proof
            </Button>
          </div>

          {proofs.length === 0 ? (
            <p className="mt-3 text-sm text-slate">
              No proof items yet. Add the projects this identity can honestly cite.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {proofs.map((item) => (
                <li key={item.id} className="rounded-xl border border-line bg-paper p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm leading-relaxed text-ink">
                        {item.permissionOnFile && item.clientName
                          ? item.clientName
                          : 'Client protected'}
                        {item.reviewQuote ? (
                          <span className="mt-0.5 block text-xs italic text-slate">
                            &ldquo;{item.reviewQuote}&rdquo;
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate">
                        {item.projectSummary}
                      </p>
                    </div>
                    <button
                      onClick={() => onDeleteProof(item.id)}
                      className="flex size-7 shrink-0 items-center justify-center rounded-lg text-slate transition-colors hover:bg-status-danger/10 hover:text-status-danger"
                      aria-label="Remove proof"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                  {item.tags.length > 0 ? (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {item.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-md bg-bone px-2 py-0.5 font-mono text-[11px] text-ink"
                        >
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
    <section className="reveal-up rounded-2xl border border-line bg-paper p-6 card-elevated">
      <h2 className="text-base font-medium text-ink">New proof item</h2>
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
        <label className="flex items-start gap-2.5 rounded-xl border border-line p-3.5 sm:col-span-2">
          <input
            type="checkbox"
            checked={permission}
            onChange={(e) =>
              onChange({ ...draft, permissionOnFile: e.target.checked })
            }
            className="mt-0.5 size-4 accent-gold"
          />
          <span className="text-sm leading-relaxed text-ink">
            Permission to name the client is on file.
            <span className="block text-xs text-slate">
              This unlocks the client-name field. Without it the draft describes
              the project by shape and never prints a name, in code, server-side.
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
          <div className="flex items-center gap-2 rounded-xl bg-bone/60 px-3 py-2.5 text-xs text-slate sm:col-span-2">
            <Lock className="size-3 shrink-0" />
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
                  className="flex items-center gap-1 rounded-md bg-bone px-2 py-0.5 font-mono text-xs text-ink"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() =>
                      onChange({ ...draft, tags: draft.tags.filter((x) => x !== t) })
                    }
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
          variant="orange"
          onClick={onSave}
          disabled={saving || !draft.projectSummary.trim()}
        >
          {saving ? 'Saving...' : 'Save proof'}
        </Button>
      </div>
    </section>
  )
}
