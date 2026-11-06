import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { loadRepCoverage } from '@/lib/coverage/load'
import { acknowledgeReadiness } from '@/lib/coverage/actions'

export const dynamic = 'force-dynamic'

/** The rep's operational responsibilities for today: own + covering + readiness. */
export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const view = await loadRepCoverage(ctx.orgId, ctx.repId)
  return NextResponse.json({ coverage: view })
}

/**
 * Acknowledge device readiness for one of the rep's assigned or covered
 * profiles. Operational confirmation only — never a credential.
 */
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const profileId = typeof body.profileId === 'string' ? body.profileId : ''
  if (!profileId) return NextResponse.json({ error: 'profileId is required' }, { status: 400 })

  const view = await loadRepCoverage(ctx.orgId, ctx.repId)
  const known = [...view.own, ...view.covering].some((profile) => profile.profileId === profileId)
  if (!known) {
    return NextResponse.json({ error: 'Profile is not assigned to you' }, { status: 403 })
  }

  const result = await acknowledgeReadiness({
    organizationId: ctx.orgId,
    profileId,
    repId: ctx.repId,
    note: typeof body.note === 'string' ? body.note.slice(0, 500) : null,
    actorRepId: ctx.repId,
  })
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'Failed' }, { status: 500 })

  const updated = await loadRepCoverage(ctx.orgId, ctx.repId)
  return NextResponse.json({ ok: true, coverage: updated })
}
