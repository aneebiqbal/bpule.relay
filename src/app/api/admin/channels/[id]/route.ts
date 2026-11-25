import { NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { safeErrorResponse } from '@/lib/errors'
import { parseChannelDraft } from '@/lib/execution/channel-admin'

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
    .select('*')
    .eq('id', id)
    .eq('organization_id', ctx.orgId)
    .maybeSingle()
  if (error) return { error: safeErrorResponse(error, 500, 'Failed to load the channel.', 'admin/channels/[id]') }
  if (!channel) return { error: NextResponse.json({ error: 'Not found.' }, { status: 404 }) }
  return { ctx, supabase, channel: channel as { id: string; revision: number } }
}

/** Edit label/mode/config. Slug, ownership and template are immutable here. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireOwnedChannel(id)
  if (auth.error) return auth.error

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const parsed = parseChannelDraft(body, false)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    revision: Number(auth.channel.revision ?? 1) + 1,
  }
  if (body.name !== undefined) patch.name = parsed.value.name
  if (body.description !== undefined) patch.description = parsed.value.description
  if (body.operationMode !== undefined) patch.operation_mode = parsed.value.operationMode
  if (body.identityRequirements !== undefined) patch.identity_requirements = parsed.value.identityRequirements
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled

  try {
    const { data, error } = await auth.supabase
      .from('execution_channels')
      .update(patch)
      .eq('id', id)
      .eq('organization_id', auth.ctx.orgId)
      .select('*')
      .single()
    if (error) return safeErrorResponse(error, 500, 'Could not update the channel.', 'admin/channels/[id]')
    return NextResponse.json({ channel: data })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Could not update the channel.', 'admin/channels/[id]')
  }
}

/**
 * Disable, never hard-delete: plans, definitions and history keep their
 * provenance. Disabling stops future planning/recording.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireOwnedChannel(id)
  if (auth.error) return auth.error

  try {
    const { error } = await auth.supabase
      .from('execution_channels')
      .update({ enabled: false, updated_at: new Date().toISOString(), revision: Number(auth.channel.revision ?? 1) + 1 })
      .eq('id', id)
      .eq('organization_id', auth.ctx.orgId)
    if (error) return safeErrorResponse(error, 500, 'Could not disable the channel.', 'admin/channels/[id]')
    return NextResponse.json({ ok: true, disabled: true })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Could not disable the channel.', 'admin/channels/[id]')
  }
}
