'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from 'cn'
import { V4Panel } from '@/components/v4/primitives'
import { UploadBatchUploader } from '@/components/profile-intelligence/upload-batch'
import { activityLabel, defaultTargetsForChannel } from '@/lib/accountability/default-targets'
import { ChannelBadge } from '@/components/ui/channel-badge'
import { channelLabel, normalizeChannel } from '@/lib/profiles/channel'
import { pollBatch } from '@/lib/profile-intelligence/batch-poller'

type Step = 'source' | 'review' | 'channels' | 'assign' | 'targets' | 'ready'

interface RepOption {
  id: string
  name: string
  profiles: string[]
}

interface ChannelState {
  channel: 'linkedin' | 'upwork'
  enabled: boolean
  identityName: string
  title: string
}

interface OnboardingResult {
  status: 'ready' | 'partial' | 'failed'
  profileId: string | null
  identities: Array<{ id: string; channel: string; identityName: string }>
  assignments: Array<{ repId: string; identityId: string }>
  failed: 'profile' | 'identities' | 'assign' | null
  errors: string[]
}

const STEPS: Array<{ key: Step; label: string }> = [
  { key: 'source', label: 'Person' },
  { key: 'review', label: 'Knowledge' },
  { key: 'channels', label: 'Channels' },
  { key: 'assign', label: 'Assignment' },
  { key: 'targets', label: 'Targets' },
  { key: 'ready', label: 'Review' },
]

/**
 * Channel-aware target templates. The canonical pack in
 * `lib/accountability/default-targets` is the single authority — this only
 * shapes it for the form, so a new profile can never seed a stale pack.
 */
function channelTargets(channel: string | null | undefined): Array<{ activityType: string; label: string; default: number }> {
  return defaultTargetsForChannel(normalizeChannel(channel)).map((row) => ({
    activityType: row.activityType,
    label: activityLabel(row.activityType),
    default: row.targetCount,
  }))
}

interface ReviewField {
  label: string
  value: string
  state: 'extracted' | 'missing'
}

