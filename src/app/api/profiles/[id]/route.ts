import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const url = new URL(request.url)
  const admin = url.searchParams.get('admin') === '1'

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  let store
  try {
    store = await createScoutStore()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Not signed in.' },
      { status: 401 },
    )
  }

  if (admin) {
    // Deleting any rep's profile is an admin-only action. Enforced here
    // server-side, independent of the RLS policy on `profiles`.
    if (user.rep.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only.' }, { status: 403 })
    }
    await store.deleteProfileAdmin(id)
    return NextResponse.json({ ok: true })
  }

  const profile = await store.getProfile(id)
  if (!profile) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })
  }
  await store.deleteProfile(id)
  return NextResponse.json({ ok: true })
}