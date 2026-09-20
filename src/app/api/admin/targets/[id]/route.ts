import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { safeErrorResponse } from '@/lib/errors'

async function requireAdminStore() {
  const user = await getCurrentUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  if (user.rep.role !== 'admin') return { error: NextResponse.json({ error: 'Admin only.' }, { status: 403 }) }
  try {
    return { store: await createScoutStore() }
  } catch {
    return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requireAdminStore()
  if (auth.error) return auth.error

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (body.revenueIdentityId !== undefined || body.repId !== undefined) {
    return NextResponse.json(
      { error: 'Cannot change Revenue Identity or Rep on an existing target. Create a new target instead.' },
      { status: 400 },
    )
  }

  const patches: { targetCount?: number; active?: boolean } = {}
  if (typeof body.targetCount === 'number' && body.targetCount > 0) {
    patches.targetCount = Math.round(body.targetCount)
  }
  if (typeof body.active === 'boolean') {
    patches.active = body.active
  }
  if (patches.targetCount === undefined && patches.active === undefined) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  try {
    const target = await auth.store.updateDailyTargetAdmin(id, patches)
    return NextResponse.json({ target })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Failed to update target.', 'admin/targets/[id]')
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requireAdminStore()
  if (auth.error) return auth.error

  try {
    await auth.store.deleteDailyTargetAdmin(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Failed to delete target.', 'admin/targets/[id]')
  }
}
