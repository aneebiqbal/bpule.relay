import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { validateEmailPolicyPatch } from '@/lib/email/send-limits'

export const dynamic = 'force-dynamic'

/**
 * Organization email policy — autonomy and safety.
 *
 * This table is new (migration `20261030120300_email_engine.sql`). Until it is
 * applied the route reports 409 rather than pretending the policy was saved,
 * because a silent success the send path cannot read is worse than a refusal.
 */
function isMissingTable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  const message = String((error as { message?: string } | null)?.message ?? '')
  return code === '42P01' || code === 'PGRST205' || /does not exist|schema cache/i.test(message)
}

export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const client = await createServerSupabase()
  const { data, error } = await client
    .from('organization_email_policy')
    .select('*')
    .eq('organization_id', ctx.orgId)
    .maybeSingle()

  if (error && !isMissingTable(error)) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ policy: (data ?? null) as Record<string, unknown> | null, isAdmin: ctx.isAdmin })
}

export async function PATCH(request: Request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body: unknown = await request.json().catch(() => null)
  const validation = validateEmailPolicyPatch(body)
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 })

  const patch = validation.patch

  try {
    const client = await createServerSupabase()
    const { error } = await client
      .from('organization_email_policy')
      .upsert(
        {
          organization_id: ctx.orgId,
          enabled: patch.enabled ?? true,
          autonomy_mode: patch.autonomyMode ?? 'APPROVAL_REQUIRED',
          hourly_send_cap: patch.hourlySendCap ?? 0,
          minimum_spacing_seconds: patch.minimumSpacingSeconds ?? 60,
          consecutive_failure_threshold: patch.consecutiveFailureThreshold ?? 3,
          bounce_threshold: patch.bounceThreshold ?? 1,
          weekend_policy: patch.weekendPolicy ?? 'SKIP',
          reply_cooldown_hours: patch.replyCooldownHours ?? 72,
          minimum_confidence: patch.minimumConfidence ?? 'Potential',
          require_verified_email: patch.requireVerifiedEmail ?? true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id' },
      )
    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json(
          { error: 'The organization_email_policy table is not present. Apply migration 20261030120300_email_engine.sql first.' },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Per-mailbox fields are org-wide policy applied to every mailbox, because
    // an admin setting one window should not have to visit each identity.
    const perMailbox: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (patch.dailySendCap !== undefined) perMailbox.daily_send_cap = patch.dailySendCap
    if (patch.workingHoursStart !== undefined) perMailbox.working_hours_start = patch.workingHoursStart
    if (patch.workingHoursEnd !== undefined) perMailbox.working_hours_end = patch.workingHoursEnd
    if (patch.followUpLimit !== undefined) perMailbox.follow_up_limit = patch.followUpLimit

    if (Object.keys(perMailbox).length > 1) {
      const { error: mailboxError } = await client
        .from('email_sending_policies')
        .update(perMailbox)
        .eq('organization_id', ctx.orgId)
      if (mailboxError && !isMissingTable(mailboxError)) {
        return NextResponse.json({ error: mailboxError.message }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true, patch })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save the email policy.' },
      { status: 500 },
    )
  }
}
