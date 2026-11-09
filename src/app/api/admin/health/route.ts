import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { can } from '@/lib/auth/organization'
import { createServiceSupabase } from '@/lib/supabase/service'
import { computeHealth } from '@/lib/admin/health'

export const maxDuration = 30

/**
 * GET /api/admin/health
 * Production health overview.
 * No AI calls — pure DB aggregation.
 */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!can(ctx, 'VIEW_TEAM_ANALYTICS')) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  const report = await computeHealth(createServiceSupabase(), ctx.orgId)
  return NextResponse.json(report)
}
