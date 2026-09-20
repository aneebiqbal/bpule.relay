import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthorizedIdentities } from '@/lib/auth/workspace'

export const dynamic = 'force-dynamic'

/**
 * GET /api/me/authorized-identities
 *
 * Returns all revenue identities the current rep is authorized to represent.
 * Used by client components to validate identity context.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const identities = await getAuthorizedIdentities()
  return NextResponse.json({ identities })
}
