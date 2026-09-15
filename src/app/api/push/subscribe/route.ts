import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
  const p256dh = typeof body.p256dh === 'string' ? body.p256dh : ''
  const auth = typeof body.auth === 'string' ? body.auth : ''
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Subscription fields are required.' }, { status: 400 })
  }

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  let store
  try {
    store = await createScoutStore()
  } catch {
    return NextResponse.json(
      { error: 'Not signed in.' },
      { status: 401 },
    )
  }

  const sub = await store.savePushSubscription({
    organizationId: user.rep.organizationId,
    repId: user.rep.id,
    endpoint,
    p256dh,
    auth,
  })
  return NextResponse.json({ subscription: sub })
}

export async function DELETE() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  let store
  try {
    store = await createScoutStore()
  } catch {
    return NextResponse.json(
      { error: 'Not signed in.' },
      { status: 401 },
    )
  }

  await store.deletePushSubscription(user.rep.id)
  return NextResponse.json({ ok: true })
}