export function AddProfileWizard({
  reps,
  existingPeople = [],
  onClose,
}: {
  reps: RepOption[]
  /** Canonical people already in the directory — used only to warn on duplicates. */
  existingPeople?: Array<{ key: string; name: string }>
  onClose: () => void
}) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('source')
  const [source, setSource] = useState<'paste' | 'upload'>('paste')
  const [fullName, setFullName] = useState('')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [skills, setSkills] = useState('')
  const [profileUrl, setProfileUrl] = useState('')
  const [profileId, setProfileId] = useState<string | null>(null)
  const [review, setReview] = useState<ReviewField[]>([])
  const [channels, setChannels] = useState<ChannelState[]>([
    { channel: 'linkedin', enabled: true, identityName: '', title: '' },
    { channel: 'upwork', enabled: false, identityName: '', title: '' },
  ])
  const [repId, setRepId] = useState('')
  const [saving, setSaving] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<OnboardingResult | null>(null)
  const [targets, setTargets] = useState<Record<string, Record<string, number>>>({})
  const [error, setError] = useState<string | null>(null)

  const selectedChannels = channels.filter((channel) => channel.enabled)
  const selectedRep = reps.find((rep) => rep.id === repId)

  function buildReview(fields: {
    fullName?: string
    title?: string
    summary?: string
    skills?: string[]
    profileUrl?: string
  }): ReviewField[] {
    const list: ReviewField[] = [
      { label: 'Name', value: fields.fullName ?? '', state: fields.fullName ? 'extracted' : 'missing' },
      { label: 'Title', value: fields.title ?? '', state: fields.title ? 'extracted' : 'missing' },
      { label: 'Summary', value: fields.summary ?? '', state: fields.summary ? 'extracted' : 'missing' },
      { label: 'Skills', value: (fields.skills ?? []).join(', '), state: (fields.skills ?? []).length > 0 ? 'extracted' : 'missing' },
      { label: 'Profile URL', value: fields.profileUrl ?? '', state: fields.profileUrl ? 'extracted' : 'missing' },
    ]
    return list
  }

  function handleBatchCreated() {
    // The uploader only creates the batch; processing is started explicitly.
  }

  async function processUpload(batchId: string) {
    setProcessing(true)
    setError(null)
    const end = await pollBatch({
      step: async () => {
        const res = await fetch(`/api/profile-intelligence/batch/${batchId}/process`, { method: 'POST' })
        const body = await res.json().catch(() => null)
        return { ok: res.ok, status: res.status, body }
      },
    })
    if (end.kind !== 'done') {
      setError(end.kind === 'cancelled' ? 'Processing cancelled.' : end.message)
      setProcessing(false)
      return
    }
    try {
      const res = await fetch(`/api/profile-intelligence/batch/${batchId}`)
      const data = await res.json()
      const source = (data.sources ?? []).find((item: { profile_id?: string }) => item.profile_id)
      if (!source?.profile_id) {
        setError('The document was processed, but no profile was created.')
        setProcessing(false)
        return
      }
      const profileRes = await fetch(`/api/profile-intelligence/profiles/${source.profile_id}`)
      const profile = await profileRes.json()
      setProfileId(source.profile_id)
      const profileData = profile?.profile ?? profile ?? {}
      setFullName(profileData.fullName ?? profileData.full_name ?? profileData.displayName ?? '')
      setTitle(profileData.currentRole ?? profileData.current_role ?? profileData.title ?? '')
      setSummary(profileData.professionalSummary ?? profileData.professional_summary ?? '')
      setSkills((profileData.primarySkills ?? profileData.primary_skills ?? []).join(', '))
      setProfileUrl(profileData.profileUrl ?? profileData.profile_url ?? '')
      setReview(
        buildReview({
          fullName: profileData.fullName ?? profileData.full_name ?? profileData.displayName ?? '',
          title: profileData.currentRole ?? profileData.current_role ?? '',
          summary: profileData.professionalSummary ?? profileData.professional_summary ?? '',
          skills: profileData.primarySkills ?? profileData.primary_skills ?? [],
          profileUrl: profileData.profileUrl ?? profileData.profile_url ?? '',
        }),
      )
      setStep('review')
    } catch {
      setError('Could not read the created profile.')
    }
    setProcessing(false)
  }

  async function handleSave() {
    if (selectedChannels.length === 0) {
      setError('Select at least one channel.')
      return
    }
    if (!repId) {
      setError('Select a rep to assign this profile to.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/team/profile-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          profile: {
            fullName: fullName || undefined,
            title: title || undefined,
            summary: summary || undefined,
            skills: skills.split(',').map((skill) => skill.trim()).filter(Boolean),
            profileUrl: profileUrl || undefined,
          },
          channels: selectedChannels.map((channel) => ({
            channel: channel.channel,
            identityName: channel.identityName.trim() || fullName || channel.channel,
            title: channel.title || undefined,
          })),
          repId,
        }),
      })
      const data: OnboardingResult = await res.json()
      if (!res.ok && !data.status) {
        setError((data as { error?: string }).error ?? 'Could not save the profile.')
        setSaving(false)
        return
      }
      setResult(data)
      // Targets are channel-aware and need the created identity ids, so they are
      // captured after the profile + channels exist.
      setStep('targets')
    } catch {
      setError('Could not save the profile. Check your connection and try again.')
    }
    setSaving(false)
  }

  /** Persist the channel-aware target template. Failures never strand the person. */
  async function saveTargets() {
    if (!result?.identities?.length || !repId) {
      setStep('ready')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const requests: Array<Promise<unknown>> = []
      for (const identity of result.identities) {
        for (const item of channelTargets(identity.channel)) {
          const count = targets[identity.id]?.[item.activityType] ?? item.default
          if (count <= 0) continue
          requests.push(
            fetch('/api/admin/targets', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                repId,
                revenueIdentityId: identity.id,
                activityType: item.activityType,
                targetCount: count,
              }),
            }),
          )
        }
      }
      await Promise.all(requests)
      setStep('ready')
      router.refresh()
    } catch {
      setError('The profile was created, but some targets could not be saved. Edit them from Team → Profiles.')
      setStep('ready')
    } finally {
      setSaving(false)
    }
  }

  const stepIndex = STEPS.findIndex((item) => item.key === step)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm">
      <V4Panel className="my-8 w-full max-w-2xl" innerClassName="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.18em] text-stone">Add profile</p>
            <h2 className="mt-1 text-[20px] font-medium tracking-[-0.01em] text-ink">
              {step === 'ready' ? 'Profile ready' : 'Create a sending profile'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-2.5 py-1 text-[12px] font-medium text-graphite transition-colors hover:bg-bone hover:text-ink"
          >
            Close
          </button>
        </div>

        <ol className="mt-5 flex flex-wrap gap-1.5" aria-label="Progress">
          {STEPS.map((item, index) => (
            <li
              key={item.key}
              className={cn(
                'rounded-full px-2.5 py-1 text-[10px] font-medium ring-1',
                index === stepIndex
                  ? 'bg-solid text-on-solid ring-solid'
                  : index < stepIndex
                    ? 'bg-bone text-ink ring-line'
                    : 'bg-bone text-stone ring-line',
              )}
              aria-current={index === stepIndex ? 'step' : undefined}
            >
              {index + 1}. {item.label}
            </li>
          ))}
        </ol>

        {error && (
          <div role="alert" className="mt-4 rounded-xl border border-status-danger/30 bg-status-danger/5 px-4 py-3 text-[12px] text-graphite">
            {error}
          </div>
        )}

        {step === 'source' && (
          <div className="mt-5 space-y-4">
            <div className="flex gap-1.5">
              {(['paste', 'upload'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setSource(tab)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-[12px] font-medium ring-1 transition-colors',
                    source === tab ? 'bg-solid text-on-solid ring-solid' : 'bg-bone text-graphite ring-line hover:text-ink',
                  )}
                >
                  {tab === 'paste' ? 'Paste information' : 'Upload a CV'}
                </button>
              ))}
            </div>

            {source === 'paste' ? (
              <div className="space-y-3">
                <Field label="Name" value={fullName} onChange={setFullName} placeholder="Hassan Saulat" />
                <Field label="Title" value={title} onChange={setTitle} placeholder="Senior Engineer" />
                <Field label="Summary" value={summary} onChange={setSummary} placeholder="Short professional summary" multiline />
                <Field label="Skills" value={skills} onChange={setSkills} placeholder="React, Node, Postgres" hint="Separate with commas." />
                <Field label="Profile URL" value={profileUrl} onChange={setProfileUrl} placeholder="https://linkedin.com/in/…" />
              </div>
            ) : (
              <div className="space-y-3">
                <UploadBatchUploader
                  orgId={''}
                  isAdmin
                  onBatchCreated={(batch) => {
                    handleBatchCreated()
                    void processUpload(batch.id)
                  }}
                />
                <p className="text-[11px] text-stone">
                  {processing ? 'Processing the document…' : 'The document is processed before review.'}
                </p>
              </div>
            )}

            {fullName.trim() && existingPeople.some((person) => person.name.trim().toLowerCase() === fullName.trim().toLowerCase()) && (
              <div role="alert" className="rounded-xl border border-status-warning/30 bg-status-warning/5 px-4 py-3">
                <p className="text-[13px] font-medium text-ink">
                  {existingPeople.find((person) => person.name.trim().toLowerCase() === fullName.trim().toLowerCase())?.name}{' '}
                  already exists
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Link
                    href={`/team/profiles/${existingPeople.find((person) => person.name.trim().toLowerCase() === fullName.trim().toLowerCase())?.key}`}
                    className="rounded-lg border border-line bg-bone-raised px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-bone"
                  >
                    Open existing profile
                  </Link>
                  <span className="text-[12px] text-graphite">
                    Continue only to create a separate person. Relay never merges silently.
                  </span>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setReview(buildReview({ fullName, title, summary, skills: skills.split(',').map((s) => s.trim()).filter(Boolean), profileUrl }))
                  setStep('review')
                }}
                className="rounded-lg bg-solid px-4 py-2 text-[13px] font-medium text-on-solid transition-transform active:scale-[0.98]"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="mt-5 space-y-4">
            <div className="overflow-hidden rounded-xl ring-1 ring-line">
              <ul className="divide-y divide-line/70">
                {review.map((field) => (
                  <li key={field.label} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                    <span className="text-[12px] text-graphite">{field.label}</span>
                    <span className={cn('text-[12px] text-right', field.state === 'missing' ? 'text-stone' : 'text-ink')}>
                      {field.state === 'missing' ? 'Not stated' : field.value}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-[11px] text-stone">
              Missing facts stay missing — Relay never invents them. You can edit the source and reprocess.
            </p>
            <div className="flex justify-between">
              <button type="button" onClick={() => setStep('source')} className="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-graphite hover:text-ink">
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  setChannels((prev) =>
                    prev.map((channel) => ({
                      ...channel,
                      identityName: channel.identityName || fullName || channel.channel,
                      title: channel.title || title,
                    })),
                  )
                  setStep('channels')
                }}
                className="rounded-lg bg-solid px-4 py-2 text-[13px] font-medium text-on-solid transition-transform active:scale-[0.98]"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 'channels' && (
          <div className="mt-5 space-y-4">
            <p className="text-[13px] text-graphite">Where will this profile be used?</p>
            <div className="space-y-2">
              {channels.map((channel) => (
                <div key={channel.channel} className="rounded-xl ring-1 ring-line">
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={channel.enabled}
                      onChange={(event) =>
                        setChannels((prev) =>
                          prev.map((item) => (item.channel === channel.channel ? { ...item, enabled: event.target.checked } : item)),
                        )
                      }
                      className="size-4 accent-orange"
                    />
                    <ChannelBadge channel={channel.channel} />
                  </label>
                  {channel.enabled && (
                    <div className="grid gap-3 border-t border-line/70 px-4 py-3 sm:grid-cols-2">
                      <Field label={`${channelLabel(channel.channel)} identity name`} value={channel.identityName} onChange={(value) => setChannels((prev) => prev.map((item) => (item.channel === channel.channel ? { ...item, identityName: value } : item)))} />
                      <Field label="Title" value={channel.title} onChange={(value) => setChannels((prev) => prev.map((item) => (item.channel === channel.channel ? { ...item, title: value } : item)))} />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between">
              <button type="button" onClick={() => setStep('review')} className="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-graphite hover:text-ink">
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep('assign')}
                disabled={selectedChannels.length === 0}
                className="rounded-lg bg-solid px-4 py-2 text-[13px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 'assign' && (
          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="onboarding-rep" className="text-[12px] font-medium text-graphite">Assigned rep</label>
              <select
                id="onboarding-rep"
                value={repId}
                onChange={(event) => setRepId(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-lg border border-line bg-bone-raised px-3 text-[13px] text-ink"
              >
                <option value="">Select a rep</option>
                {reps.map((rep) => (
                  <option key={rep.id} value={rep.id}>{rep.name}</option>
                ))}
              </select>
            </div>
            {selectedRep && (
              <div className="rounded-xl bg-bone px-4 py-3 ring-1 ring-line">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">{selectedRep.name} currently has</p>
                {selectedRep.profiles.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {selectedRep.profiles.map((profile) => (
                      <li key={profile} className="text-[12px] text-ink">{profile}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[12px] text-stone">No profiles assigned yet.</p>
                )}
              </div>
            )}
            <div className="flex justify-between">
              <button type="button" onClick={() => setStep('channels')} className="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-graphite hover:text-ink">
                Back
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={!repId || saving}
                className="rounded-lg bg-solid px-4 py-2 text-[13px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save profile'}
              </button>
            </div>
          </div>
        )}

        {step === 'targets' && result && (
          <div className="mt-5 space-y-4">
            <p className="text-[13px] text-graphite">
              Channel-aware daily targets. The profile and channels are already saved — targets can be
              changed any time from the person&apos;s operating center.
            </p>
            <div className="space-y-3">
              {result.identities.map((identity) => {
                const template = channelTargets(identity.channel)
                if (template.length === 0) return null
                const values = targets[identity.id] ?? {}
                return (
                  <fieldset key={identity.id} className="rounded-xl ring-1 ring-line">
                    <legend className="ml-3 rounded-full bg-bone px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-graphite">
                      <ChannelBadge channel={identity.channel} />
                    </legend>
                    <div className="grid gap-3 p-4 sm:grid-cols-2">
                      {template.map((item) => (
                        <label key={item.activityType} className="block">
                          <span className="text-[12px] font-medium text-graphite">{item.label}</span>
                          <input
                            type="number"
                            min={0}
                            value={values[item.activityType] ?? item.default}
                            onChange={(event) =>
                              setTargets((prev) => ({
                                ...prev,
                                [identity.id]: {
                                  ...(prev[identity.id] ?? {}),
                                  [item.activityType]: Math.max(0, Number(event.target.value) || 0),
                                },
                              }))
                            }
                            className="mt-1.5 h-10 w-full rounded-lg border border-line bg-bone-raised px-3 text-[13px] text-ink"
                          />
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )
              })}
            </div>
            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setStep('assign')}
                className="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-graphite hover:text-ink"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => void saveTargets()}
                disabled={saving}
                className="rounded-lg bg-solid px-4 py-2 text-[13px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save targets'}
              </button>
            </div>
          </div>
        )}

        {step === 'ready' && result && (
          <div className="mt-5 space-y-4">
            {result.status === 'failed' ? (
              <div role="alert" className="rounded-xl border border-status-danger/30 bg-status-danger/5 px-4 py-3 text-[13px] text-ink">
                The profile could not be created.
              </div>
            ) : (
              <>
                <div className="rounded-xl bg-bone px-4 py-4 ring-1 ring-line">
                  <p className="text-[15px] font-medium text-ink">{fullName || result.identities[0]?.identityName}</p>
                  <p className="mt-0.5 flex flex-wrap gap-1 text-[12px] text-graphite">
                    {result.identities.map((identity) => <ChannelBadge key={identity.id} channel={identity.channel} />)}
                  </p>
                  <p className="mt-3 text-[12px] text-graphite">Assigned to <span className="font-medium text-ink">{selectedRep?.name}</span></p>
                </div>
                <ul className="space-y-1.5">
                  <ReadyItem ok={Boolean(result.profileId)} label="Visible on the rep's Home" />
                  <ReadyItem ok={result.identities.some((identity) => identity.channel === 'linkedin')} label="Available for LinkedIn prospecting" />
                  <ReadyItem ok={result.identities.some((identity) => identity.channel === 'upwork')} label="Available for Upwork proposals" />
                </ul>
                {result.status === 'partial' && (
                  <div role="alert" className="rounded-xl border border-status-warning/30 bg-status-warning/5 px-4 py-3 text-[12px] text-graphite">
                    Profile created. Assignment needs attention — retry the assignment from Team → Profiles.
                  </div>
                )}
                {result.errors.map((message) => (
                  <p key={message} className="text-[12px] text-status-danger">{message}</p>
                ))}
              </>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-graphite hover:text-ink">
                Close
              </button>
              {result.profileId && (
                <Link
                  href={`/team/profiles/${result.profileId}`}
                  className="rounded-lg bg-solid px-4 py-2 text-[13px] font-medium text-on-solid transition-transform active:scale-[0.98]"
                >
                  Open operating center
                </Link>
              )}
              <button
                type="button"
                onClick={() => {
                  setStep('source')
                  setResult(null)
                  setProfileId(null)
                  setRepId('')
                  setTargets({})
                  setChannels([
                    { channel: 'linkedin', enabled: true, identityName: '', title: '' },
                    { channel: 'upwork', enabled: false, identityName: '', title: '' },
                  ])
                }}
                className="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-graphite hover:text-ink"
              >
                Add another profile
              </button>
            </div>
          </div>
        )}
      </V4Panel>
    </div>
  )
}

function ReadyItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-[12px]">
      <span className={cn('flex size-4 items-center justify-center rounded-full text-[10px]', ok ? 'bg-status-success/10 text-status-success' : 'bg-bone text-stone ring-1 ring-line')}>
        {ok ? '✓' : '—'}
      </span>
      <span className={ok ? 'text-ink' : 'text-stone'}>{label}</span>
    </li>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
  multiline = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hint?: string
  multiline?: boolean
}) {
  const id = `onboarding-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`
  return (
    <div>
      <label htmlFor={id} className="text-[12px] font-medium text-graphite">{label}</label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={3}
          className="mt-1.5 w-full rounded-lg border border-line bg-bone-raised px-3 py-2 text-[13px] text-ink"
        />
      ) : (
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="mt-1.5 h-10 w-full rounded-lg border border-line bg-bone-raised px-3 text-[13px] text-ink"
        />
      )}
      {hint && <p className="mt-1 text-[11px] text-stone">{hint}</p>}
    </div>
  )
}
