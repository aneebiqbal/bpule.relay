import type { DbClient } from '@/lib/db/types'
import type { LeadReadScope } from '@/lib/store/types'
/**
 * Conversation read/write authority for the `/api/leads/[id]/*` routes.
 *
 * Mirrors the Inbox queue exactly: operational scope rep ids for managers and
 * admins, and for reps their own ownership plus every executable profile
 * (primary assignment or active coverage). Without this the store's owner-only
 * gate makes a teammate's or covered lead unopenable even though `/chats`
 * deliberately lists it.
 */
import { getAuthContext } from '@/lib/auth/organization'
import { getAuthorizedIdentities } from '@/lib/auth/workspace'
import { effectiveRepIds, resolveOperationalScope } from '@/lib/operations/scope'

export async function resolveConversationAuthz(client: DbClient): Promise<LeadReadScope | null> {
  const auth = await getAuthContext()
  if (!auth) return null
  const scope = await resolveOperationalScope(client, auth)
  const repIds = scope.mode === 'own' ? [auth.repId] : effectiveRepIds(scope, {})
  const identities = scope.mode === 'own' ? await getAuthorizedIdentities().catch(() => null) : null
  return {
    repIds,
    identityIds: identities ? identities.map((identity) => identity.revenueIdentityId) : null,
  }
}
