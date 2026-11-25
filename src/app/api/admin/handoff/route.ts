import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { safeErrorResponse } from '@/lib/errors'
import { assembleHandoffPlan, executeHandoff, loadHandoffInput } from '@/lib/handoff/service'

export const dynamic = 'force-dynamic'

async function requireHandoffManager() {
  const ctx = await getAuthContext()
  if (!ctx) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  // Ownership transfer is an admin/owner operation; the row-level policies on
  // responsibility_handoffs require org-admin, so do not advertise a capability
  // that would later fail at the database boundary.
  if (!ctx.isAdmin && !ctx.isOwner) {
    return { error: NextResponse.json({ error: 'Admin only.' }, { status: 403 }) }
  }
  return { ctx, supabase: await createServerSupabase() }
}

/** Read-only impact preview. */
export async function GET(request: Request) {
  const auth = await requireHandoffManager()
  if (auth.error) return auth.error
  const url = new URL(request.url)
  const fromRepId = url.searchParams.get('fromRepId') ?? ''
  const toRepId = url.searchParams.get('toRepId') ?? ''
  if (!fromRepId) return NextResponse.json({ error: 'fromRepId is required.' }, { status: 400 })

  try {
    const input = await loadHandoffInput(auth.supabase, auth.ctx.orgId, fromRepId, toRepId, auth.ctx.repId)
    const plan = assembleHandoffPlan(input)
    return NextResponse.json({
      plan,
      detail: {
        identities: input.identities,
        coverage: input.coverage,
        allocations: input.allocations,
        leads: input.leads.slice(0, 200),
        tasks: input.tasks.slice(0, 200),
        applications: input.applications,
        preparedJobs: input.preparedJobs,
        accessIssues: input.accessIssues,
      },
    })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Could not build the handoff preview.', 'admin/handoff')
  }
}

/** Execute the transfer. Durable operation id is returned. */
export async function POST(request: Request) {
  const auth = await requireHandoffManager()
  if (auth.error) return auth.error

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const fromRepId = typeof body.fromRepId === 'string' ? body.fromRepId : ''
  const toRepId = typeof body.toRepId === 'string' ? body.toRepId : ''
  if (!fromRepId || !toRepId) {
    return NextResponse.json({ error: 'fromRepId and toRepId are required.' }, { status: 400 })
  }

  try {
    const input = await loadHandoffInput(auth.supabase, auth.ctx.orgId, fromRepId, toRepId, auth.ctx.repId)
    const result = await executeHandoff(auth.supabase, input, typeof body.operationId === 'string' ? body.operationId : undefined, {
      suspendFromRep: body.suspendFromRep === true,
    })
    return NextResponse.json(result, { status: result.status === 'failed' ? 422 : 200 })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Could not execute the handoff.', 'admin/handoff')
  }
}
