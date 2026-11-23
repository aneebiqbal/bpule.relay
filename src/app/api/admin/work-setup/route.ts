import { NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { safeErrorResponse } from '@/lib/errors'
import { loadWorkSetup } from '@/lib/operations/work-setup'
import { saveWorkSetup, type WorkSetupAllocation, type WorkSetupTargetLane } from '@/lib/operations/work-setup-write'

export const dynamic = 'force-dynamic'

/**
 * Admin → Work Setup.
 *
 * GET returns the canonical account/seat/target rows used by the one management
 * surface. POST is the single assignment + target write path; it never writes
 * coverage, eligibility, plan or allocation tables directly from a component.
 */

async function requireWorkSetupManager() {
  const ctx = await getAuthContext()
  if (!ctx) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  if (!can(ctx, 'MANAGE_TEAM_TARGETS') && !can(ctx, 'MANAGE_REVENUE_IDENTITIES')) {
    return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  }
  return { ctx, supabase: await createServerSupabase() }
}

export async function GET() {
  const auth = await requireWorkSetupManager()
  if (auth.error) return auth.error
  try {
    const payload = await loadWorkSetup(auth.supabase, { orgId: auth.ctx.orgId })
    return NextResponse.json(payload)
  } catch (error) {
    return safeErrorResponse(error, 500, 'Failed to load work setup.', 'admin/work-setup')
  }
}

export async function POST(request: Request) {
  const auth = await requireWorkSetupManager()
  if (auth.error) return auth.error

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const identityId = typeof body.identityId === 'string' ? body.identityId.trim() : ''
  const primaryRepId = typeof body.primaryRepId === 'string' ? body.primaryRepId.trim() : ''
  if (!identityId || !primaryRepId) {
    return NextResponse.json({ error: 'identityId and primaryRepId are required.' }, { status: 400 })
  }

  const parseSeats = (raw: unknown): Array<{ repId: string; priority?: number }> =>
    Array.isArray(raw)
      ? raw
          .map((row) => (row !== null && typeof row === 'object' ? (row as { repId?: unknown; priority?: unknown }) : null))
          .filter((row): row is { repId?: unknown; priority?: unknown } => row !== null)
          .map((row) => ({
            repId: typeof row.repId === 'string' ? row.repId.trim() : '',
            priority: typeof row.priority === 'number' ? row.priority : undefined,
          }))
          .filter((row) => row.repId)
      : []

  const parseTargets = (raw: unknown): WorkSetupTargetLane[] | undefined => {
    if (!Array.isArray(raw)) return undefined
    const rows = raw
      .map((row) => (row !== null && typeof row === 'object' ? (row as { activityType?: unknown; targetCount?: unknown }) : null))
      .filter((row): row is { activityType?: unknown; targetCount?: unknown } => row !== null)
      .map((row) => ({
        activityType: typeof row.activityType === 'string' ? (row.activityType.trim() as WorkSetupTargetLane['activityType']) : '',
        targetCount: Number(row.targetCount),
      }))
      .filter((row) => row.activityType)
    return rows as WorkSetupTargetLane[]
  }

  const parseAllocations = (raw: unknown): WorkSetupAllocation[] | undefined => {
    if (!Array.isArray(raw)) return undefined
    const rows = raw
      .map((row) => (row !== null && typeof row === 'object' ? (row as { activityType?: unknown; repId?: unknown; targetCount?: unknown }) : null))
      .filter((row): row is { activityType?: unknown; repId?: unknown; targetCount?: unknown } => row !== null)
      .map((row) => ({
        activityType: typeof row.activityType === 'string' ? (row.activityType.trim() as WorkSetupAllocation['activityType']) : '',
        repId: typeof row.repId === 'string' ? row.repId.trim() : '',
        targetCount: Number(row.targetCount),
      }))
      .filter((row) => row.activityType && row.repId)
    return rows as WorkSetupAllocation[]
  }

  try {
    const result = await saveWorkSetup(auth.supabase, {
      orgId: auth.ctx.orgId,
      identityId,
      primaryRepId,
      operators: parseSeats(body.operators),
      backups: parseSeats(body.backups),
      actorRepId: auth.ctx.repId,
      targets: parseTargets(body.targets),
      allocations: parseAllocations(body.allocations),
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? 'Could not save work setup.' }, { status: 400 })
    }
    return NextResponse.json(result)
  } catch (error) {
    return safeErrorResponse(error, 500, 'Failed to save work setup.', 'admin/work-setup')
  }
}
