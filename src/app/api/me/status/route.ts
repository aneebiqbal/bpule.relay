import { createScoutStore } from '@/lib/store'
import { getAuthProvider } from '@/lib/auth/provider'
import { getCurrentUser } from '@/lib/auth/current'
import { perfLog, perfSlow, perfTrace } from '@/lib/perf-trace'

export const dynamic = 'force-dynamic'

/**
 * Lightweight status the app rail polls as a rep navigates, so the send counter
 * stays current without a page reload. It intentionally avoids the full queue
 * projection (`getQueue`) — only the two counter values are needed.
 *
 * Status codes are honest: 401 = no session, 409 = a real missing workspace
 * mapping, 500 = a database/auth failure. A timeout must never be reported as
 * "no workspace mapping".
 */
export async function GET() {
  const started = performance.now()
  try {
    const user = await perfTrace('me/status.user', () => getCurrentUser())
    if (!user) {
      const { user: sessionUser } = await (await getAuthProvider())
        .getSession()
        .catch(() => ({ user: null }))
      if (!sessionUser) {
        return Response.json({ error: 'Not signed in.' }, { status: 401 })
      }
      return Response.json(
        { error: 'Signed in, but no Relay workspace mapping was found for this account.' },
        { status: 409 },
      )
    }

    const store = await perfTrace('me/status.store', () => createScoutStore())
    const summary = await perfTrace('me/status.summary', () => store.getSendSummary())
    const { getAuthContext } = await import('@/lib/auth/organization')
    const auth = await perfTrace('me/status.auth', () => getAuthContext())
    if (!auth) {
      return Response.json(
        { error: 'Signed in, but no Relay workspace mapping was found for this account.' },
        { status: 409 },
      )
    }
    const total = performance.now() - started
    perfLog('me/status.total', total)
    perfSlow('me/status.total', total)
    return Response.json({
      todaySends: summary.todaySends,
      dailyLimit: summary.dailyLimit,
      // Canonical org role, so client surfaces never trust a stale reps.role.
      isAdmin: auth.isAdmin,
      isManager: auth.isManager,
    })
  } catch (cause) {
    console.warn('[me/status][diag]', cause instanceof Error ? cause.message : String(cause))
    perfSlow('me/status.total', performance.now() - started)
    return Response.json({ error: 'Unable to load workspace status.' }, { status: 500 })
  }
}
