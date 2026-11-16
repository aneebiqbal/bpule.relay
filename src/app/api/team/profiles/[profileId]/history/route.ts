import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Operational audit timeline for one person.
 *
 * Reads the existing audit authorities — knowledge edits, identity assignment
 * and target changes, coverage events, acknowledgements — and normalises them
 * into one timeline. It never invents values: each event carries only what the
 * source row recorded.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ profileId: string }> },
) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!ctx.isAdmin && !can(ctx, 'MANAGE_REVENUE_IDENTITIES')) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { profileId: id } = await params
  const client = await createServerSupabase()
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('id, person_id')
    .eq('id', id)
    .eq('organization_id', ctx.orgId)
    .maybeSingle()
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })
  if (!profile) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })

  const personKey = (profile.person_id as string | null) ?? (profile.id as string)
  const { data: profileRows } = await client
    .from('profiles')
    .select('id')
    .eq('organization_id', ctx.orgId)
    .or(`id.eq.${personKey},person_id.eq.${personKey}`)
    .limit(50)
  const profileIds = (profileRows ?? []).map((row) => row.id as string)

  const { data: identityRows } = await client
    .from('revenue_identities')
    .select('id')
    .eq('organization_id', ctx.orgId)
    .in('profile_id', profileIds)
    .limit(50)
  const identityIds = (identityRows ?? []).map((row) => row.id as string)

  const [knowledge, identityAudit, coverage, acknowledgements] = await Promise.all([
    client.from('accountability_audit_log').select('*').eq('organization_id', ctx.orgId).eq('target_table', 'profile_knowledge').in('target_id', profileIds).order('created_at', { ascending: false }).limit(200),
    identityIds.length > 0
      ? client.from('accountability_audit_log').select('*').eq('organization_id', ctx.orgId).in('revenue_identity_id', identityIds).order('created_at', { ascending: false }).limit(200)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    client.from('coverage_events').select('*').eq('organization_id', ctx.orgId).in('profile_id', profileIds).order('created_at', { ascending: false }).limit(200),
    client.from('responsibility_acknowledgements').select('*').eq('organization_id', ctx.orgId).in('profile_id', profileIds).order('created_at', { ascending: false }).limit(200),
  ])

  const repIds = [
    ...new Set(
      [
        ...((identityAudit.data ?? []) as Array<{ rep_id?: string | null }>).map((row) => row.rep_id),
        ...((knowledge.data ?? []) as Array<{ actor_id?: string | null }>).map((row) => row.actor_id),
        ...((coverage.data ?? []) as Array<{ actor_rep_id?: string | null }>).map((row) => row.actor_rep_id),
      ].filter((value): value is string => Boolean(value)),
    ),
  ]
  const { data: repRows } = repIds.length > 0
    ? await client.from('reps').select('id, name').eq('organization_id', ctx.orgId).in('id', repIds).limit(200)
    : { data: [] as Array<{ id: string; name: string }> }
  const repNameById = new Map((repRows ?? []).map((row) => [row.id, row.name]))

  const actor = (value: string | null | undefined) => (value ? repNameById.get(value) ?? 'Unknown' : 'System')
  const events: Array<Record<string, unknown>> = []

  for (const row of (knowledge.data ?? []) as Array<Record<string, unknown>>) {
    const before = (row.previous_value ?? null) as Record<string, unknown> | null
    const after = (row.new_value ?? null) as Record<string, unknown> | null
    const detail = after ?? before
    events.push({
      id: row.id,
      at: row.created_at,
      kind: 'knowledge',
      actor: actor(row.actor_id as string | null),
      action: String(detail?.action ?? 'update'),
      entity: String(detail?.entity ?? 'profile'),
      target: detail?.field ? String(detail.field) : null,
      before: before?.value ?? null,
      after: after?.value ?? null,
      reason: detail?.reason ? String(detail.reason) : null,
    })
  }
  for (const row of (identityAudit.data ?? []) as Array<Record<string, unknown>>) {
    events.push({
      id: row.id,
      at: row.created_at,
      kind: 'assignment',
      actor: actor(row.rep_id as string | null),
      action: String(row.event_type ?? 'change'),
      entity: 'identity',
      target: row.revenue_identity_id ? String(row.revenue_identity_id) : null,
      before: null,
      after: row.detail ?? null,
      reason: null,
    })
  }
  for (const row of (coverage.data ?? []) as Array<Record<string, unknown>>) {
    events.push({
      id: row.id,
      at: row.created_at,
      kind: 'coverage',
      actor: actor(row.actor_rep_id as string | null),
      action: String(row.event_type ?? 'coverage'),
      entity: 'profile',
      target: row.primary_rep_id ? String(row.primary_rep_id) : null,
      before: null,
      after: row.reason ? String(row.reason) : null,
      reason: row.reason ? String(row.reason) : null,
    })
  }
  for (const row of (acknowledgements.data ?? []) as Array<Record<string, unknown>>) {
    events.push({
      id: row.id,
      at: row.acknowledged_at ?? row.access_issue_at ?? row.created_at,
      kind: 'acknowledgement',
      actor: actor(row.rep_id as string | null),
      action: row.access_issue ? 'access_issue' : row.acknowledged_at ? 'acknowledge' : 'assigned',
      entity: String(row.subject ?? 'PRIMARY').toLowerCase(),
      target: null,
      before: null,
      after: row.access_issue ? String(row.access_issue) : null,
      reason: row.access_issue_note ? String(row.access_issue_note) : null,
    })
  }

  events.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')))

  return NextResponse.json({ events: events.slice(0, 300) })
}
