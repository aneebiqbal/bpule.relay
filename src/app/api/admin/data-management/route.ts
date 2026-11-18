import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import {
  findDuplicateCandidates,
  inspectIdentityDependencies,
  deleteIdentityIfEligible,
} from '@/lib/profiles/data-management'

export const dynamic = 'force-dynamic'

/**
 * Data management: duplicate candidates and dependency inspection.
 *
 * GET  ?identityId=… → duplicates + that identity's dependency report
 * POST { identityId, confirm: true } → delete only when nothing references it
 */

async function requireManager() {
  const ctx = await getAuthContext()
  if (!ctx) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  if (!can(ctx, 'MANAGE_REVENUE_IDENTITIES')) {
    return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  }
  return { ctx, client: await createServerSupabase() }
}

export async function GET(request: Request) {
  const auth = await requireManager()
  if (auth.error) return auth.error
  const { ctx, client } = auth
  const identityId = new URL(request.url).searchParams.get('identityId')

  try {
    const duplicates = await findDuplicateCandidates(client, ctx.orgId)
    const report = identityId
      ? await inspectIdentityDependencies(client, ctx.orgId, identityId)
      : null
    return NextResponse.json({ duplicates, report })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load data management.' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  const auth = await requireManager()
  if (auth.error) return auth.error
  const { ctx, client } = auth

  let body: { identityId?: unknown; confirm?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const identityId = typeof body.identityId === 'string' ? body.identityId : ''
  if (!identityId) return NextResponse.json({ error: 'identityId is required.' }, { status: 400 })
  if (body.confirm !== true) {
    return NextResponse.json({ error: 'Set confirm to true to delete.' }, { status: 400 })
  }

  try {
    const result = await deleteIdentityIfEligible(client, ctx.orgId, identityId, ctx.repId)
    if (!result.ok) {
      return NextResponse.json(
        { error: 'This record has protected dependencies and cannot be deleted.', report: result.report },
        { status: 409 },
      )
    }
    return NextResponse.json({ ok: true, report: result.report })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Delete failed.' },
      { status: 500 },
    )
  }
}
