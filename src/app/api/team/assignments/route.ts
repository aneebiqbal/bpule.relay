import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { configureCoverage } from '@/lib/coverage/actions'

export const dynamic = 'force-dynamic'

/**
 * Unified assignment workspace.
 *
 * One canonical write for a whole profile chain (PRIMARY + OPERATOR seats +
 * BACKUP chain). Bulk requests apply item by item and report per-item results,
 * so a partial failure is visible and never silently half-applied. A dry run
 * validates scope and seats and returns the effective chain without writing.
 *
 * `configureCoverage` is replace-and-reconcile, so resubmitting the same item
 * is idempotent — no duplicate seats, no duplicated audit rows.
 */

interface SeatInput {
  repId?: unknown
  priority?: unknown
}

interface ItemInput {
  profileId?: unknown
  primaryRepId?: unknown
  operators?: unknown
  backups?: unknown
}

function parseSeats(raw: unknown): SeatInput[] {
  return Array.isArray(raw) ? raw.map((row) => (row !== null && typeof row === 'object' ? row as SeatInput : {})) : []
}

function parseItems(raw: unknown): ItemInput[] {
  return Array.isArray(raw) ? raw.map((row) => (row !== null && typeof row === 'object' ? row as ItemInput : {})) : []
}

async function requireAssignmentManager() {
  const ctx = await getAuthContext()
  if (!ctx) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  if (!ctx.isAdmin && !can(ctx, 'MANAGE_REVENUE_IDENTITIES')) {
    return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  }
  return { ctx, supabase: await createServerSupabase() }
}

export async function POST(req: NextRequest) {
  const auth = await requireAssignmentManager()
  if (auth.error) return auth.error

  const body = (await req.json().catch(() => ({}))) as { items?: unknown; dryRun?: unknown }
  const dryRun = body.dryRun === true
  const items = parseItems(body.items)
  if (items.length === 0) {
    return NextResponse.json({ error: 'items is required.' }, { status: 400 })
  }
  if (items.length > 100) {
    return NextResponse.json({ error: 'A bulk request may contain at most 100 profiles.' }, { status: 400 })
  }

  const profileIds = [...new Set(items.map((item) => (typeof item.profileId === 'string' ? item.profileId : '')).filter(Boolean))]
  const { data: profileRows, error: profileError } = await auth.supabase
    .from('profiles')
    .select('id, display_name, full_name, label')
    .eq('organization_id', auth.ctx.orgId)
    .in('id', profileIds)
    .limit(200)
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })
  const profileById = new Map((profileRows ?? []).map((row) => [row.id as string, row]))

  const namedRepIds = [
    ...new Set(
      items.flatMap((item) => [
        typeof item.primaryRepId === 'string' ? item.primaryRepId : '',
        ...parseSeats(item.operators).map((seat) => (typeof seat.repId === 'string' ? seat.repId : '')),
        ...parseSeats(item.backups).map((seat) => (typeof seat.repId === 'string' ? seat.repId : '')),
      ].filter(Boolean)),
    ),
  ]
  const { data: repRows, error: repError } = await auth.supabase
    .from('reps')
    .select('id, name')
    .eq('organization_id', auth.ctx.orgId)
    .in('id', namedRepIds)
    .limit(500)
  if (repError) return NextResponse.json({ error: repError.message }, { status: 500 })
  const repById = new Map((repRows ?? []).map((row) => [row.id as string, row]))

  const preview: Array<{
    profileId: string
    profileName: string
    ok: boolean
    errors: string[]
    chain: Array<{ repId: string; repName: string; role: 'PRIMARY' | 'OPERATOR' | 'BACKUP'; priority: number }>
  }> = []
  const applicable: Array<{
    profileId: string
    primaryRepId: string
    operators: Array<{ repId: string; priority: number }>
    backups: Array<{ repId: string; priority: number }>
  }> = []

  for (const item of items) {
    const profileId = typeof item.profileId === 'string' ? item.profileId : ''
    const primaryRepId = typeof item.primaryRepId === 'string' ? item.primaryRepId : ''
    const profile = profileById.get(profileId)
    const errors: string[] = []
    if (!profileId || !profile) errors.push('Profile not found in this organization')
    if (!primaryRepId) errors.push('primaryRepId is required')
    if (primaryRepId && !repById.has(primaryRepId)) errors.push('Primary rep not found in this organization')

    const dedupe = (seats: SeatInput[], role: 'OPERATOR' | 'BACKUP') => {
      const seen = new Set<string>()
      const out: Array<{ repId: string; priority: number }> = []
      for (const [index, seat] of seats.entries()) {
        const repId = typeof seat.repId === 'string' ? seat.repId : ''
        if (!repId || seen.has(repId)) continue
        if (!repById.has(repId)) {
          errors.push(`${role.toLowerCase()} rep not found in this organization`)
          continue
        }
        if (repId === primaryRepId) {
          errors.push('The primary rep cannot also be an operator or backup')
          continue
        }
        seen.add(repId)
        out.push({ repId, priority: index + 1 })
      }
      return out
    }
    const operators = dedupe(parseSeats(item.operators), 'OPERATOR')
    const backups = dedupe(parseSeats(item.backups), 'BACKUP')
    const operatorIds = new Set(operators.map((seat) => seat.repId))
    for (const backup of backups) {
      if (operatorIds.has(backup.repId)) errors.push('A rep cannot be both an operator and a backup')
    }

    const chain = [
      ...(primaryRepId && repById.has(primaryRepId)
        ? [{ repId: primaryRepId, repName: repById.get(primaryRepId)!.name, role: 'PRIMARY' as const, priority: 1 }]
        : []),
      ...operators.map((seat) => ({ repId: seat.repId, repName: repById.get(seat.repId)?.name ?? 'Unknown', role: 'OPERATOR' as const, priority: seat.priority })),
      ...backups.map((seat) => ({ repId: seat.repId, repName: repById.get(seat.repId)?.name ?? 'Unknown', role: 'BACKUP' as const, priority: seat.priority })),
    ]
    preview.push({
      profileId,
      profileName: profile ? ((profile.display_name ?? profile.full_name ?? profile.label) || 'Unnamed profile') : 'Unknown profile',
      ok: errors.length === 0,
      errors,
      chain,
    })
    if (errors.length === 0 && primaryRepId) {
      applicable.push({ profileId, primaryRepId, operators, backups })
    }
  }

  if (dryRun) {
    return NextResponse.json({ dryRun: true, results: preview })
  }

  const results = []
  for (const item of applicable) {
    const result = await configureCoverage({
      organizationId: auth.ctx.orgId,
      profileId: item.profileId,
      primaryRepId: item.primaryRepId,
      operators: item.operators,
      backups: item.backups,
      actorRepId: auth.ctx.repId,
      client: auth.supabase,
      ensureTargets: true,
    })
    results.push({
      profileId: item.profileId,
      ok: result.ok,
      error: result.ok ? null : result.error ?? 'Configure failed',
    })
  }

  return NextResponse.json({ dryRun: false, results, rejected: preview.filter((row) => !row.ok) })
}
