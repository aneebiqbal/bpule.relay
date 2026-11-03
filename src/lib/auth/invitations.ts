/**
 * Invite-only membership.
 *
 * Relay is invite-only. The pending invitation lives in Relay's own
 * `pending_invitations` table — not in auth metadata, which only one vendor can
 * write and which would put authorization authority outside Relay. Accepting it
 * creates the rep + organisation role exactly once and consumes the row.
 */
import type { OrganizationRole } from './organization'

export const INVITABLE_ROLES: readonly OrganizationRole[] = ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER']

export interface Invitation {
  organizationId: string
  role: OrganizationRole
  invitedBy: string | null
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

/** Minimal, non-authoritative email shape check (the auth provider is the authority). */
export function isInviteEmail(email: string): boolean {
  const value = email.trim()
  return value.length >= 5 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
}
