import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { loadFreshProspects } from '@/lib/enrichment/fresh-prospects'

export const dynamic = 'force-dynamic'

/**
 * Fresh Prospects — provider-discovered candidates awaiting a human decision.
 *
 * Read-only over the ONE staging authority. Promotion happens through the
 * canonical `createLead`; there is no second lead path.
 */
export async function GET(request: Request) {
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const url = new URL(request.url)
  const profile = url.searchParams.get('profile')

  const client = await createServerSupabase()
  try {
    const prospects = await loadFreshProspects(client, authCtx.orgId, profile)
    return NextResponse.json({ prospects })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load fresh prospects.' },
      { status: 500 },
    )
  }
}
