import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { safeErrorResponse } from '@/lib/errors'
import { executeRetention, previewRetention } from '@/lib/retention/executor'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const ctx = await getAuthContext()
  if (!ctx) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  if (!ctx.isAdmin && !ctx.isOwner) return { error: NextResponse.json({ error: 'Admin only.' }, { status: 403 }) }
  return { ctx, supabase: await createServerSupabase() }
}

/** Read-only eligibility preview + protected-reference counts. */
export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  try {
    return NextResponse.json(await previewRetention(auth.supabase))
  } catch (error) {
    return safeErrorResponse(error, 500, 'Could not preview retention.', 'admin/retention')
  }
}

/**
 * Execute the ephemeral cleanup. Without `confirm: true` this is a dry run and
 * deletes nothing — the safe default.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  try {
    const result = await executeRetention(auth.supabase, {
      dryRun: body.confirm !== true,
      actorRepId: auth.ctx.repId,
      organizationId: auth.ctx.orgId,
    })
    return NextResponse.json(result)
  } catch (error) {
    return safeErrorResponse(error, 500, 'Could not run retention.', 'admin/retention')
  }
}
