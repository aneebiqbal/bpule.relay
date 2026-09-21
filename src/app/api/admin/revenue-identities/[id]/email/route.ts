import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { safeErrorResponse } from '@/lib/errors'

type Row = Record<string, unknown>

function mapMailbox(row: Row | null): Record<string, unknown> | null {
  if (!row) return null
  return {
    id: row.id as string,
    provider: row.provider as string,
    senderEmail: row.sender_email as string,
    senderName: row.sender_name as string,
    signature: (row.signature as string) ?? null,
    status: row.status as string,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    lastConnectedAt: (row.last_connected_at as string) ?? null,
  }
}

function mapPolicy(row: Row | null): Record<string, unknown> {
  if (!row) {
    return {
      dailySendCap: 30,
      minimumDelaySeconds: 30,
      workingHoursStart: 9,
      workingHoursEnd: 17,
      timezone: 'UTC',
      followUpLimit: 1,
      suppressionRules: {},
    }
  }

  return {
    id: row.id as string,
    dailySendCap: row.daily_send_cap as number,
    minimumDelaySeconds: row.minimum_delay_seconds as number,
    workingHoursStart: row.working_hours_start as number,
    workingHoursEnd: row.working_hours_end as number,
    timezone: row.timezone as string,
    followUpLimit: row.follow_up_limit as number,
    suppressionRules: (row.suppression_rules as Record<string, unknown>) ?? {},
  }
}

async function assertIdentityBelongsToOrg(supabase: Awaited<ReturnType<typeof createServerSupabase>>, id: string, orgId: string): Promise<void> {
  const { data, error } = await supabase
    .from('revenue_identities')
    .select('id')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('NOT_FOUND')
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!can(authCtx, 'MANAGE_REVENUE_IDENTITIES')) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  try {
    const supabase = await createServerSupabase()
    await assertIdentityBelongsToOrg(supabase, id, authCtx.orgId)

    const [mailboxResult, policyResult] = await Promise.all([
      supabase
        .from('email_mailboxes')
        .select('*')
        .eq('organization_id', authCtx.orgId)
        .eq('revenue_identity_id', id)
        .maybeSingle(),
      supabase
        .from('email_sending_policies')
        .select('*')
        .eq('organization_id', authCtx.orgId)
        .eq('revenue_identity_id', id)
        .maybeSingle(),
    ])

    if (mailboxResult.error) throw mailboxResult.error
    if (policyResult.error) throw policyResult.error

    return NextResponse.json({
      mailbox: mapMailbox((mailboxResult.data ?? null) as Row | null),
      policy: mapPolicy((policyResult.data ?? null) as Row | null),
    })
  } catch (error) {
    if (error instanceof Error && /NOT_FOUND/.test(error.message)) {
      return NextResponse.json({ error: 'Revenue Identity not found.' }, { status: 404 })
    }
    return safeErrorResponse(error, 500, 'Failed to load identity email settings.', 'admin/revenue-identities/[id]/email')
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!can(authCtx, 'MANAGE_REVENUE_IDENTITIES')) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  let body: {
    mailbox?: {
      provider?: string
      senderEmail?: string
      senderName?: string
      signature?: string | null
      status?: 'CONNECTED' | 'DISCONNECTED' | 'ERROR'
      metadata?: Record<string, unknown>
    }
    policy?: {
      dailySendCap?: number
      minimumDelaySeconds?: number
      workingHoursStart?: number
      workingHoursEnd?: number
      timezone?: string
      followUpLimit?: number
      suppressionRules?: Record<string, unknown>
    }
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  try {
    const supabase = await createServerSupabase()
    await assertIdentityBelongsToOrg(supabase, id, authCtx.orgId)

    if (body.mailbox) {
      if (!body.mailbox.senderEmail || !body.mailbox.senderName) {
        return NextResponse.json({ error: 'senderEmail and senderName are required when configuring mailbox.' }, { status: 400 })
      }

      const status = body.mailbox.status ?? 'CONNECTED'
      await supabase
        .from('email_mailboxes')
        .upsert({
          organization_id: authCtx.orgId,
          revenue_identity_id: id,
          provider: body.mailbox.provider ?? 'relay_noop',
          sender_email: body.mailbox.senderEmail.trim().toLowerCase(),
          sender_name: body.mailbox.senderName.trim(),
          signature: body.mailbox.signature ?? null,
          status,
          metadata: body.mailbox.metadata ?? {},
          last_connected_at: status === 'CONNECTED' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'revenue_identity_id' })
    }

    if (body.policy) {
      await supabase
        .from('email_sending_policies')
        .upsert({
          organization_id: authCtx.orgId,
          revenue_identity_id: id,
          daily_send_cap: body.policy.dailySendCap ?? 30,
          minimum_delay_seconds: body.policy.minimumDelaySeconds ?? 30,
          working_hours_start: body.policy.workingHoursStart ?? 9,
          working_hours_end: body.policy.workingHoursEnd ?? 17,
          timezone: body.policy.timezone ?? 'UTC',
          follow_up_limit: body.policy.followUpLimit ?? 1,
          suppression_rules: body.policy.suppressionRules ?? {},
          updated_at: new Date().toISOString(),
        }, { onConflict: 'organization_id,revenue_identity_id' })
    }

    const [mailboxResult, policyResult] = await Promise.all([
      supabase
        .from('email_mailboxes')
        .select('*')
        .eq('organization_id', authCtx.orgId)
        .eq('revenue_identity_id', id)
        .maybeSingle(),
      supabase
        .from('email_sending_policies')
        .select('*')
        .eq('organization_id', authCtx.orgId)
        .eq('revenue_identity_id', id)
        .maybeSingle(),
    ])

    if (mailboxResult.error) throw mailboxResult.error
    if (policyResult.error) throw policyResult.error

    return NextResponse.json({
      mailbox: mapMailbox((mailboxResult.data ?? null) as Row | null),
      policy: mapPolicy((policyResult.data ?? null) as Row | null),
    })
  } catch (error) {
    if (error instanceof Error && /NOT_FOUND/.test(error.message)) {
      return NextResponse.json({ error: 'Revenue Identity not found.' }, { status: 404 })
    }
    return safeErrorResponse(error, 500, 'Failed to save identity email settings.', 'admin/revenue-identities/[id]/email')
  }
}
