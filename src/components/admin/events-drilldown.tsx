'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { X, Target } from 'lucide-react'

type ActionType = string

interface DrilldownEvent {
  id: string
  action_type: ActionType
  execution_status: string
  occurred_at: string
  actor_name: string | null
  sender_profile_name: string | null
  lead_company: string | null
  lead_name: string | null
  lead_id: string | null
  job_title: string | null
}

const ACTION_LABELS: Record<string, string> = {
  LEAD_EXTRACTED: 'Lead extracted',
  CONNECTION_SENT: 'Connection sent',
  CONNECTION_PREPARED: 'Connection drafted',
  DM_SENT: 'DM sent',
  DM_PREPARED: 'DM drafted',
  FOLLOWUP_SENT: 'Follow-up sent',
  REPLY_SENT: 'Reply sent',
  REPLY_RECEIVED: 'Reply received',
  LEAD_REFERRED: 'Lead referred',
  PROFILE_RECOMMENDED: 'Profile recommended',
  UPWORK_JOB_EXTRACTED: 'Upwork job extracted',
  UPWORK_PROPOSAL_PREPARED: 'Proposal drafted',
  UPWORK_APPLIED: 'Upwork applied',
  OPPORTUNITY_CREATED: 'Opportunity created',
  CLIENT_WON: 'Client won',
  LEAD_ARCHIVED: 'Lead archived',
}

function actionLabel(type: string): string {
  return ACTION_LABELS[type] || type.replace(/_/g, ' ').toLowerCase()
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

interface EventsDrilldownProps {
  date: string
  actionType: string | null
  repId: string | null
  onClose: () => void
}

export function EventsDrilldown({ date, actionType, repId, onClose }: EventsDrilldownProps) {
  const [events, setEvents] = useState<DrilldownEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!actionType) {
      setEvents([])
      setLoading(false)
      return
    }

    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const params = new URLSearchParams({ date, action: actionType || '' })
        if (repId) params.set('repId', repId)
        const res = await fetch(`/api/admin/events?${params}`)
        if (res.ok && !cancelled) {
          const data = await res.json()
          setEvents(data.events || [])
        }
      } catch {
        // silent
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [date, actionType, repId])

  if (!actionType) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-lg border border-line bg-bone-raised shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="flex items-center gap-2">
            <Target className="size-4 text-orange" />
            <div>
              <p className="text-[14px] font-medium text-ink">{actionLabel(actionType)}</p>
              <p className="text-[11px] text-stone">{events.length} events · {date}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-graphite hover:bg-bone hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Events list */}
        <div className="max-h-96 overflow-y-auto p-3">
          {loading ? (
            <div className="space-y-2 py-4">
              <div className="h-6 animate-pulse rounded bg-bone" />
              <div className="h-6 animate-pulse rounded bg-bone" />
            </div>
          ) : events.length === 0 ? (
            <p className="py-8 text-center text-graphite">No events found.</p>
          ) : (
            <div className="space-y-1">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-bone/50"
                >
                  <Target className="size-3.5 shrink-0 text-stone" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-stone">{formatTime(event.occurred_at)}</span>
                      {event.actor_name && (
                        <span className="text-[12px] font-medium text-ink">{event.actor_name}</span>
                      )}
                    </div>
                    {event.lead_company && (
                      <div className="flex items-center gap-1.5 text-[11px] text-graphite">
                        {event.lead_id ? (
                          <Link href={`/leads/${event.lead_id}`} className="hover:text-ink hover:underline">
                            {event.lead_company}
                          </Link>
                        ) : (
                          <span>{event.lead_company}</span>
                        )}
                        {event.lead_name && <span>({event.lead_name})</span>}
                        {event.sender_profile_name && <span>· via {event.sender_profile_name}</span>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
