'use client'

/**
 * Admin → Channels — configure the execution catalog that feeds Work Setup.
 *
 * Every change goes through /api/admin/channels*: built-in templates are
 * read-only; custom channels and their activity definitions are data, so a new
 * business category needs no application-code change.
 */
import { useCallback, useEffect, useState } from 'react'
import { Plus, ShieldCheck } from 'lucide-react'
import { V4Eyebrow, V4Empty, V4Error, V4Panel } from '@/components/v4/primitives'
import { Button } from '@/components/ui/button'
import {
  COUNTING_MODES,
  EVIDENCE_POLICIES,
  OPERATION_MODES,
  type ChannelTemplate,
} from '@/lib/execution/activity-catalog'

interface ChannelRow {
  id: string
  organization_id: string | null
  slug: string
  name: string
  description: string | null
  template: ChannelTemplate
  operation_mode: string
  enabled: boolean
  revision: number
}

interface ActivityRow {
  id: string
  channel_id: string
  key: string
  label: string
  counting_mode: string
  evidence_policy: string
  targetable: boolean
  enabled: boolean
  effort_minutes: number
  version: number
  effective_until: string | null
}

const inputClass = 'h-8 w-full rounded-md border border-line bg-bone px-2 text-[12px] text-ink outline-none focus:border-orange/50'

