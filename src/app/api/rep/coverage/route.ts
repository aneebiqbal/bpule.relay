import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { loadRepCoverage } from '@/lib/coverage/load'
import { acknowledgeReadiness } from '@/lib/coverage/actions'
import {
  acknowledgeResponsibility,
  isAccessIssue,
  reportAccessIssue,
} from '@/lib/responsibility/load'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** The rep's operational responsibilities for today: own + covering + readiness + acks. */
export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const view = await loadRepCoverage(ctx.orgId, ctx.repId)
  return NextResponse.json({ coverage: view })
}

/**
 * Rep-side responsibility actions.
 *
 * - `readiness`: confirm device access for a profile (unchanged).
 * - `acknowledge`: accept a new responsibility. Separate from readiness.
 * - `access_issue`: report that the account cannot be operated. Separate from
 *   acknowledgement and never changes ownership or execution.
 */
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const action = typeof body.action === 'string' ? body.action : 'readiness'
  const profileId = typeof body.profileId === 'string' ? body.profileId : ''
  const acknowledgementId =
    typeof body.acknowledgementId === 'string' ? body.acknowledgementId : ''

  const view = await loadRepCoverage(ctx.orgId, ctx.repId)
  const knownProfile =
    [...view.own, ...view.covering, ...view.replaced].some(
      (profile) => profile.profileId === profileId,
    ) || view.acknowledgements.some((ack) => ack.profileId === profileId)

  const client = await createServerSupabase()

  if (action === 'acknowledge') {
    if (!acknowledgementId) {
      return NextResponse.json({ error: 'acknowledgementId is required' }, { status: 400 })
    }
    // A rep may only acknowledge their own responsibility.
    const owned = view.acknowledgements.some(
      (ack) => ack.id === acknowledgementId && ack.repId === ctx.repId,
    )
    if (!owned) return NextResponse.json({ error: 'Not your responsibility' }, { status: 403 })
    const result = await acknowledgeResponsibility({
      client,
      orgId: ctx.orgId,
      repId: ctx.repId,
      acknowledgementId,
    })
    if (!result.ok) return NextResponse.json({ error: result.error ?? 'Failed' }, { status: 500 })
  } else if (action === 'access_issue') {
    if (!acknowledgementId) {
      return NextResponse.json({ error: 'acknowledgementId is required' }, { status: 400 })
    }
    if (!isAccessIssue(body.issue)) {
      return NextResponse.json({ error: 'A valid issue is required' }, { status: 400 })
    }
    const owned = view.acknowledgements.some(
      (ack) => ack.id === acknowledgementId && ack.repId === ctx.repId,
    )
    if (!owned) return NextResponse.json({ error: 'Not your responsibility' }, { status: 403 })
    const result = await reportAccessIssue({
      client,
      orgId: ctx.orgId,
      repId: ctx.repId,
      acknowledgementId,
      issue: body.issue,
      note: typeof body.note === 'string' ? body.note : null,
    })
    if (!result.ok) return NextResponse.json({ error: result.error ?? 'Failed' }, { status: 500 })
  } else {
    if (!profileId) {
      return NextResponse.json({ error: 'profileId is required' }, { status: 400 })
    }
    if (!knownProfile) {
      return NextResponse.json({ error: 'Profile is not assigned to you' }, { status: 403 })
    }
    const result = await acknowledgeReadiness({
      organizationId: ctx.orgId,
      profileId,
      repId: ctx.repId,
      note: typeof body.note === 'string' ? body.note.slice(0, 500) : null,
      actorRepId: ctx.repId,
      client,
    })
    if (!result.ok) return NextResponse.json({ error: result.error ?? 'Failed' }, { status: 500 })
  }

  const updated = await loadRepCoverage(ctx.orgId, ctx.repId)
  return NextResponse.json({ ok: true, coverage: updated })
}
