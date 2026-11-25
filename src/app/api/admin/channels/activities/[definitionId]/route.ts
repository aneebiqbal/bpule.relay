import { NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { safeErrorResponse } from '@/lib/errors'
import { parseActivityDraft } from '@/lib/execution/channel-admin'

export const dynamic = 'force-dynamic'

async function requireOwnedDefinition(definitionId: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  if (!can(ctx, 'MANAGE_TEAM_TARGETS') && !can(ctx, 'MANAGE_REVENUE_IDENTITIES')) {
    return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  }
  const supabase = await createServerSupabase()
  const { data: definition, error } = await supabase
    .from('execution_activity_definitions')
    .select('*')
    .eq('id', definitionId)
    .eq('organization_id', ctx.orgId)
    .maybeSingle()
  if (error) return { error: safeErrorResponse(error, 500, 'Failed to load the activity.', 'admin/channels/activities/[definitionId]') }
  if (!definition) return { error: NextResponse.json({ error: 'Not found.' }, { status: 404 }) }
  return { ctx, supabase, definition: definition as Record<string, unknown> }
}

/**
 * Edit an activity. Counting/evidence/targetability changes create a NEW
 * version: the previous row keeps its meaning with `effective_until` closed,
 * and a fresh current row starts today. Historical credits are never
 * reinterpreted; the key stays stable so attribution survives.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ definitionId: string }> }) {
  const { definitionId } = await params
  const auth = await requireOwnedDefinition(definitionId)
  if (auth.error) return auth.error

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const parsed = parseActivityDraft(body, false)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const previous = auth.definition
  const next = {
    label: body.label !== undefined ? parsed.value.label : (previous.label as string),
    description: body.description !== undefined ? parsed.value.description : (previous.description as string | null),
    counting_mode: body.countingMode !== undefined ? parsed.value.countingMode : (previous.counting_mode as string),
    evidence_policy: body.evidencePolicy !== undefined ? parsed.value.evidencePolicy : (previous.evidence_policy as string),
    targetable: body.targetable !== undefined ? parsed.value.targetable : Boolean(previous.targetable),
    enabled: body.enabled !== undefined ? Boolean(body.enabled) : Boolean(previous.enabled),
    effort_minutes: body.effortMinutes !== undefined ? parsed.value.effortMinutes : Number(previous.effort_minutes ?? 0),
    recording_modes: body.recordingModes !== undefined ? parsed.value.recordingModes : (previous.recording_modes as string[]),
    outcome_class: body.outcomeClass !== undefined ? parsed.value.outcomeClass : (previous.outcome_class as string | null),
  }
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)

  try {
    const closePrevious = auth.supabase
      .from('execution_activity_definitions')
      .update({ effective_until: yesterday, updated_at: new Date().toISOString() })
      .eq('id', definitionId)
      .eq('organization_id', auth.ctx.orgId)
    const insertNext = auth.supabase
      .from('execution_activity_definitions')
      .insert({
        channel_id: previous.channel_id as string,
        organization_id: auth.ctx.orgId,
        key: previous.key as string,
        version: Number(previous.version ?? 1) + 1,
        effective_from: today,
        effective_until: null,
        created_by: auth.ctx.repId,
        ...next,
      })
      .select('*')
      .single()

    let created: { activity?: Record<string, unknown>; error?: { message: string } | null } = {}
    if (auth.supabase.transaction) {
      created = await auth.supabase.transaction(async (tx) => {
        const closed = await tx
          .from('execution_activity_definitions')
          .update({ effective_until: yesterday, updated_at: new Date().toISOString() })
          .eq('id', definitionId)
          .eq('organization_id', auth.ctx.orgId)
        if (closed.error) return { error: closed.error }
        const inserted = await tx
          .from('execution_activity_definitions')
          .insert({
            channel_id: previous.channel_id as string,
            organization_id: auth.ctx.orgId,
            key: previous.key as string,
            version: Number(previous.version ?? 1) + 1,
            effective_from: today,
            effective_until: null,
            created_by: auth.ctx.repId,
            ...next,
          })
          .select('*')
          .single()
        if (inserted.error) return { error: inserted.error }
        return { activity: inserted.data as Record<string, unknown>, error: null }
      })
    } else {
      const closed = await closePrevious
      if (closed.error) return safeErrorResponse(closed.error, 500, 'Could not version the activity.', 'admin/channels/activities/[definitionId]')
      const inserted = await insertNext
      if (inserted.error) return safeErrorResponse(inserted.error, 500, 'Could not version the activity.', 'admin/channels/activities/[definitionId]')
      created = { activity: inserted.data as Record<string, unknown>, error: null }
    }
    if (created.error) {
      return safeErrorResponse(created.error, 500, 'Could not version the activity.', 'admin/channels/activities/[definitionId]')
    }
    return NextResponse.json({ activity: created.activity, versioned: true })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Could not version the activity.', 'admin/channels/activities/[definitionId]')
  }
}

/** Disable future use. History and the key are preserved. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ definitionId: string }> }) {
  const { definitionId } = await params
  const auth = await requireOwnedDefinition(definitionId)
  if (auth.error) return auth.error

  try {
    const { error } = await auth.supabase
      .from('execution_activity_definitions')
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq('id', definitionId)
      .eq('organization_id', auth.ctx.orgId)
    if (error) return safeErrorResponse(error, 500, 'Could not disable the activity.', 'admin/channels/activities/[definitionId]')
    return NextResponse.json({ ok: true, disabled: true })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Could not disable the activity.', 'admin/channels/activities/[definitionId]')
  }
}
