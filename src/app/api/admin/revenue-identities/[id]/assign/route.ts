import { createServerSupabase } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { safeErrorResponse } from '@/lib/errors'
import { addOperatorResponsibility, removeOperatorResponsibility } from '@/lib/profiles/assignment'

/**
 * Assign / unassign a rep on one revenue identity.
 *
 * Both directions funnel through the canonical responsibility service, which
 * reconciles the whole profile chain (PRIMARY + OPERATOR seats + BACKUP),
 * writes identity_assignments eligibility, arms acknowledgements and audits
 * the change. Writing identity_assignments directly left the rep with
 * eligibility but no coverage seat, and execution visibility is decided by the
 * seat, so the assignee could not see the channel they were given.
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!can(authCtx, 'MANAGE_REVENUE_IDENTITIES')) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  let body: { repId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const repId = typeof body.repId === 'string' ? body.repId.trim() : ''
  if (!repId) return NextResponse.json({ error: 'repId is required.' }, { status: 400 })

  const supabase = await createServerSupabase()

  const { data: identity, error: identityError } = await supabase
    .from('revenue_identities')
    .select('id, identity_name, profile_id')
    .eq('id', id)
    .eq('organization_id', authCtx.orgId)
    .maybeSingle()
  if (identityError) return safeErrorResponse(identityError, 500, 'Failed to load identity.', 'admin/revenue-identities/[id]/assign')
  if (!identity) return NextResponse.json({ error: 'Identity not found.' }, { status: 404 })
  if (!identity.profile_id) {
    return NextResponse.json({ error: 'This channel is not linked to a profile. Link it before assigning people.' }, { status: 400 })
  }

  const { data: rep, error: repError } = await supabase
    .from('reps')
    .select('id, name')
    .eq('id', repId)
    .eq('organization_id', authCtx.orgId)
    .maybeSingle()
  if (repError) return safeErrorResponse(repError, 500, 'Failed to load rep.', 'admin/revenue-identities/[id]/assign')
  if (!rep) return NextResponse.json({ error: 'Rep not found.' }, { status: 404 })

  try {
    // Canonical write: appends the rep as an active OPERATOR and preserves every
    // other seat. Never seeds targets; those stay an explicit admin action.
    await addOperatorResponsibility(supabase, {
      orgId: authCtx.orgId,
      identityId: id,
      repId,
      actorRepId: authCtx.repId,
    })
    return NextResponse.json({ ok: true, identityId: id, repId })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Assign failed' },
      { status: 500 },
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!can(authCtx, 'MANAGE_REVENUE_IDENTITIES')) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const url = new URL(request.url)
  const repId = url.searchParams.get('repId')
  if (!repId) return NextResponse.json({ error: 'repId query param is required.' }, { status: 400 })

  const supabase = await createServerSupabase()

  try {
    // Canonical write: removes the seat AND the eligibility together. Deleting
    // only identity_assignments left the seat active, so the removed rep kept
    // executing the channel.
    await removeOperatorResponsibility(supabase, {
      orgId: authCtx.orgId,
      identityId: id,
      repId,
      actorRepId: authCtx.repId,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unassign failed'
    // Removing the primary is an ownership change, not an unassign.
    return NextResponse.json({ error: message }, { status: message === 'CANNOT_REMOVE_PRIMARY' ? 409 : 500 })
  }
}
