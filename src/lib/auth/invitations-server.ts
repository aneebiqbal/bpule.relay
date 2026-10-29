/**
 * Server-only provisioning for an invited member.
 *
 * The invitation lives in admin-only `app_metadata`; accepting it creates the
 * application rep and organisation role exactly once. Uses the service role
 * because the user has no organisation yet, so RLS cannot authorise the insert.
 */
import { createClient } from '@supabase/supabase-js'
import { nameFromEmail, repRoleFor, type Invitation } from './invitations'

export interface ProvisionResult {
  repId: string
  created: boolean
}

export async function provisionInvitedMember(params: {
  invitation: Invitation
  authUserId: string
  email: string
  displayName?: string | null
}): Promise<ProvisionResult | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null

  const service = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: org } = await service
    .from('organizations')
    .select('id')
    .eq('id', params.invitation.organizationId)
    .maybeSingle()
  if (!org) return null

  const { data: existing } = await service
    .from('reps')
    .select('id, organization_id')
    .eq('auth_user_id', params.authUserId)
    .maybeSingle()

  let repId = existing?.id as string | undefined
  let created = false

  if (repId && existing?.organization_id !== params.invitation.organizationId) {
    // An existing member of another organisation is never moved by an invite.
    return null
  }

  if (!repId) {
    const { data: inserted, error } = await service
      .from('reps')
      .insert({
        name: params.displayName?.trim() || nameFromEmail(params.email),
        role: repRoleFor(params.invitation.role),
        organization_id: params.invitation.organizationId,
        auth_user_id: params.authUserId,
      })
      .select('id')
      .single()

    if (error || !inserted) {
      // A concurrent callback may have won the unique auth_user_id race.
      const { data: again } = await service
        .from('reps')
        .select('id, organization_id')
        .eq('auth_user_id', params.authUserId)
        .maybeSingle()
      if (!again || again.organization_id !== params.invitation.organizationId) return null
      repId = again.id as string
    } else {
      repId = inserted.id as string
      created = true
    }
  }

  const { error: roleError } = await service
    .from('organization_roles')
    .upsert(
      {
        organization_id: params.invitation.organizationId,
        person_id: repId,
        role: params.invitation.role,
        granted_by: params.invitation.invitedBy,
      },
      { onConflict: 'organization_id,person_id' },
    )

  if (roleError) {
    if (created) await service.from('reps').delete().eq('id', repId)
    return null
  }

  return { repId, created }
}
