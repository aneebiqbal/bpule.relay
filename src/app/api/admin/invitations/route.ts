import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthContext } from '@/lib/auth/organization'
import {
  INVITATION_KEY,
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
 * created. The organisation and role are written to admin-only `app_metadata`;
 * the auth callback turns them into a rep + organisation role once.
 */
export async function POST(request: Request) {
  const ctx = await getAuthContext()
  if (!ctx) {
    return NextResponse.json({ code: 'UNAUTHENTICATED', error: 'Sign in first.' }, { status: 401 })
  }
  if (!ctx.isAdmin) {
    return NextResponse.json({ code: 'FORBIDDEN', error: 'Only an owner or admin can invite people.' }, { status: 403 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json({ code: 'INVITES_DISABLED', error: 'Invitations are not configured on this deployment.' }, { status: 503 })
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

  const service = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const origin = new URL(request.url).origin
  const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/onboarding`,
    data: { full_name: typeof body.name === 'string' ? body.name.trim() : nameFromEmail(email) },
  })

  if (error || !data.user) {
    const already = /already|exists|registered/i.test(error?.message ?? '')
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

  const invitation: Invitation = {
    organizationId: ctx.orgId,
    role,
    invitedBy: ctx.repId,
  }

  const { error: metaError } = await service.auth.admin.updateUserById(data.user.id, {
    app_metadata: { [INVITATION_KEY]: {
      organization_id: invitation.organizationId,
      role: invitation.role,
      invited_by: invitation.invitedBy,
    } },
  })

  if (metaError) {
    // Without trusted metadata the invite cannot complete. Revoke it rather
    // than leave an account that would be denied at the callback.
    await service.auth.admin.deleteUser(data.user.id).catch(() => {})
    return NextResponse.json({ code: 'INVITE_FAILED', error: 'The invitation could not be prepared. Please try again.' }, { status: 500 })
  }

  return NextResponse.json(
    { code: 'INVITED', email, role, userId: data.user.id },
    { status: 201 },
  )
}
