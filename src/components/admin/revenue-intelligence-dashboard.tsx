'use client'

import { useState, useEffect, useCallback } from 'react'

interface FunnelData {
  extracted: number
  qualified: number
  contacted: number
  replied: number
  qualifiedConversations: number
  calls: number
  proposals: number
  won: number
  lost: number
}

interface AIStats {
  totalCalls: number
  totalCost: number
  avgExtractionTime: number
  p50Latency: number
  p95Latency: number
  providers: Array<{
    provider: string
    total: number
    fallback: number
    errors: number
    avgLatency: number
    totalCost: number
  }>
}

interface RepPerformance {
  repId: string
  extracted: number
  qualified: number
  contacted: number
  replies: number
  qualifiedConversations: number
  calls: number
  proposals: number
  wins: number
  losses: number
  targetProgress: number
}

interface ActivityItem {
  id: string
  timestamp: string
  eventType: string
  actorId: string | null
  entityId: string | null
  prospectName: string | null
  company: string | null
  revenueIdentityName: string | null
  payload: Record<string, unknown> | null
}

interface DashboardData {
  range: { start: string; end: string }
  funnel: FunnelData
  conversationStages: Record<string, number>
  extraction: {
    total: number
    successful: number
    failed: number
    aiExtractions: number
    fallbackExtractions: number
    avgExtractionTime: number
    failedExtractions: number
  }
  ai: AIStats
  messages: {
    total: number
    generatedOnly: number
    reviewed: number
    unchanged: number
    lightEdit: number
    heavyEdit: number
    rejected: number
    dispositions: Record<string, number>
  }
  relayVsHuman: {
    relayActions: Record<string, number>
    humanActions: Record<string, number>
  }
  reps: RepPerformance[]
  identities: Array<{ id: string; name: string; slug: string; title: string; channel: string; status: string }>
  sourcePerformance: Array<{ source: string; extracted: number; qualified: number; contacted: number; replies: number }>
  fitDistribution: Record<string, number>
  confidenceDistribution: { high: number; medium: number; low: number }
  qualificationDistribution: Record<string, number>
  activityFeed: ActivityItem[]
  targets: { total: number; totalTarget: number; totalCompleted: number }
  insights: Array<{ id: string; type: string; severity: string; title: string; explanation: string; sampleSize?: number; confidence: string; suggestedInvestigation?: string }>
  dataHealth: Record<string, { health: string; reason?: string }>
  costCoverage: number
  latencyHealth: { health: string; reason?: string }
  fallbackBreakdown: { demoMode: number; productionFailures: number; byReason: Record<string, number> }
}

const RANGE_OPTIONS = [
  { label: 'Today', value: 'today' },
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
]

function formatNumber(n: number): string {
  return n.toLocaleString()
}

function formatPercent(n: number): string {
  return `${n}%`
}

function formatCurrency(n: number): string {
  return `$${n.toFixed(2)}`
}

function FunnelBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const width = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 text-muted-foreground truncate">{label}</span>
      <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${width}%` }} />
      </div>
      <span className="w-10 text-right font-mono">{value}</span>
    </div>
  )
}

function StatCard({ label, value, subtext }: { label: string; value: string | number; subtext?: string }) {
  return (
    <div className="border border-border rounded-lg p-3 bg-card">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
      {subtext && <div className="text-xs text-muted-foreground mt-0.5">{subtext}</div>}
    </div>
  )
}

function Table({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            {headers.map((h) => (
              <th key={h} className="text-left py-2 px-2 font-medium text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50">
              {row.map((cell, j) => (
                <td key={j} className="py-2 px-2">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-8 text-sm text-muted-foreground">
      {message}
    </div>
  )
}

function DataHealthPanel({ dataHealth }: { dataHealth: Record<string, { health: string; reason?: string }> }) {
  const healthColor = (h: string) => {
    switch (h) {
      case 'TRUSTED': return 'text-green-600'
      case 'PARTIAL': return 'text-yellow-600'
      case 'SUSPICIOUS': return 'text-red-600'
      default: return 'text-muted-foreground'
    }
  }
  return (
    <div className="border border-border rounded-lg p-4 space-y-2">
      <h3 className="text-sm font-medium">Data Health</h3>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
        {Object.entries(dataHealth).map(([key, val]) => (
          <div key={key} className="space-y-0.5">
            <div className="text-muted-foreground capitalize">{key}</div>
            <div className={`font-medium ${healthColor(val.health)}`}>{val.health}</div>
            {val.reason && <div className="text-muted-foreground text-[10px] leading-tight">{val.reason}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

export function RevenueIntelligenceDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState('30d')
  const [activeTab, setActiveTab] = useState<'overview' | 'team' | 'extraction' | 'human-vs-relay' | 'funnel' | 'activity'>('overview')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/revenue-intelligence?range=${range}`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) return <div className="text-sm text-muted-foreground">Loading...</div>
  if (error) return <div className="text-sm text-destructive">{error}</div>
  if (!data) return <EmptyState message="No data available." />

  const maxFunnel = Math.max(data.funnel.extracted, data.funnel.qualified, data.funnel.contacted, data.funnel.replied, 1)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setRange(opt.value)}
            className={`px-3 py-1 text-xs rounded border ${
              range === opt.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border hover:bg-muted'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="border-b border-border">
        <div className="flex gap-4">
          {(['overview', 'team', 'extraction', 'human-vs-relay', 'funnel', 'activity'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-2 text-xs font-medium capitalize ${
                activeTab === tab
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.replace('-', ' ')}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="border border-border rounded-lg p-4 bg-card">
            <h3 className="text-sm font-medium mb-2">Relay Brief</h3>
            <div className="space-y-2">
              {(data.insights ?? []).map((insight: { id: string; title: string; explanation: string; severity: string; confidence: string; sampleSize?: number }) => (
                <div key={insight.id} className="flex items-start gap-2 text-xs">
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    insight.severity === 'ACTION' ? 'bg-red-100 text-red-700' :
                    insight.severity === 'WATCH' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>{insight.severity}</span>
                  <div>
                    <span className="font-medium">{insight.title}</span>
                    <span className="text-muted-foreground ml-2">{insight.explanation}</span>
                    {insight.sampleSize !== undefined && (
                      <span className="text-muted-foreground ml-1">(n={insight.sampleSize})</span>
                    )}
                  </div>
                </div>
              ))}
              {(!data.insights || data.insights.length === 0) && (
                <div className="text-sm text-muted-foreground">No insights generated for this period.</div>
              )}
            </div>
            {data.dataHealth && <DataHealthPanel dataHealth={data.dataHealth} />}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <StatCard label="Unique Prospects" value={formatNumber(data.funnel.extracted)} subtext="analyzed" />
            <StatCard label="Qualified" value={formatNumber(data.funnel.qualified)} />
            <StatCard label="Contacted" value={formatNumber(data.funnel.contacted)} />
            <StatCard label="Replies" value={formatNumber(data.funnel.replied)} />
            <StatCard label="Qual Convos" value={formatNumber(data.funnel.qualifiedConversations)} />
            <StatCard label="Calls" value={formatNumber(data.funnel.calls)} />
            <StatCard label="Proposals" value={formatNumber(data.funnel.proposals)} />
            <StatCard label="Wins" value={formatNumber(data.funnel.won)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Funnel</h3>
              <FunnelBar label="Extracted" value={data.funnel.extracted} max={maxFunnel} color="bg-ink" />
              <FunnelBar label="Qualified" value={data.funnel.qualified} max={maxFunnel} color="bg-cobalt" />
              <FunnelBar label="Contacted" value={data.funnel.contacted} max={maxFunnel} color="bg-cobalt" />
              <FunnelBar label="Replied" value={data.funnel.replied} max={maxFunnel} color="bg-signal-orange" />
              <FunnelBar label="Qualified Convos" value={data.funnel.qualifiedConversations} max={maxFunnel} color="bg-signal-orange" />
              <FunnelBar label="Calls" value={data.funnel.calls} max={maxFunnel} color="bg-signal-orange" />
              <FunnelBar label="Proposals" value={data.funnel.proposals} max={maxFunnel} color="bg-bone" />
              <FunnelBar label="Wins" value={data.funnel.won} max={maxFunnel} color="bg-bone" />
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium">AI Health</h3>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Extraction Runs" value={formatNumber(data.extraction.total)} subtext="including retries" />
                <StatCard label="Successful" value={formatNumber(data.extraction.successful)} />
                <StatCard label="AI Extractions" value={formatNumber(data.extraction.aiExtractions)} />
                <StatCard label="Fallback/Demo" value={formatNumber(data.extraction.fallbackExtractions)} subtext={data.extraction.total > 0 ? formatPercent(Math.round((data.extraction.fallbackExtractions / data.extraction.total) * 100)) + ' fallback' : undefined} />
                <StatCard label="Avg Latency" value={`${data.extraction.avgExtractionTime}ms`} />
                <StatCard label="P50 Latency" value={`${data.ai.p50Latency}ms`} />
                <StatCard label="P95 Latency" value={`${data.ai.p95Latency}ms`} />
                <StatCard label="AI Cost" value={formatCurrency(data.ai.totalCost)} />
              </div>
            </div>
          </div>

          {data.extraction.fallbackExtractions > 0 && data.extraction.total > 0 && (
            <div className="border border-destructive/30 bg-destructive/5 rounded-lg p-3">
              <div className="text-xs font-medium text-destructive">
                {formatPercent(Math.round((data.extraction.fallbackExtractions / data.extraction.total) * 100))} of extractions used fallback/demo
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {data.fallbackBreakdown?.demoMode ?? 0} demo mode · {data.fallbackBreakdown?.productionFailures ?? 0} production fallback
              </div>
              {data.fallbackBreakdown?.productionFailures > 0 && (
                <div className="text-xs text-muted-foreground mt-1">
                  Top reason: {Object.entries(data.fallbackBreakdown.byReason).filter(([k, v]) => k !== 'DEMO_MODE' && v > 0).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'UNKNOWN'}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'funnel' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Funnel Stages</h3>
              <FunnelBar label="Extracted" value={data.funnel.extracted} max={maxFunnel} color="bg-ink" />
              <FunnelBar label="Qualified" value={data.funnel.qualified} max={maxFunnel} color="bg-cobalt" />
              <FunnelBar label="Contacted" value={data.funnel.contacted} max={maxFunnel} color="bg-cobalt" />
              <FunnelBar label="Replied" value={data.funnel.replied} max={maxFunnel} color="bg-signal-orange" />
              <FunnelBar label="Qualified Convos" value={data.funnel.qualifiedConversations} max={maxFunnel} color="bg-signal-orange" />
              <FunnelBar label="Calls" value={data.funnel.calls} max={maxFunnel} color="bg-signal-orange" />
              <FunnelBar label="Proposals" value={data.funnel.proposals} max={maxFunnel} color="bg-bone" />
              <FunnelBar label="Wins" value={data.funnel.won} max={maxFunnel} color="bg-bone" />
              <FunnelBar label="Lost" value={data.funnel.lost} max={maxFunnel} color="bg-destructive" />
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium">Conversation Stages</h3>
              {Object.entries(data.conversationStages).length === 0 ? (
                <EmptyState message="No conversation stages recorded in this period." />
              ) : (
                <Table
                  headers={['Stage', 'Count']}
                  rows={Object.entries(data.conversationStages).map(([stage, count]) => [stage, count])}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Fit Distribution</h3>
              <Table
                headers={['Fit', 'Count']}
                rows={Object.entries(data.fitDistribution).map(([fit, count]) => [fit, count])}
              />
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium">Qualification Distribution</h3>
              <Table
                headers={['Qualification', 'Count']}
                rows={Object.entries(data.qualificationDistribution).map(([q, count]) => [q, count])}
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'team' && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Team Performance</h3>
          {data.reps.length === 0 ? (
            <EmptyState message="No rep activity in this period." />
          ) : (
            <Table
              headers={['Rep', 'Extracted', 'Qualified', 'Contacted', 'Replies', 'Qual Convos', 'Calls', 'Proposals', 'Wins', 'Losses', 'Target %']}
              rows={data.reps.map((rep) => [
                rep.repId.slice(0, 8),
                rep.extracted,
                rep.qualified,
                rep.contacted,
                rep.replies,
                rep.qualifiedConversations,
                rep.calls,
                rep.proposals,
                rep.wins,
                rep.losses,
                `${rep.targetProgress}%`,
              ])}
            />
          )}

          <div className="space-y-3">
            <h3 className="text-sm font-medium">Targets</h3>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Active Targets" value={formatNumber(data.targets.total)} />
              <StatCard label="Total Target" value={formatNumber(data.targets.totalTarget)} />
              <StatCard label="Completed" value={formatNumber(data.targets.totalCompleted)} subtext={data.targets.totalTarget > 0 ? `${formatPercent(Math.round((data.targets.totalCompleted / data.targets.totalTarget) * 100))}` : undefined} />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'extraction' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Extraction Runs" value={formatNumber(data.extraction.total)} subtext="including retries" />
            <StatCard label="Successful" value={formatNumber(data.extraction.successful)} />
            <StatCard label="Failed" value={formatNumber(data.extraction.failed)} />
            <StatCard label="Avg Time" value={data.extraction.avgExtractionTime > 0 ? `${data.extraction.avgExtractionTime}ms` : 'Unavailable'} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Fit Distribution</h3>
              <Table
                headers={['Fit', 'Count']}
                rows={Object.entries(data.fitDistribution).map(([fit, count]) => [fit, count])}
              />
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium">Confidence Distribution</h3>
              <Table
                headers={['Level', 'Count']}
                rows={[
                  ['High (>=80%)', data.confidenceDistribution.high],
                  ['Medium (50-79%)', data.confidenceDistribution.medium],
                  ['Low (<50%)', data.confidenceDistribution.low],
                ]}
              />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium">Provider Telemetry</h3>
            {data.ai.providers.length === 0 ? (
              <EmptyState message="No AI traces in this period." />
            ) : (
              <Table
                headers={['Provider', 'Calls', 'Fallback', 'Errors', 'Avg Latency', 'Cost']}
                rows={data.ai.providers.map((p) => [
                  p.provider,
                  p.total,
                  p.fallback,
                  p.errors,
                  `${p.avgLatency}ms`,
                  formatCurrency(p.totalCost),
                ])}
              />
            )}
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                label="AI Cost"
                value={data.costCoverage <= 0 ? 'Unavailable' : formatCurrency(data.ai.totalCost)}
                subtext={
                  data.costCoverage <= 0
                    ? 'No cost telemetry'
                    : data.costCoverage < 0.95
                      ? `${Math.round(data.costCoverage * 100)}% coverage`
                      : 'Full coverage'
                }
              />
              <StatCard
                label="P50 Latency"
                value={data.latencyHealth?.health === 'UNAVAILABLE' || data.latencyHealth?.health === 'SUSPICIOUS' ? 'Unavailable' : `${data.ai.p50Latency}ms`}
                subtext={
                  data.latencyHealth?.health === 'SUSPICIOUS'
                    ? 'Average latency contradicts percentiles — telemetry unreliable'
                    : data.latencyHealth?.health === 'UNAVAILABLE'
                      ? 'No valid latency samples'
                      : undefined
                }
              />
              <StatCard
                label="P95 Latency"
                value={data.latencyHealth?.health === 'UNAVAILABLE' || data.latencyHealth?.health === 'SUSPICIOUS' ? 'Unavailable' : `${data.ai.p95Latency}ms`}
                subtext={
                  data.latencyHealth?.health === 'SUSPICIOUS'
                    ? 'Average latency contradicts percentiles — telemetry unreliable'
                    : data.latencyHealth?.health === 'UNAVAILABLE'
                      ? 'No valid latency samples'
                      : undefined
                }
              />
            </div>
          </div>

          {data.ai.providers.some((p) => p.fallback > 0 || p.errors > 0) && (
            <div className="border border-destructive/30 bg-destructive/5 rounded-lg p-3">
              <div className="text-xs font-medium text-destructive">Provider Issues Detected</div>
              <div className="text-xs text-muted-foreground mt-1">
                {data.ai.providers.filter((p) => p.fallback > 0 || p.errors > 0).map((p) => (
                  <div key={p.provider}>
                    {p.provider}: {p.fallback} fallback, {p.errors} errors
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'human-vs-relay' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Relay Recommendations</h3>
              <Table
                headers={['Action', 'Count']}
                rows={Object.entries(data.relayVsHuman.relayActions).map(([action, count]) => [action, count])}
              />
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium">Human Actions</h3>
              <Table
                headers={['Action', 'Count']}
                rows={Object.entries(data.relayVsHuman.humanActions).map(([action, count]) => [action, count])}
              />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium">Message Dispositions</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total Generated" value={formatNumber(data.messages.total)} />
              <StatCard label="Generated Only" value={formatNumber(data.messages.generatedOnly)} subtext="draft created, not yet sent" />
              <StatCard label="Reviewed" value={formatNumber(data.messages.reviewed)} subtext="sent or dispositioned" />
              <StatCard
                label="Unchanged"
                value={data.messages.reviewed > 0 ? `${Math.round((data.messages.unchanged / data.messages.reviewed) * 100)}%` : '—'}
                subtext={`${data.messages.unchanged} of ${data.messages.reviewed} reviewed`}
              />
              <StatCard
                label="Heavy Edit"
                value={data.messages.reviewed > 0 ? `${Math.round((data.messages.heavyEdit / data.messages.reviewed) * 100)}%` : '—'}
                subtext={`${data.messages.heavyEdit} of ${data.messages.reviewed} reviewed`}
              />
              <StatCard
                label="Rejected"
                value={data.messages.reviewed > 0 ? `${Math.round((data.messages.rejected / data.messages.reviewed) * 100)}%` : '—'}
                subtext={`${data.messages.rejected} of ${data.messages.reviewed} reviewed`}
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Activity Feed</h3>
          {data.activityFeed.length === 0 ? (
            <EmptyState message="No activity in this period." />
          ) : (
            <div className="space-y-1">
              {data.activityFeed.slice(0, 50).map((item) => (
                <div key={item.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-border/30">
                  <span className="text-muted-foreground font-mono w-20 shrink-0">
                    {new Date(item.timestamp).toLocaleDateString()}
                  </span>
                  <span className="font-medium w-32 shrink-0 truncate">{item.eventType}</span>
                  <span className="text-muted-foreground truncate">
                    {item.prospectName ?? item.company ?? item.entityId?.slice(0, 8) ?? '—'}
                  </span>
                  {item.revenueIdentityName && (
                    <span className="text-muted-foreground truncate">via {item.revenueIdentityName}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
