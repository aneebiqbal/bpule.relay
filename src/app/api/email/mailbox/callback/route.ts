import { NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/service'
import { completeMailboxConnection, loadMailboxCredentials, resolveMailboxAddress } from '@/lib/email/mailbox'

/**
 * Step 2 of the mailbox handshake — the Google redirect target.
 *
 * Authenticated by the signed, single-use state, not by a session: the rep may
 * complete the handshake in a different tab or after a session refresh. Every
 * failure returns an error page; none of them writes a mailbox row.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const state = url.searchParams.get('state')
  const code = url.searchParams.get('code')
  const googleError = url.searchParams.get('error')

  const redirectTo = safeRedirect(url.searchParams.get('redirect_to'))

  if (googleError) {
    return NextResponse.redirect(`${redirectTo}?mailbox_error=${encodeURIComponent(googleError)}`)
  }

  try {
    const supabase = createServiceSupabase()
    const result = await completeMailboxConnection(supabase, { state, code })

    // Resolve and store the mailbox's own address. It is required for reply
    // matching: a message whose From is not this address is inbound.
    const senderEmail = await resolveAndStoreMailboxAddress(supabase, {
      organizationId: result.organizationId,
      revenueIdentityId: result.revenueIdentityId,
    })

    const target = new URL(result.redirectTo || '/settings/mailboxes', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')
    target.searchParams.set('mailbox_connected', 'true')
    target.searchParams.set('mailbox_identity', result.revenueIdentityId)
    if (senderEmail) target.searchParams.set('mailbox_email', senderEmail)

    return NextResponse.redirect(target.toString())
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown'
    const target = new URL(redirectTo, process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')
    target.searchParams.set('mailbox_error', reason)
    return NextResponse.redirect(target.toString())
  }
}

/** Only same-site paths are honoured — an open redirect is not acceptable here. */
function safeRedirect(value: string | null): string {
  if (!value) return '/settings/mailboxes'
  return value.startsWith('/') && !value.startsWith('//') ? value : '/settings/mailboxes'
}

/**
 * Ask Google who this mailbox is and persist that address.
 *
 * Best-effort: a mailbox is usable without it, but reply matching is weaker, so
 * the callback reports the failure rather than silently degrading.
 */
async function resolveAndStoreMailboxAddress(
  supabase: ReturnType<typeof createServiceSupabase>,
  input: { organizationId: string; revenueIdentityId: string },
): Promise<string | null> {
  const credentials = await loadMailboxCredentials(supabase, input.organizationId, input.revenueIdentityId)
  if (!credentials) return null

  const address = await resolveMailboxAddress(credentials.accessToken)
  if (!address) return null

  await supabase
    .from('email_mailboxes')
    .update({ sender_email: address.toLowerCase(), updated_at: new Date().toISOString() })
    .eq('organization_id', input.organizationId)
    .eq('revenue_identity_id', input.revenueIdentityId)

  return address
}
