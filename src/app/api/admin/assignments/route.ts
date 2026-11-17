import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { createServerSupabase } from '@/lib/supabase/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { safeErrorResponse } from '@/lib/errors'
import { addOperatorResponsibility } from '@/lib/profiles/assignment'

async function requireCapabilityStore(capability: string) {
  const authCtx = await getAuthContext()
  if (!authCtx) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  if (!can(authCtx, capability)) return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  try {
    return { ctx: authCtx, store: await createScoutStore() }
  } catch {
    return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  }
}

export async function GET(request: Request) {
  const auth = await requireCapabilityStore('MANAGE_REVENUE_IDENTITIES')
  if (auth.error) return auth.error

  const { searchParams } = new URL(request.url)
  const repId = searchParams.get('repId')

  try {
    const assignments = await auth.store.listIdentityAssignmentsAdmin()
    return NextResponse.json({
      assignments: repId ? assignments.filter((a) => a.repId === repId) : assignments,
    })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Failed to load assignments.', 'admin/assignments')
  }
}

export async function POST(request: Request) {
  const auth = await requireCapabilityStore('MANAGE_REVENUE_IDENTITIES')
  if (auth.error) return auth.error

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  let identityId = ''
  if (typeof body.identityId === 'string') identityId = body.identityId.trim()
  else if (typeof body.revenueIdentityId === 'string') identityId = body.revenueIdentityId.trim()
  const repId = typeof body.repId === 'string' ? body.repId.trim() : ''
  if (!identityId || !repId) {
    return NextResponse.json({ error: 'identityId and repId are required.' }, { status: 400 })
  }

  try {
    // Canonical write: appends the rep as an active OPERATOR on the identity's
    // profile and preserves every other seat. Eligibility alone is not enough —
    // execution visibility is decided by the coverage seat.
    const supabase = await createServerSupabase()
    await addOperatorResponsibility(supabase, {
      orgId: auth.ctx.orgId,
      identityId,
      repId,
      actorRepId: auth.ctx.repId,
    })
    return NextResponse.json({ ok: true, identityId, repId }, { status: 201 })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Failed to assign identity.', 'admin/assignments')
  }
}
