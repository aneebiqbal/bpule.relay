import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { safeErrorResponse } from '@/lib/errors'
import {
  scanAssignmentDrift,
  repairAssignmentDrift,
  type ReconcileFinding,
} from '@/lib/profiles/reconcile'

export const dynamic = 'force-dynamic'

/**
 * Assignment reconciliation.
 *
 * GET  — read-only organisation-wide drift scan (no writes).
 * POST — apply explicitly approved findings. The scan and the repair both live in
 *        `lib/profiles/reconcile`; the route only checks authorization and
 *        requires an explicit `approve: true`.
 */

async function requireManager() {
  const authCtx = await getAuthContext()
  if (!authCtx) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  if (!can(authCtx, 'MANAGE_REVENUE_IDENTITIES')) {
    return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  }
  return { authCtx, client: await createServerSupabase() }
}

export async function GET() {
  const auth = await requireManager()
  if (auth.error) return auth.error
  try {
    const report = await scanAssignmentDrift(auth.client, auth.authCtx.orgId)
    return NextResponse.json({ report })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Could not scan assignments.', 'admin/reconciliation')
  }
}

export async function POST(request: Request) {
  const auth = await requireManager()
  if (auth.error) return auth.error

  let body: { approve?: unknown; findings?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  if (body.approve !== true) {
    return NextResponse.json({ error: 'Set approve to true to repair.' }, { status: 400 })
  }
  const requested = Array.isArray(body.findings) ? body.findings : []
  if (requested.length === 0) {
    return NextResponse.json({ error: 'No findings selected.' }, { status: 400 })
  }

  try {
    const result = await repairAssignmentDrift(
      auth.client,
      auth.authCtx.orgId,
      requested as Array<Partial<ReconcileFinding>>,
      auth.authCtx.repId,
    )
    return NextResponse.json({ ok: true, applied: result.applied, skipped: result.skipped, report: result.report })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Reconciliation failed.', 'admin/reconciliation')
  }
}
