import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await request.json()
  const { ideaId, likes, views, title } = body
  if (!ideaId) return NextResponse.json({ error: 'ideaId required' }, { status: 400 })

  const store = await createScoutStore()

  try {
    // Record performance signals in content memory for future generation tuning
    // This teaches Studio what kind of posts get engagement for this persona
    if (likes && likes > 5) {
      await store.createContentMemory({
        personaId: user.rep.id,
        memoryType: 'opinion_expressed',
        content: `High-performing post (${likes} likes): ${title || ideaId}`,
      })
    }
    if (views && views > 100) {
      await store.createContentMemory({
        personaId: user.rep.id,
        memoryType: 'opinion_expressed',
        content: `Post with strong reach (${views} views): ${(title || ideaId).slice(0, 80)}`,
      })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: true })
  }
}
