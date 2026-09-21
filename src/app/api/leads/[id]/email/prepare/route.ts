import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { createServerSupabase } from '@/lib/supabase/server'
import { prepareEmailDraft } from '@/lib/email/service'
import { safeErrorResponse } from '@/lib/errors'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: {
    revenueIdentityId?: string | null
    contactPointId?: string | null
    followup?: boolean
    generationMode?: 'standard' | 'premium'
  }
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  try {
    const store = await createScoutStore()
    const client = await createServerSupabase()

    const draft = await prepareEmailDraft({
      client,
      store,
      orgId: store.organizationId,
      repId: store.getCurrentRepId(),
      leadId: id,
      preferredIdentityId: body.revenueIdentityId ?? null,
      contactPointId: body.contactPointId ?? null,
      followup: Boolean(body.followup),
      generationMode: body.generationMode === 'premium' ? 'premium' : 'standard',
    })

    return NextResponse.json({ draft })
  } catch (error) {
    if (error instanceof Error) {
      if (/UNAUTHORIZED_REVENUE_IDENTITY/i.test(error.message)) {
        return NextResponse.json({ error: 'Revenue Identity is not assigned to you.' }, { status: 403 })
      }
      if (/Lead not found|not the owner/i.test(error.message)) {
        return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
      }
      if (/locked/i.test(error.message)) {
        return NextResponse.json({ error: 'Lead is locked and cannot be contacted.' }, { status: 409 })
      }
    }
    return safeErrorResponse(error, 500, 'Failed to prepare email draft.', 'leads/[id]/email/prepare')
  }
}
