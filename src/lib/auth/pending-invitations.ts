/**
 * Pending invitations, stored in Relay's own database.
 *
 * `pending_invitations` has RLS enabled with no policies, so it is reachable
 * only through the service role — the caller has no organisation yet, so RLS
 * could not authorise the read or the insert. Everything here therefore runs on
 * the service client.
 */
import type { DbClient } from '@/lib/db/types'
import { INVITABLE_ROLES, type Invitation } from './invitations'

type PendingRow = {
  organization_id: string
  role: string
  invited_by: string | null
}

function isRole(value: unknown): value is Invitation['role'] {
  return typeof value === 'string' && (INVITABLE_ROLES as readonly string[]).includes(value)
}

/**
 * Validate a `pending_invitations` row into an invitation.
 *
 * Pure, so the shape rules are unit-testable without a database: an unknown role
 * falls back to the least-privileged one, and a row without an organisation is
 * not usable.
 */
export function parseInvitationRow(row: PendingRow | null | undefined): Invitation | null {
  if (!row) return null
  const organizationId = typeof row.organization_id === 'string' ? row.organization_id.trim() : ''
  if (!organizationId) return null
  return {
    organizationId,
    role: isRole(row.role) ? row.role : 'MEMBER',
    invitedBy: row.invited_by ?? null,
  }
}

/** Record an invitation for an email. Idempotent per unconsumed email. */
export async function createPendingInvitation(
  db: DbClient,
  params: { email: string; organizationId: string; role: string; invitedBy: string | null },
): Promise<void> {
  await db
    .from('pending_invitations')
    .upsert(
      {
        email: params.email.trim().toLowerCase(),
        organization_id: params.organizationId,
        role: params.role,
        invited_by: params.invitedBy,
      },
      { onConflict: 'email', ignoreDuplicates: false },
    )
}

/**
 * Take the pending invitation for an email and consume it, so it can only be
 * accepted once. Returns null when there is none.
 */
export async function consumePendingInvitation(db: DbClient, email: string): Promise<Invitation | null> {
  const normalized = email.trim().toLowerCase()

  const { data: rows, error } = await db
    .from('pending_invitations')
    .select('organization_id, role, invited_by')
    .eq('email', normalized)
    .is('consumed_at', null)
    .limit(1)

  if (error) {
    console.warn('[auth/pending-invitations] lookup failed', { message: error.message })
    return null
  }

  const invitation = parseInvitationRow(rows?.[0] as PendingRow | undefined)
  if (!invitation) return null

  await db
    .from('pending_invitations')
    .update({ consumed_at: new Date().toISOString() })
    .eq('email', normalized)
    .is('consumed_at', null)

  return invitation
}
