import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { currentInstant } from '@/lib/org-clock'
import {
  listAttentionForOrg,
  resolveAccessIssue,
} from '@/lib/responsibility/load'
import {
  emitDueAcknowledgementNotifications,
  listAdminRepIds,
} from '@/lib/responsibility/notify'

export const dynamic = 'force-dynamic'

/**
 * Admin responsibility attention — the canonical projection Project 3 renders.
 *
 * Unacknowledged responsibilities and open access issues, with the derived
 * escalation stage. Reading it also emits any due (deduped) notification.
 */
export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const client = await createServerSupabase()
  const now = currentInstant().toISOString()
  const attention = await listAttentionForOrg(client, ctx.orgId, now)
  await emitDueAcknowledgementNotifications({
    client,
    orgId: ctx.orgId,
    acknowledgements: attention,
    now,
    adminRepIds: await listAdminRepIds(client, ctx.orgId).catch(() => []),
  })

  return NextResponse.json({ attention, now })
}

/** Admin/manager resolves an access issue. */
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const acknowledgementId =
    typeof body.acknowledgementId === 'string' ? body.acknowledgementId : ''
  if (!acknowledgementId) {
    return NextResponse.json({ error: 'acknowledgementId is required' }, { status: 400 })
  }

  const client = await createServerSupabase()
  const result = await resolveAccessIssue({
    client,
    orgId: ctx.orgId,
    actorRepId: ctx.repId,
    acknowledgementId,
    note: typeof body.note === 'string' ? body.note : null,
  })
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'Failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
