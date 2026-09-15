import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * Lightweight status the app rail polls as a rep navigates, so the send counter
 * stays current without a page reload.
 */
export async function GET() {
  try {
    const store = await createScoutStore()
    const queue = await store.getQueue()
    return Response.json({
      todaySends: queue.todaySends,
      dailyLimit: queue.dailyLimit,
    })
  } catch {
    return Response.json(
      { error: 'Not signed in.' },
      { status: 401 },
    )
  }
}
