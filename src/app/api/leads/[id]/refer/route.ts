import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/service'
import { referLead, getReferralRecommendations } from '@/lib/lead-referral'

export const maxDuration = 30

/**
 * POST /api/leads/[id]/refer
 * Refer a lead to another rep.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params
  const store = createServiceSupabase()
  const { data: auth } = await store.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const { data: rep } = await store
    .from('reps')
    .select('id, organization_id')
    .eq('user_id', auth.user.id)
    .single()

  if (!rep) return NextResponse.json({ error: 'Not a rep.' }, { status: 401 })

  let body: { toRepId?: string; toProfileId?: string; reason?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  if (!body.toRepId) {
    return NextResponse.json({ error: 'toRepId required.' }, { status: 400 })
  }

  const result = await referLead({
    orgId: rep.organization_id,
    leadId,
    fromRepId: rep.id,
    toRepId: body.toRepId,
    toProfileId: body.toProfileId,
    reason: body.reason,
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error || 'Referral failed.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, actionEventId: result.actionEventId })
}

/**
 * GET /api/leads/[id]/refer-recommendations
 * Get recommended profiles for referral.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params
  const store = createServiceSupabase()
  const { data: auth } = await store.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const { data: rep } = await store
    .from('reps')
    .select('id, organization_id')
    .eq('user_id', auth.user.id)
    .single()

  if (!rep) return NextResponse.json({ error: 'Not a rep.' }, { status: 401 })

  const url = new URL(req.url)
  const currentProfileId = url.searchParams.get('currentProfileId') || undefined

  const recommendations = await getReferralRecommendations(rep.organization_id, leadId, currentProfileId)

  return NextResponse.json({ recommendations })
}
