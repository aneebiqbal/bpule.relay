import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { setIdentityLifecycle, type IdentityLifecycleStatus } from '@/lib/profiles/lifecycle'

export const dynamic = 'force-dynamic'

const STATUSES: IdentityLifecycleStatus[] = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED']

/**
 * Change a channel's lifecycle state.
 *
 * Admin/manager capability only, explicit confirm + reason. Every state change
 * is audited; the identity row is updated, never deleted.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!can(ctx, 'MANAGE_REVENUE_IDENTITIES')) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  let body: { status?: unknown; reason?: unknown; confirm?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const rawStatus = typeof body.status === 'string' ? body.status.toUpperCase() : ''
  if (!STATUSES.includes(rawStatus as IdentityLifecycleStatus)) {
    return NextResponse.json({ error: `status must be one of ${STATUSES.join(', ')}.` }, { status: 400 })
  }
  const to: IdentityLifecycleStatus = rawStatus as IdentityLifecycleStatus
  if (body.confirm !== true) {
    return NextResponse.json({ error: 'Set confirm to true to change the channel status.' }, { status: 400 })
  }

  const client = await createServerSupabase()
  const result = await setIdentityLifecycle(client, {
    organizationId: ctx.orgId,
    identityId: id,
    to,
    reason: typeof body.reason === 'string' ? body.reason : '',
    actorRepId: ctx.repId,
  })
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'Could not update the channel.' }, { status: 400 })
  return NextResponse.json({ ok: true, from: result.from, to: result.to })
}
