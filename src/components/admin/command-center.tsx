'use client'

import { useEffect, useState } from 'react'
import { Users, MessageSquare, Send, RefreshCw, Trophy, Clock, TrendingUp, AlertTriangle } from 'lucide-react'
import { cn } from 'cn'

interface CommandCenterData {
  date: string
  summary: {
    totalActions: number
    connectionsSent: number
    dmsSent: number
    followupsSent: number
    repliesSent: number
    repliesReceived: number
    leadsExtracted: number
    upworkActions: number
    referrals: number
    wins: number
    activeReps: number
  }
  reps: Array<{
    repId: string
    repName: string
    totalActions: number
    connectionsSent: number
    dmsSent: number
    followupsSent: number
    repliesSent: number
    repliesReceived: number
    leadsExtracted: number
    upworkActions: number
    referrals: number
    wins: number
    lastActivityAt: string | null
  }>
  stale: Array<{
    leadId: string
    company: string
    contactName: string | null
    status: string
    daysStale: number
    repName: string | null
  }>
  conversions: Array<{
    leadId: string
    company: string
    type: 'won' | 'interested' | 'meeting'
    occurredAt: string
    repName: string | null
    senderProfileName: string | null
  }>
}

export function CommandCenter() {
  const [data, setData] = useState<CommandCenterData | null>(null)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/command-center?date=${date}`, {
        headers: { 'x-org-id': '' },
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setData(json.view)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [date])

  if (error) return <p className="text-[13px] text-status-danger">{error}</p>
  if (!data) return <p className="text-[13px] text-stone">Loading...</p>

  const { summary, reps, stale, conversions } = data

  return (
    <div className="space-y-6">
      {/* Date picker */}
      <div className="flex items-center gap-3">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-line bg-bone px-3 py-1.5 text-[13px] text-ink focus:border-orange focus:outline-none"
        />
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-graphite hover:bg-bone-raised disabled:opacity-50"
        >
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <SummaryCard icon={Users} label="Active Reps" value={summary.activeReps} />
        <SummaryCard icon={TrendingUp} label="Total Actions" value={summary.totalActions} />
        <SummaryCard icon={Send} label="Connections" value={summary.connectionsSent} />
        <SummaryCard icon={MessageSquare} label="DMs" value={summary.dmsSent} />
        <SummaryCard icon={RefreshCw} label="Follow-ups" value={summary.followupsSent} />
        <SummaryCard icon={Trophy} label="Wins" value={summary.wins} />
      </div>

      {/* Rep breakdown */}
      <div>
        <h3 className="text-[12px] font-medium text-ink mb-2">Rep Activity</h3>
        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-line bg-bone-raised text-graphite">
                <th className="px-3 py-2 text-left font-medium">Rep</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
                <th className="px-3 py-2 text-right font-medium">Conn</th>
                <th className="px-3 py-2 text-right font-medium">DMs</th>
                <th className="px-3 py-2 text-right font-medium">Follow</th>
                <th className="px-3 py-2 text-right font-medium">Reply</th>
                <th className="px-3 py-2 text-right font-medium">Upwork</th>
                <th className="px-3 py-2 text-right font-medium">Wins</th>
              </tr>
            </thead>
            <tbody>
              {reps.map((rep) => (
                <tr key={rep.repId} className="border-b border-line/40 last:border-b-0">
                  <td className="px-3 py-2 font-medium text-ink">{rep.repName}</td>
                  <td className="px-3 py-2 text-right">{rep.totalActions}</td>
                  <td className="px-3 py-2 text-right">{rep.connectionsSent}</td>
                  <td className="px-3 py-2 text-right">{rep.dmsSent}</td>
                  <td className="px-3 py-2 text-right">{rep.followupsSent}</td>
                  <td className="px-3 py-2 text-right">{rep.repliesSent + rep.repliesReceived}</td>
                  <td className="px-3 py-2 text-right">{rep.upworkActions}</td>
                  <td className="px-3 py-2 text-right">{rep.wins}</td>
                </tr>
              ))}
              {reps.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-4 text-center text-stone">No activity</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stale leads */}
      {stale.length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 text-[12px] font-medium text-ink mb-2">
            <AlertTriangle className="size-3.5 text-status-warning" />
            Stale Leads ({stale.length})
          </h3>
          <div className="space-y-1">
            {stale.slice(0, 10).map((lead) => (
              <div key={lead.leadId} className="flex items-center justify-between rounded-md border border-line/60 px-3 py-2">
                <div>
                  <span className="text-[12px] text-ink">{lead.company}</span>
                  {lead.repName && <span className="ml-2 text-[11px] text-stone">· {lead.repName}</span>}
                </div>
                <span className="text-[11px] text-status-warning">{lead.daysStale}d stale</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conversions */}
      {conversions.length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 text-[12px] font-medium text-ink mb-2">
            <Trophy className="size-3.5 text-status-success" />
            Conversions ({conversions.length})
          </h3>
          <div className="space-y-1">
            {conversions.map((c, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border border-status-success/20 bg-status-success/[0.03] px-3 py-2">
                <div>
                  <span className="text-[12px] text-ink">{c.company}</span>
                  {c.repName && <span className="ml-2 text-[11px] text-stone">· {c.repName}</span>}
                </div>
                <span className={cn(
                  'text-[11px] font-medium',
                  c.type === 'won' ? 'text-status-success' : 'text-status-info',
                )}>
                  {c.type === 'won' ? 'Won' : 'Interested'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-bone-raised p-3">
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 text-stone" />
        <span className="text-[11px] text-graphite">{label}</span>
      </div>
      <p className="mt-1 text-[18px] font-medium text-ink">{value}</p>
    </div>
  )
}
