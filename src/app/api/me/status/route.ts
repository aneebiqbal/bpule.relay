import { createScoutStore } from '@/lib/store'
import { createServerSupabase } from '@/lib/supabase/server'

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
    try {
      const supabase = await createServerSupabase()
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) {
        return Response.json({ error: 'Not signed in.' }, { status: 401 })
      }
      return Response.json(
        { error: 'Signed in, but no Relay workspace mapping was found for this account.' },
        { status: 409 },
      )
    } catch {
      return Response.json({ error: 'Not signed in.' }, { status: 401 })
    }
  }
}
