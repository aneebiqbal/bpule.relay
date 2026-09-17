/**
 * Admin AI Usage Dashboard
 *
 * Shows provider health, latency, costs, and fallback rates.
 * Operational view of the AI runtime.
 */

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'

interface AiUsageData {
  summary: {
    totalRequests: number
    totalSuccesses: number
    totalErrors: number
    totalTimeouts: number
    totalRateLimits: number
    successRate: number
  }
  providers: Array<{
    provider: string
    model: string
    credentialId: string
    status: string
    requests: number
    successes: number
    errors: number
    timeouts: number
    rateLimits: number
    malformedResponses: number
    p50LatencyMs: number
    p95LatencyMs: number
    lastFailureAt: number | null
    consecutiveFailures: number
    cooldownRemainingMs: number
  }>
}

async function fetchAiUsage(): Promise<AiUsageData | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/admin/ai-usage`, {
      cache: 'no-store',
      credentials: 'include',
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export default async function AdminAiUsagePage() {
  const user = await getCurrentUser()
  if (!user || user.rep.role !== 'admin') {
    redirect('/dashboard')
  }

  const data = await fetchAiUsage()

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">AI Runtime</h1>

      {!data ? (
        <p className="text-gray-500">No AI usage data yet. Run some AI operations to populate this dashboard.</p>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard label="Requests" value={data.summary.totalRequests} />
            <StatCard label="Success Rate" value={`${data.summary.successRate}%`} color={data.summary.successRate >= 90 ? 'green' : data.summary.successRate >= 70 ? 'yellow' : 'red'} />
            <StatCard label="Errors" value={data.summary.totalErrors} color={data.summary.totalErrors > 0 ? 'red' : 'green'} />
            <StatCard label="Timeouts" value={data.summary.totalTimeouts} color={data.summary.totalTimeouts > 0 ? 'yellow' : 'green'} />
            <StatCard label="Rate Limits" value={data.summary.totalRateLimits} color={data.summary.totalRateLimits > 5 ? 'yellow' : 'green'} />
          </div>

          {/* Provider Table */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3">Provider</th>
                  <th className="text-left p-3">Model</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-right p-3">Requests</th>
                  <th className="text-right p-3">Success</th>
                  <th className="text-right p-3">p50</th>
                  <th className="text-right p-3">p95</th>
                  <th className="text-right p-3">Rate Limits</th>
                </tr>
              </thead>
              <tbody>
                {data.providers.length === 0 ? (
                  <tr><td colSpan={8} className="p-4 text-center text-gray-500">No provider activity</td></tr>
                ) : (
                  data.providers.map((p) => (
                    <tr key={`${p.provider}-${p.model}-${p.credentialId}`} className="border-b">
                      <td className="p-3 font-mono">{p.provider}</td>
                      <td className="p-3 font-mono text-xs">{p.model}</td>
                      <td className="p-3">
                        <StatusBadge status={p.status} cooldownMs={p.cooldownRemainingMs} />
                      </td>
                      <td className="p-3 text-right">{p.requests}</td>
                      <td className="p-3 text-right">{p.successes}</td>
                      <td className="p-3 text-right">{p.p50LatencyMs}ms</td>
                      <td className="p-3 text-right">{p.p95LatencyMs}ms</td>
                      <td className="p-3 text-right">{p.rateLimits}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, color = 'gray' }: { label: string; value: string | number; color?: string }) {
  const colors: Record<string, string> = {
    gray: 'bg-gray-50 border-gray-200',
    green: 'bg-green-50 border-green-200',
    yellow: 'bg-yellow-50 border-yellow-200',
    red: 'bg-red-50 border-red-200',
  }
  return (
    <div className={`p-4 rounded-lg border ${colors[color] || colors.gray}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  )
}

function StatusBadge({ status, cooldownMs }: { status: string; cooldownMs: number }) {
  const colors: Record<string, string> = {
    HEALTHY: 'bg-green-100 text-green-800',
    DEGRADED: 'bg-yellow-100 text-yellow-800',
    RATE_LIMITED: 'bg-orange-100 text-orange-800',
    UNHEALTHY: 'bg-red-100 text-red-800',
  }
  const label = cooldownMs > 0 ? `${status} (${Math.ceil(cooldownMs / 1000)}s)` : status
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${colors[status] || 'bg-gray-100'}`}>
      {label}
    </span>
  )
}