export function ChannelsAdmin() {
  const [channels, setChannels] = useState<ChannelRow[]>([])
  const [activities, setActivities] = useState<ActivityRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [channelForm, setChannelForm] = useState({ name: '', slug: '', description: '', template: 'custom' as ChannelTemplate, operationMode: 'manual_evidence' })
  const [activityForm, setActivityForm] = useState<Record<string, { key: string; label: string; countingMode: string; evidencePolicy: string; targetable: boolean; effortMinutes: number }>>({})

  const load = useCallback(async () => {
    setError(null)
    try {
      const response = await fetch('/api/admin/channels', { cache: 'no-store' })
      const body = (await response.json().catch(() => ({}))) as { channels?: ChannelRow[]; activities?: ActivityRow[]; error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Failed to load channels.')
      setChannels(body.channels ?? [])
      setActivities(body.activities ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load channels.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function post(url: string, method: string, payload?: unknown): Promise<boolean> {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(url, {
        method,
        headers: payload === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Save failed.')
      await load()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
      return false
    } finally {
      setBusy(false)
    }
  }

  function activitiesFor(channelId: string): ActivityRow[] {
    return activities.filter((row) => row.channel_id === channelId && row.effective_until === null)
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
      <V4Eyebrow>Admin · Work Setup</V4Eyebrow>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Channels</h1>
      <p className="mt-2 max-w-2xl text-sm text-graphite">
        Define what business work exists and exactly what each activity means. Custom channels become usable in
        Work Setup, targets, Rep Today and reporting without an application change.
      </p>

      {error && <div className="mt-4"><V4Error message={error} /></div>}

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <V4Panel className="lg:col-span-1">
          <h2 className="text-sm font-medium text-ink">New custom channel</h2>
          <div className="mt-3 space-y-2">
            <input className={inputClass} placeholder="Name (e.g. Partner Outreach)" value={channelForm.name} onChange={(event) => setChannelForm({ ...channelForm, name: event.target.value })} />
            <input className={inputClass} placeholder="slug (e.g. partner-outreach)" value={channelForm.slug} onChange={(event) => setChannelForm({ ...channelForm, slug: event.target.value.toLowerCase() })} />
            <textarea className="min-h-16 w-full rounded-md border border-line bg-bone px-2 py-1.5 text-[12px] text-ink outline-none focus:border-orange/50" placeholder="Description" value={channelForm.description} onChange={(event) => setChannelForm({ ...channelForm, description: event.target.value })} />
            <select className={inputClass} value={channelForm.operationMode} onChange={(event) => setChannelForm({ ...channelForm, operationMode: event.target.value })}>
              {OPERATION_MODES.map((mode) => <option key={mode} value={mode}>{mode.replace(/_/g, ' ')}</option>)}
            </select>
            <Button type="button" variant="orange" disabled={busy || !channelForm.name.trim() || !channelForm.slug.trim()} onClick={async () => {
              const ok = await post('/api/admin/channels', 'POST', {
                name: channelForm.name.trim(),
                slug: channelForm.slug.trim(),
                description: channelForm.description.trim() || null,
                template: 'custom',
                operationMode: channelForm.operationMode,
              })
              if (ok) setChannelForm({ name: '', slug: '', description: '', template: 'custom', operationMode: 'manual_evidence' })
            }}>
              <Plus className="size-3.5" aria-hidden /> Create channel
            </Button>
          </div>
        </V4Panel>

        <div className="space-y-4 lg:col-span-2">
          {channels.length === 0 && <V4Empty title="No channels yet" body="Built-in templates load after the catalog migration is applied." />}
          {channels.map((channel) => {
            const isSystem = channel.organization_id === null
            const rows = activitiesFor(channel.id)
            const draft = activityForm[channel.id] ?? { key: '', label: '', countingMode: 'unique_verified_event', evidencePolicy: 'internal_record', targetable: false, effortMinutes: 5 }
            return (
              <V4Panel key={channel.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-ink">{channel.name}</h3>
                      {isSystem
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-bone-raised px-2 py-0.5 text-[10px] uppercase tracking-wide text-stone ring-1 ring-line"><ShieldCheck className="size-3" aria-hidden />template</span>
                        : <button type="button" onClick={() => post(`/api/admin/channels/${channel.id}`, 'PATCH', { enabled: !channel.enabled })} className="rounded-full bg-bone-raised px-2 py-0.5 text-[10px] uppercase tracking-wide text-stone ring-1 ring-line hover:text-ink">
                            {channel.enabled ? 'enabled' : 'disabled'}
                          </button>}
                    </div>
                    <p className="mt-1 text-[11px] text-stone">{channel.slug} · {channel.template} · {channel.operation_mode.replace(/_/g, ' ')}</p>
                    {channel.description && <p className="mt-1 text-[12px] text-graphite">{channel.description}</p>}
                  </div>
                  {!isSystem && (
                    <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => post(`/api/admin/channels/${channel.id}`, 'DELETE')}>
                      Disable
                    </Button>
                  )}
                </div>

                <div className="mt-3 space-y-1.5">
                  {rows.length === 0 && <p className="text-[11px] text-stone">No activities defined yet.</p>}
                  {rows.map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-bone-raised px-3 py-2">
                      <div>
                        <p className="text-[12px] text-ink">{row.label}</p>
                        <p className="text-[10px] text-stone">
                          {row.key} · {row.counting_mode.replace(/_/g, ' ')} · {row.evidence_policy.replace(/_/g, ' ')} · {row.effort_minutes}m
                          {row.targetable ? ' · targetable' : ' · tracked'} · v{row.version}
                        </p>
                      </div>
                      {!isSystem && (
                        <button type="button" onClick={() => post(`/api/admin/channels/activities/${row.id}`, 'PATCH', { enabled: !row.enabled })} className="rounded-full bg-bone px-2 py-0.5 text-[10px] uppercase tracking-wide text-stone ring-1 ring-line hover:text-ink">
                          {row.enabled ? 'enabled' : 'disabled'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {!isSystem && (
                  <div className="mt-3 rounded-lg border border-dashed border-line p-2.5">
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone">Add activity</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input className={inputClass} placeholder="key (e.g. intro_sent)" value={draft.key} onChange={(event) => setActivityForm({ ...activityForm, [channel.id]: { ...draft, key: event.target.value } })} />
                      <input className={inputClass} placeholder="Label" value={draft.label} onChange={(event) => setActivityForm({ ...activityForm, [channel.id]: { ...draft, label: event.target.value } })} />
                      <select className={inputClass} value={draft.countingMode} onChange={(event) => setActivityForm({ ...activityForm, [channel.id]: { ...draft, countingMode: event.target.value } })}>
                        {COUNTING_MODES.map((mode) => <option key={mode} value={mode}>{mode.replace(/_/g, ' ')}</option>)}
                      </select>
                      <select className={inputClass} value={draft.evidencePolicy} onChange={(event) => setActivityForm({ ...activityForm, [channel.id]: { ...draft, evidencePolicy: event.target.value } })}>
                        {EVIDENCE_POLICIES.map((policy) => <option key={policy} value={policy}>{policy.replace(/_/g, ' ')}</option>)}
                      </select>
                      <label className="flex items-center gap-1.5 text-[11px] text-graphite">
                        <input type="checkbox" checked={draft.targetable} onChange={(event) => setActivityForm({ ...activityForm, [channel.id]: { ...draft, targetable: event.target.checked } })} />
                        Targetable
                      </label>
                      <input className={inputClass} type="number" min={0} max={480} value={draft.effortMinutes} onChange={(event) => setActivityForm({ ...activityForm, [channel.id]: { ...draft, effortMinutes: Number(event.target.value) || 0 } })} />
                    </div>
                    <Button type="button" size="sm" variant="secondary" className="mt-2" disabled={busy || !draft.key.trim() || !draft.label.trim()} onClick={async () => {
                      const ok = await post(`/api/admin/channels/${channel.id}/activities`, 'POST', {
                        key: draft.key.trim(),
                        label: draft.label.trim(),
                        countingMode: draft.countingMode,
                        evidencePolicy: draft.evidencePolicy,
                        targetable: draft.targetable,
                        effortMinutes: draft.effortMinutes,
                      })
                      if (ok) setActivityForm({ ...activityForm, [channel.id]: { key: '', label: '', countingMode: 'unique_verified_event', evidencePolicy: 'internal_record', targetable: false, effortMinutes: 5 } })
                    }}>
                      Add activity
                    </Button>
                  </div>
                )}
              </V4Panel>
            )
          })}
        </div>
      </div>
    </div>
  )
}
