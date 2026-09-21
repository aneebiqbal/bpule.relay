/**
 * Admin AI Usage API
 *
 * Returns provider health + persisted usage telemetry.
 * Admin-only endpoint.
 */

import { NextResponse } from 'next/server'
import { getAllHealth, getCooldownRemaining } from '@/lib/ai/runtime'
import { getAiUsageStats } from '@/lib/ai/runtime/telemetry'

export async function GET(request: Request) {
  const { getAuthContext, can } = await import('@/lib/auth/organization')
  const authCtx = await getAuthContext()
  if (!authCtx || !can(authCtx, 'VIEW_TEAM_ANALYTICS')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const orgId = authCtx.orgId

  // Real-time health (in-memory)
  const health = getAllHealth()
  const providers = health.map((h) => ({
    ...h,
    cooldownRemainingMs: getCooldownRemaining(h.provider, h.model, h.credentialId),
  }))

  // Persisted telemetry (from DB) — last 7 days
  let persistedStats = null
  if (orgId) {
    try {
      persistedStats = await getAiUsageStats(orgId, 7)
    } catch {
      // DB table may not exist yet (migration pending)
    }
  }

  // Real-time summary
  const totalRequests = providers.reduce((s, p) => s + p.requests, 0)
  const totalSuccesses = providers.reduce((s, p) => s + p.successes, 0)

  return NextResponse.json({
    realtime: {
      totalRequests,
      totalSuccesses,
      totalErrors: providers.reduce((s, p) => s + p.errors, 0),
      successRate: totalRequests > 0 ? Math.round((totalSuccesses / totalRequests) * 100) : 100,
    },
    persisted: persistedStats,
    providers,
    generatedAt: new Date().toISOString(),
  })
}
