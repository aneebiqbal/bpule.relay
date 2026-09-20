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

export async function GET(request: Request) {
  const auth = await requireAdminStore()
  if (auth.error) return auth.error

  const { searchParams } = new URL(request.url)
  const repId = searchParams.get('repId')

  try {
    const assignments = await auth.store.listIdentityAssignmentsAdmin()
    return NextResponse.json({
      assignments: repId ? assignments.filter((a) => a.repId === repId) : assignments,
    })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Failed to load assignments.', 'admin/assignments')
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminStore()
  if (auth.error) return auth.error

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  let identityId = ''
  if (typeof body.identityId === 'string') identityId = body.identityId.trim()
  else if (typeof body.revenueIdentityId === 'string') identityId = body.revenueIdentityId.trim()
  const repId = typeof body.repId === 'string' ? body.repId.trim() : ''
  if (!identityId || !repId) {
    return NextResponse.json({ error: 'identityId and repId are required.' }, { status: 400 })
  }

  try {
    const assignment = await auth.store.assignIdentityAdmin(identityId, repId)
    return NextResponse.json({ assignment }, { status: 201 })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Failed to assign identity.', 'admin/assignments')
  }
}
