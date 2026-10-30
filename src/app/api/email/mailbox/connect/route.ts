import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { safeErrorResponse } from '@/lib/errors'
import { startMailboxConnection } from '@/lib/email/mailbox'

/**
 * Step 1 of the mailbox handshake.
 *
 * Returns a Google authorization URL. The PKCE verifier is stored server-side in
 * `email_oauth_challenges`; nothing secret is put in the URL or the response.
 */
export async function POST(request: Request) {
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!can(authCtx, 'MANAGE_REVENUE_IDENTITIES')) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  let body: { revenueIdentityId?: string; loginHint?: string | null; redirectTo?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (!body.revenueIdentityId) {
    return NextResponse.json({ error: 'revenueIdentityId is required.' }, { status: 400 })
  }

  try {
    const supabase = await createServerSupabase()

    // A mailbox belongs to exactly one sender identity, and that identity must
    // belong to the caller's organization.
    const { data: identity, error: identityError } = await supabase
      .from('revenue_identities')
      .select('id')
      .eq('id', body.revenueIdentityId)
      .eq('organization_id', authCtx.orgId)
      .maybeSingle()
    if (identityError) throw identityError
    if (!identity) return NextResponse.json({ error: 'Revenue Identity not found.' }, { status: 404 })

    const connection = await startMailboxConnection(supabase, {
      organizationId: authCtx.orgId,
      revenueIdentityId: body.revenueIdentityId,
      loginHint: body.loginHint ?? null,
      redirectTo: body.redirectTo ?? '/settings/mailboxes',
    })

    return NextResponse.json({ authorizationUrl: connection.authorizationUrl, redirectTo: connection.redirectTo })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Failed to start mailbox connection.', 'email/mailbox/connect')
  }
}
