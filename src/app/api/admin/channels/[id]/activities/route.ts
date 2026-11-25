import { NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { safeErrorResponse } from '@/lib/errors'
import { parseActivityDraft } from '@/lib/execution/channel-admin'
import { businessDateForOrg } from '@/lib/org-clock/load'

export const dynamic = 'force-dynamic'

async function requireOwnedChannel(id: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  if (!can(ctx, 'MANAGE_TEAM_TARGETS') && !can(ctx, 'MANAGE_REVENUE_IDENTITIES')) {
    return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  }
  const supabase = await createServerSupabase()
  const { data: channel, error } = await supabase
    .from('execution_channels')
    .select('id')
    .eq('id', id)
    .eq('organization_id', ctx.orgId)
    .maybeSingle()
  if (error) return { error: safeErrorResponse(error, 500, 'Failed to load the channel.', 'admin/channels/[id]/activities') }
  if (!channel) return { error: NextResponse.json({ error: 'Not found.' }, { status: 404 }) }
  return { ctx, supabase }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireOwnedChannel(id)
  if (auth.error) return auth.error
  try {
    const { data, error } = await auth.supabase
      .from('execution_activity_definitions')
      .select('*')
      .eq('channel_id', id)
      .order('key')
      .limit(200)
    if (error) return safeErrorResponse(error, 500, 'Failed to load activities.', 'admin/channels/[id]/activities')
    return NextResponse.json({ activities: data ?? [] })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Failed to load activities.', 'admin/channels/[id]/activities')
  }
}

/** Add a measurable activity. The key is immutable after creation. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireOwnedChannel(id)
  if (auth.error) return auth.error

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  if (typeof body.label !== 'string' || body.label.trim() === '') {
    return NextResponse.json({ error: 'A label is required.' }, { status: 400 })
  }

  const parsed = parseActivityDraft(body, true)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const { data: existing } = await auth.supabase
      .from('execution_activity_definitions')
      .select('id')
      .eq('channel_id', id)
      .eq('key', parsed.value.key)
      .maybeSingle()
    if (existing) return NextResponse.json({ error: 'That activity key already exists on this channel.' }, { status: 409 })

    const { data, error } = await auth.supabase
      .from('execution_activity_definitions')
      .insert({
        channel_id: id,
        organization_id: auth.ctx.orgId,
        key: parsed.value.key,
        label: parsed.value.label,
        description: parsed.value.description,
        counting_mode: parsed.value.countingMode,
        evidence_policy: parsed.value.evidencePolicy,
        targetable: parsed.value.targetable,
        enabled: true,
        effort_minutes: parsed.value.effortMinutes,
        recording_modes: parsed.value.recordingModes,
        outcome_class: parsed.value.outcomeClass,
        version: 1,
        // Organization business date, never server-local: a definition created
        // late in the day must be usable for that same business day.
        effective_from: await businessDateForOrg(auth.ctx.orgId).catch(() => new Date().toISOString().slice(0, 10)),
        created_by: auth.ctx.repId,
      })
      .select('*')
      .single()
    if (error) return safeErrorResponse(error, 500, 'Could not create the activity.', 'admin/channels/[id]/activities')
    return NextResponse.json({ activity: data }, { status: 201 })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Could not create the activity.', 'admin/channels/[id]/activities')
  }
}
