/**
 * Invite-only membership.
 *
 * Relay is invite-only. An admin invites an email with the Supabase admin API;
 * the organisation and role are written to the user's `app_metadata`, which is
 * admin-only (a user cannot change it). The auth callback turns that trusted
 * metadata into a rep + organisation role exactly once.
 *
 * No invitation table is needed: the pending invitation lives in Supabase's
 * auth record, and the accepted state is the rep row.
 */
import type { OrganizationRole } from './organization'

export const INVITATION_KEY = 'relay_invitation'

export const INVITABLE_ROLES: readonly OrganizationRole[] = ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER']

export interface Invitation {
  organizationId: string
  role: OrganizationRole
  invitedBy: string | null
}

function isOrganizationRole(value: unknown): value is OrganizationRole {
  return typeof value === 'string' && (INVITABLE_ROLES as readonly string[]).includes(value)
}

/** Read the trusted invitation from Supabase `app_metadata`. */
export function readInvitation(appMetadata: unknown): Invitation | null {
  const meta = (appMetadata ?? {}) as Record<string, unknown>
  const raw = meta[INVITATION_KEY]
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const organizationId = typeof record.organization_id === 'string' ? record.organization_id.trim() : ''
  if (!organizationId) return null
  return {
    organizationId,
    role: isOrganizationRole(record.role) ? record.role : 'MEMBER',
    invitedBy: typeof record.invited_by === 'string' ? record.invited_by : null,
  }
}

/** The legacy `reps.role` that matches an organisation role. */
export function repRoleFor(role: OrganizationRole): 'admin' | 'rep' {
  return role === 'OWNER' || role === 'ADMIN' ? 'admin' : 'rep'
}

/** A display name from an email local part: "jane.doe" → "Jane Doe". */
export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? ''
  const words = local.split(/[._-]+/).filter(Boolean)
  if (words.length === 0) return local || 'New member'
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/** Minimal, non-authoritative email shape check (Supabase is the authority). */
export function isInviteEmail(email: string): boolean {
  const value = email.trim()
  return value.length >= 5 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
}
