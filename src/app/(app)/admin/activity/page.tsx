/**
 * Admin Operating Ledger — daily commercial execution view.
 *
 * Shows what the team actually did today (or any selected date).
 * One row per rep, with action counts. Click to expand details.
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface DailySummary {
  date: string
  repId: string | null
  repName: string | null
  connectionsSent: number
  dmsSent: number
  followupsSent: number
  repliesReceived: number
  leadsExtracted: number
  upworkProposals: number
  opportunities: number
  referrals: number
  totalActions: number
}

interface ActionLogEntry {
  id: string
  actionType: string
  executionStatus: string
  channel: string | null
  occurredAt: string
  actorName: string | null
  senderProfileName: string | null
  leadCompany: string | null
  leadName: string | null
  jobTitle: string | null
}

const ACTION_LABELS: Record<string, string> = {
  LEAD_EXTRACTED: 'Lead extracted',
  CONNECTION_SENT: 'Connection sent',
  DM_SENT: 'DM sent',
  FOLLOWUP_SENT: 'Follow-up sent',
  REPLY_RECEIVED: 'Reply received',
  LEAD_REFERRED: 'Lead referred',
  UPWORK_APPLIED: 'Upwork applied',
  OPPORTUNITY_CREATED: 'Opportunity',
  CLIENT_WON: 'Client won',
}

export default function AdminActivityPage() {
  const router = useRouter()
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [summary, setSummary] = useState<DailySummary[]>([])
  const [todayCounts, setTodayCounts] = useState<Record<string, number>>({})
  const [expandedRep, setExpandedRep] = useState<string | null>(null)
  const [repLog, setRepLog] = useState<ActionLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchData() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ date })
      const res = await fetch(`/api/admin/activity?${params}`)
      if (res.ok) {
        const data = await res.json()
        setSummary(data.summary || [])
        setTodayCounts(data.todayCounts || {})
      }
    } catch (err) {
      console.error('Failed to fetch activity:', err)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [date])

  async function expandRep(repId: string) {
    if (expandedRep === repId) {
      setExpandedRep(null)
      return
    }
    setExpandedRep(repId)
    try {
      const params = new URLSearchParams({ date, repId })
      const res = await fetch(`/api/admin/activity?${params}`)
      if (res.ok) {
        const data = await res.json()
        setRepLog(data.log || [])
      }
    } catch (err) {
      console.error('Failed to fetch rep log:', err)
    }
  }

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  function actionLabel(type: string): string {
    return ACTION_LABELS[type] || type.replace(/_/g, ' ').toLowerCase()
  }

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">Operating Ledger</h1>
            <p className="text-sm text-neutral-500 mt-1">What your team actually did</p>
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 border border-neutral-200 rounded-lg text-sm"
          />
        </div>

        {/* Today Summary */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <SummaryCard label="Connections" value={todayCounts.connectionsSent || 0} />
          <SummaryCard label="DMs" value={todayCounts.dmsSent || 0} />
          <SummaryCard label="Follow-ups" value={todayCounts.followupsSent || 0} />
          <SummaryCard label="Replies" value={todayCounts.repliesReceived || 0} />
          <SummaryCard label="Leads" value={todayCounts.leadsExtracted || 0} />
          <SummaryCard label="Upwork" value={todayCounts.upworkProposals || 0} />
          <SummaryCard label="Opportunities" value={todayCounts.opportunities || 0} />
          <SummaryCard label="Date" value={date} isText />
        </div>

        {/* Rep Rows */}
        {loading ? (
          <div className="text-center py-12 text-neutral-500">Loading...</div>
        ) : summary.length === 0 ? (
          <div className="text-center py-12 text-neutral-500">No activity on {date}</div>
        ) : (
          <div className="space-y-2">
            {summary.map((rep) => (
              <div key={rep.repId || 'system'} className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-neutral-50"
                  onClick={() => rep.repId && expandRep(rep.repId)}
                >
                  <div className="flex items-center gap-4">
                    <span className="font-medium text-neutral-900 w-32">
                      {rep.repName || 'System'}
                    </span>
                    <div className="flex gap-3 text-sm">
                      <Stat label="Conn" value={rep.connectionsSent} />
                      <Stat label="DM" value={rep.dmsSent} />
                      <Stat label="Follow" value={rep.followupsSent} />
                      <Stat label="Reply" value={rep.repliesReceived} />
                      <Stat label="Leads" value={rep.leadsExtracted} />
                    </div>
                  </div>
                  <span className="text-sm text-neutral-500">{rep.totalActions} actions</span>
                </div>

                {/* Expanded Log */}
                {expandedRep === rep.repId && (
                  <div className="border-t border-neutral-100 px-4 py-2 bg-neutral-50">
                    {repLog.length === 0 ? (
                      <p className="text-sm text-neutral-500 py-2">No detailed log available</p>
                    ) : (
                      <div className="space-y-1">
                        {repLog.map((entry) => (
                          <div key={entry.id} className="flex items-center gap-3 text-sm py-1">
                            <span className="text-neutral-400 w-16">{formatTime(entry.occurredAt)}</span>
                            <span className="font-medium text-neutral-700">{actionLabel(entry.actionType)}</span>
                            {entry.senderProfileName && (
                              <span className="text-neutral-500">· {entry.senderProfileName}</span>
                            )}
                            {entry.leadCompany && (
                              <span className="text-neutral-500">→ {entry.leadCompany}</span>
                            )}
                            {entry.leadName && (
                              <span className="text-neutral-400">({entry.leadName})</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ label, value, isText }: { label: string; value: number | string; isText?: boolean }) {
  return (
    <div className="bg-white rounded-lg border border-neutral-200 px-4 py-3">
      <div className="text-xs text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className="text-xl font-semibold text-neutral-900 mt-1">
        {isText ? value : value.toLocaleString()}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  if (value === 0) return null
  return (
    <span className="text-neutral-600">
      {value} <span className="text-neutral-400">{label}</span>
    </span>
  )
}
