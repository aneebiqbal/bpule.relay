import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { configureCoverage } from '@/lib/coverage/actions'

export const dynamic = 'force-dynamic'

/**
 * Configure the ordered primary/backup chain for one profile.
 *
 * Configuration is stored even when a backup is not yet eligible — eligibility
 * is proven by `identity_assignments` at evaluation time, never by this row.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ profileId: string }> },
) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { profileId } = await params
  const body = (await req.json().catch(() => ({}))) as {
    primaryRepId?: unknown
    backups?: unknown
  }
  const primaryRepId = typeof body.primaryRepId === 'string' ? body.primaryRepId : ''
  const rawBackups: unknown[] = Array.isArray(body.backups) ? body.backups : []
  const backups: Array<{ repId?: unknown }> = rawBackups.map((row) =>
    row !== null && typeof row === 'object' ? (row as { repId?: unknown }) : {},
  )

  if (!primaryRepId) {
    return NextResponse.json({ error: 'primaryRepId is required' }, { status: 400 })
  }
  if (backups.some((row) => row?.repId === primaryRepId)) {
    return NextResponse.json({ error: 'The primary rep cannot also be a backup' }, { status: 400 })
  }

  const supabase = await createServerSupabase()
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', profileId)
    .eq('organization_id', ctx.orgId)
    .maybeSingle()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const repIds = [primaryRepId, ...backups.map((row) => row?.repId).filter((id): id is string => Boolean(id))]
  const { data: repRows } = await supabase
    .from('reps')
    .select('id')
    .eq('organization_id', ctx.orgId)
    .in('id', [...new Set(repIds)])
  const known = new Set(((repRows ?? []) as Array<{ id: string }>).map((row) => row.id))
  if (!known.has(primaryRepId)) {
    return NextResponse.json({ error: 'Primary rep not found in organization' }, { status: 400 })
  }
  const unknown = [...new Set(repIds)].filter((id) => !known.has(id))
  if (unknown.length > 0) {
    return NextResponse.json({ error: 'Backup rep not found in organization' }, { status: 400 })
  }

  const seen = new Set<string>()
  const ordered = backups
    .filter((row) => typeof row?.repId === 'string')
    .map((row, index) => ({ repId: row.repId as string, priority: index + 1 }))
    .filter((row) => {
      if (seen.has(row.repId)) return false
      seen.add(row.repId)
      return true
    })

  const result = await configureCoverage({
    organizationId: ctx.orgId,
    profileId,
    primaryRepId,
    backups: ordered,
    actorRepId: ctx.repId,
  })
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'Configure failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
