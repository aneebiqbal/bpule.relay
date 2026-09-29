import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await request.json()
  const ideaId = body.ideaId as string
  if (!ideaId) return NextResponse.json({ error: 'ideaId required' }, { status: 400 })

  const store = await createScoutStore()
  await store.markDailyContentIdeaCopied(ideaId)

  return NextResponse.json({ ok: true })
}
