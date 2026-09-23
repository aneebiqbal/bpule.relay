import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import { isProductAdmin } from '@/lib/auth/admin-page'
import { getCurrentUser } from '@/lib/auth/current'
import { safeErrorResponse } from '@/lib/errors'

/**
 * Admin override: clear a lead's connection-pacing lock immediately.
 * Admin/owner-scoped; no-op if the lead is not currently locked.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const authCtx = await getAuthContext()
  if (!isProductAdmin(user, authCtx)) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  try {
    const store = await createScoutStore()
    await store.unlockLead(id)
    const detail = await store.getLead(id)
    return NextResponse.json({ ok: true, lead: detail })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Could not unlock the lead.', 'leads/unlock')
  }
}
