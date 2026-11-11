import { NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { loadProviderAnalytics } from '@/lib/enrichment/analytics'

export const dynamic = 'force-dynamic'

/**
 * Provider funnel + saved-search quality (§31, §32).
 *
 * One read over the canonical events/tables. `days` defaults to the weekly
 * saved-search report window.
 */
export async function GET(request: Request) {
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!can(authCtx, 'VIEW_TEAM_ANALYTICS') && !authCtx.isAdmin && !authCtx.isOwner) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days')) || 7))
  const end = new Date()
  const start = new Date(end.getTime() - days * 86_400_000)

  const client = await createServerSupabase()
  try {
    const analytics = await loadProviderAnalytics(client, authCtx.orgId, {
      start: start.toISOString(),
      end: end.toISOString(),
    })
    return NextResponse.json(analytics)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load provider analytics.' },
      { status: 500 },
    )
  }
}
