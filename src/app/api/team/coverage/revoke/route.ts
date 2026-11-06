import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { revokeCoverage } from '@/lib/coverage/actions'

export const dynamic = 'force-dynamic'

/** Revoke an active coverage assignment before its expiry (admin override). */
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const profileId = typeof body.profileId === 'string' ? body.profileId : ''
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'Revoked by admin'
  if (!profileId) return NextResponse.json({ error: 'profileId is required' }, { status: 400 })

  const result = await revokeCoverage({
    organizationId: ctx.orgId,
    profileId,
    actorRepId: ctx.repId,
    reason,
  })
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'Revoke failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
