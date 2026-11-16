import { createScoutStore } from '@/lib/store'
import { getAuthProvider } from '@/lib/auth/provider'
import { perfLog, perfSlow, perfTrace } from '@/lib/perf-trace'

export const dynamic = 'force-dynamic'

/**
 * Lightweight status the app rail polls as a rep navigates, so the send counter
 * stays current without a page reload. It intentionally avoids the full queue
 * projection (`getQueue`) — only the two counter values are needed.
 */
export async function GET() {
  const started = performance.now()
  try {
    const store = await perfTrace('me/status.store', () => createScoutStore())
    const summary = await perfTrace('me/status.summary', () => store.getSendSummary())
    const { getAuthContext } = await import('@/lib/auth/organization')
    const auth = await perfTrace('me/status.auth', () => getAuthContext().catch(() => null))
    const total = performance.now() - started
    perfLog('me/status.total', total)
    perfSlow('me/status.total', total)
    return Response.json({
      todaySends: summary.todaySends,
      dailyLimit: summary.dailyLimit,
      // Canonical org role, so client surfaces never trust a stale reps.role.
      isAdmin: auth?.isAdmin ?? false,
      isManager: auth?.isManager ?? false,
    })
  } catch (cause) {
    console.warn('[me/status][diag]', cause instanceof Error ? cause.message : String(cause))
    try {
      const authProvider = await getAuthProvider()
      const { user } = await authProvider.getSession()
      if (!user) {
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
