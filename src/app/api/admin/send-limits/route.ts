import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  mergeSendLimits,
  readSendLimits,
  validateSendLimitPatch,
} from '@/lib/email/send-limits'

export const dynamic = 'force-dynamic'

/**
 * Organization send limits.
 *
 * The limits live in `organizations.settings` because that is the column the
 * send path already enforces. Admin only — a rep cannot raise their own ceiling.
 *
 * `settings` is merged, never replaced, so an unrelated key already on the
 * organization is not destroyed by a limit change.
 */
async function loadSettings(client: Awaited<ReturnType<typeof createServerSupabase>>, orgId: string) {
  const { data, error } = await client
    .from('organizations')
    .select('settings')
    .eq('id', orgId)
    .maybeSingle()
  if (error) throw error
  return ((data?.settings as Record<string, unknown>) ?? {}) as Record<string, unknown>
}

export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const client = await createServerSupabase()
  const settings = await loadSettings(client, ctx.orgId)

  return NextResponse.json({
    limits: readSendLimits(settings),
    isAdmin: ctx.isAdmin,
  })
}

export async function PATCH(request: Request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body: unknown = await request.json().catch(() => null)
  const validation = validateSendLimitPatch(body)
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 })

  try {
    const client = await createServerSupabase()
    const current = await loadSettings(client, ctx.orgId)
    const next = mergeSendLimits(current, validation.patch)

    const { error } = await client
      .from('organizations')
      .update({ settings: next, updated_at: new Date().toISOString() })
      .eq('id', ctx.orgId)
    if (error) throw error

    return NextResponse.json({ ok: true, limits: readSendLimits(next) })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save send limits.' },
      { status: 500 },
    )
  }
}
