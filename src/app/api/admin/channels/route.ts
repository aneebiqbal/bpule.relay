import { NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { safeErrorResponse } from '@/lib/errors'
import { parseChannelDraft } from '@/lib/execution/channel-admin'

export const dynamic = 'force-dynamic'

async function requireChannelManager() {
  const ctx = await getAuthContext()
  if (!ctx) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  if (!can(ctx, 'MANAGE_TEAM_TARGETS') && !can(ctx, 'MANAGE_REVENUE_IDENTITIES')) {
    return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  }
  return { ctx, supabase: await createServerSupabase() }
}

/** List built-in templates plus this organization's custom channels. */
export async function GET() {
  const auth = await requireChannelManager()
  if (auth.error) return auth.error
  try {
    const [system, custom] = await Promise.all([
      auth.supabase.from('execution_channels').select('*').is('organization_id', null).limit(100),
      auth.supabase.from('execution_channels').select('*').eq('organization_id', auth.ctx.orgId).limit(100),
    ])
    if (system.error) throw system.error
    if (custom.error) throw custom.error
    const ids = [...(system.data ?? []), ...(custom.data ?? [])].map((row) => (row as { id: string }).id)
    const activities = ids.length
      ? await auth.supabase.from('execution_activity_definitions').select('*').in('channel_id', ids).limit(500)
      : { data: [], error: null }
    if (activities.error) throw activities.error
    return NextResponse.json({
      channels: [...(system.data ?? []), ...(custom.data ?? [])],
      activities: activities.data ?? [],
    })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Failed to load channels.', 'admin/channels')
  }
}

/** Create an org-scoped custom channel. Slugs are unique per organization. */
export async function POST(request: Request) {
  const auth = await requireChannelManager()
  if (auth.error) return auth.error

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const parsed = parseChannelDraft(body, true)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const { data: existing } = await auth.supabase
      .from('execution_channels')
      .select('id')
      .eq('organization_id', auth.ctx.orgId)
      .eq('slug', parsed.value.slug)
      .maybeSingle()
    if (existing) return NextResponse.json({ error: 'That channel slug already exists.' }, { status: 409 })

    const { data, error } = await auth.supabase
      .from('execution_channels')
      .insert({
        organization_id: auth.ctx.orgId,
        slug: parsed.value.slug,
        name: parsed.value.name,
        description: parsed.value.description,
        template: parsed.value.template,
        operation_mode: parsed.value.operationMode,
        identity_requirements: parsed.value.identityRequirements,
        enabled: true,
        revision: 1,
        created_by: auth.ctx.repId,
      })
      .select('*')
      .single()
    if (error) return safeErrorResponse(error, 500, 'Could not create the channel.', 'admin/channels')
    return NextResponse.json({ channel: data }, { status: 201 })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Could not create the channel.', 'admin/channels')
  }
}
