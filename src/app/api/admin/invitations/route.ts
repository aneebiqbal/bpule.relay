import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { createServiceSupabase } from '@/lib/supabase/service'
import { getAuthProvider } from '@/lib/auth/provider'
import {
  INVITABLE_ROLES,
  isInviteEmail,
  nameFromEmail,
  type Invitation,
} from '@/lib/auth/invitations'
import type { OrganizationRole } from '@/lib/auth/organization'

/**
 * POST /api/admin/invitations — invite one person into the caller's workspace.
 *
 * Invite-only is the product contract: this is the only way a new account is
 * created. The invitation is stored in Relay's `pending_invitations`, and the
 * auth account is created with a generated password the invitee never sees —
 * they set their own through the existing password-reset flow. That keeps the
 * invite working on both auth providers without depending on vendor metadata.
 */
export async function POST(request: Request) {
  const ctx = await getAuthContext()
  if (!ctx) {
    return NextResponse.json({ code: 'UNAUTHENTICATED', error: 'Sign in first.' }, { status: 401 })
  }
  if (!ctx.isAdmin) {
    return NextResponse.json({ code: 'FORBIDDEN', error: 'Only an owner or admin can invite people.' }, { status: 403 })
  }

  let body: { email?: unknown; role?: unknown; name?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ code: 'INVALID_REQUEST', error: 'Invalid request.' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!isInviteEmail(email)) {
    return NextResponse.json({ code: 'INVALID_EMAIL', error: 'Enter a valid email address.' }, { status: 400 })
  }

  const role: OrganizationRole = typeof body.role === 'string' && (INVITABLE_ROLES as readonly string[]).includes(body.role)
    ? (body.role as OrganizationRole)
    : 'MEMBER'

  // Only an owner may create another owner.
  if (role === 'OWNER' && !ctx.isOwner) {
    return NextResponse.json({ code: 'FORBIDDEN', error: 'Only an owner can invite another owner.' }, { status: 403 })
  }

  const invitation: Invitation = {
    organizationId: ctx.orgId,
    role,
    invitedBy: ctx.repId,
  }

  // A random password the invitee never sees; they replace it on first login
  // through the password-reset flow.
  const tempPassword = crypto.randomUUID() + crypto.randomUUID()

  const { createPendingInvitation } = await import('@/lib/auth/pending-invitations')
  const service = createServiceSupabase()

  await createPendingInvitation(service, {
    email,
    organizationId: invitation.organizationId,
    role: invitation.role,
    invitedBy: invitation.invitedBy,
  })

  const auth = await getAuthProvider()
  const created = await auth.createUser({
    email,
    password: tempPassword,
    name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : nameFromEmail(email),
  })

  if (!created.userId) {
    // Never leave an invitation for an account that was not created.
    await service.from('pending_invitations').delete().eq('email', email)
    const already = /already|exists|registered|duplicate/i.test(created.error?.message ?? '')
    return NextResponse.json(
      {
        code: already ? 'EMAIL_ALREADY_REGISTERED' : 'INVITE_FAILED',
        error: already
          ? 'That email already has an account. Ask them to sign in instead.'
          : 'The invitation could not be sent. Please try again.',
      },
      { status: already ? 409 : 500 },
    )
  }

  return NextResponse.json({ ok: true, email, role })
}
