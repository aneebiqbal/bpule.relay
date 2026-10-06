import { NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/supabase/service'
import { getCommandCenter } from '@/lib/admin/command-center'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/command-center?date=2026-10-05
 * Returns daily rep activity, stale leads, and conversions.
 */
export async function GET(request: Request) {
  const auth = requireCronSecret(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: auth.status })
  }

  const orgId = request.headers.get('x-org-id')
  if (!orgId) {
    return NextResponse.json({ error: 'Missing x-org-id header.' }, { status: 400 })
  }

  const url = new URL(request.url)
  const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0]

  try {
    const view = await getCommandCenter(orgId, date)
    return NextResponse.json({ ok: true, view })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
