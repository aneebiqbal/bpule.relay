import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { safeErrorResponse } from '@/lib/errors'
import {
  assignBackupResponsibility,
  assignPrimaryResponsibility,
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

  try {
    const result = await removeResponsibility(auth.client, {
      orgId: auth.authCtx.orgId,
      identityId,
      repId,
      actorRepId: auth.authCtx.repId,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Failed to remove responsibility.', 'admin/responsibilities')
  }
}
