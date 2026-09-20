import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { getDailyWorkspace, UnauthorizedError } from '@/lib/auth/workspace'

export const dynamic = 'force-dynamic'

/**
 * GET /api/me/workspace
 *
 * Canonical server aggregation for the rep workspace.
 * Returns the full daily responsibility context for the authenticated rep.
 *
 * Security: derives everything from the authenticated session.
 * Never trusts client-supplied identity IDs.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  try {
    const workspace = await getDailyWorkspace()
    return NextResponse.json(workspace)
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
    }
    console.error('[api/me/workspace] failed:', error)
    return NextResponse.json(
      { error: 'Failed to load workspace.' },
      { status: 500 },
    )
  }
}
