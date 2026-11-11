import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { reportError, safeErrorResponse } from '@/lib/errors'
import {
  addOperatorResponsibility,
  assignBackupResponsibility,
  assignPrimaryResponsibility,
  removeOperatorResponsibility,
  removeResponsibility,
  transferResponsibility,
} from '@/lib/profiles/assignment'

export const dynamic = 'force-dynamic'

/**
 * The one admin write path for responsibilities.
 *
 *   POST   → assign (or transfer with `fromRepId`)
 *   DELETE → remove
 *
 * Every variant verifies the identity and the rep belong to the caller's org
 * before touching eligibility, PRIMARY coverage or target lanes.
 */

async function requireAdmin() {
  const authCtx = await getAuthContext()
  if (!authCtx) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  if (!can(authCtx, 'MANAGE_REVENUE_IDENTITIES')) {
    return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  }
  const client = await createServerSupabase()
  return { authCtx, client }
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const identityId = typeof body.identityId === 'string' ? body.identityId.trim() : ''
  const repId = typeof body.repId === 'string' ? body.repId.trim() : ''
  const fromRepId = typeof body.fromRepId === 'string' ? body.fromRepId.trim() : ''
  if (!identityId || !repId) {
    return NextResponse.json({ error: 'identityId and repId are required.' }, { status: 400 })
  }

  // Cross-org boundary: every rep named in the request must belong to the
  // caller's organization.
  for (const namedRepId of [repId, fromRepId].filter(Boolean)) {
    const { data: repRow } = await auth.client
      .from('reps').select('id').eq('id', namedRepId).eq('organization_id', auth.authCtx.orgId).maybeSingle()
    if (!repRow) {
      return NextResponse.json({ error: 'That rep is not in your organization.' }, { status: 404 })
    }
  }

  try {
    if (fromRepId) {
      const result = await transferResponsibility(auth.client, {
        orgId: auth.authCtx.orgId,
        identityId,
        fromRepId,
        toRepId: repId,
        actorRepId: auth.authCtx.repId,
      })
      return NextResponse.json({ ok: true, transferred: true, ...result })
    }

    if (body.role === 'backup') {
      const result = await assignBackupResponsibility(auth.client, {
        orgId: auth.authCtx.orgId,
        identityId,
        repId,
        actorRepId: auth.authCtx.repId,
      })
      return NextResponse.json({ ok: true, transferred: false, backup: true, ...result })
    }

    if (body.role === 'operator') {
      const result = await addOperatorResponsibility(auth.client, {
        orgId: auth.authCtx.orgId,
        identityId,
        repId,
        actorRepId: auth.authCtx.repId,
      })
      return NextResponse.json({ ok: true, transferred: false, operator: true, ...result })
    }

    const result = await assignPrimaryResponsibility(auth.client, {
      orgId: auth.authCtx.orgId,
      identityId,
      repId,
      actorRepId: auth.authCtx.repId,
      ensureTargets: body.ensureTargets !== false,
    })
    return NextResponse.json({ ok: true, transferred: false, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'IDENTITY_NOT_FOUND') {
      return NextResponse.json({ error: 'That channel identity was not found in your organization.' }, { status: 404 })
    }
    if (message === 'IDENTITY_HAS_NO_PROFILE') {
      return NextResponse.json({ error: 'That channel has no linked person. Link a person before assigning it.' }, { status: 400 })
    }
    if (message === 'IDENTITY_ARCHIVED') {
      return NextResponse.json({ error: 'That channel is archived. Restore it before assigning it.' }, { status: 400 })
    }
    // Surface the exact failing step: the generic message is all the rep sees,
    // the log carries the request context and the driver error.
    reportError(error, {
      route: 'admin/responsibilities',
      identityId,
      repId,
      fromRepId,
      role: typeof body.role === 'string' ? body.role : 'primary',
    })
    return safeErrorResponse(error, 500, 'Failed to assign responsibility.', 'admin/responsibilities')
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const identityId = typeof body.identityId === 'string' ? body.identityId.trim() : ''
  const repId = typeof body.repId === 'string' ? body.repId.trim() : ''
  if (!identityId || !repId) {
    return NextResponse.json({ error: 'identityId and repId are required.' }, { status: 400 })
  }

  // Cross-org boundary: the rep must belong to the caller's organization.
  const { data: repRow } = await auth.client
    .from('reps').select('id').eq('id', repId).eq('organization_id', auth.authCtx.orgId).maybeSingle()
  if (!repRow) {
    return NextResponse.json({ error: 'That rep is not in your organization.' }, { status: 404 })
  }

  try {
    const result = body.role === 'primary'
      ? await removeResponsibility(auth.client, {
          orgId: auth.authCtx.orgId,
          identityId,
          repId,
          actorRepId: auth.authCtx.repId,
        })
      : await removeOperatorResponsibility(auth.client, {
          orgId: auth.authCtx.orgId,
          identityId,
          repId,
          actorRepId: auth.authCtx.repId,
        })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'IDENTITY_NOT_FOUND') {
      return NextResponse.json({ error: 'That channel identity was not found in your organization.' }, { status: 404 })
    }
    if (message === 'CANNOT_REMOVE_PRIMARY') {
      return NextResponse.json({ error: 'Transfer ownership before removing the primary owner.' }, { status: 400 })
    }
    return safeErrorResponse(error, 500, 'Failed to remove responsibility.', 'admin/responsibilities')
  }
}
