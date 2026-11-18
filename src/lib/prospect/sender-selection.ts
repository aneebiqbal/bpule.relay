/**
 * BUG-38 — the selected sender is authoritative.
 *
 * Analyzer used to resolve the requested profile and, when it could not, fall
 * back to the first candidate. The rep picked Aneeb and got analysed as Mehak.
 *
 * This is the ONE decision: a selection the rep cannot execute is an error,
 * never a default. Callers render `error`; they never substitute a profile.
 */

export interface SenderCandidate {
  profileId: string
  platform: string
  identities: Array<{ id: string; channel: string }>
}

export interface SelectedSender {
  profileId: string
  platform: string
  identityId: string
  channel: string
}

export type SenderSelectionError =
  | 'PROFILE_NOT_ACCESSIBLE'
  | 'PROFILE_NOT_EXECUTABLE'
  | 'IDENTITY_NOT_ACCESSIBLE'
  | 'IDENTITY_PROFILE_MISMATCH'

export const SENDER_SELECTION_MESSAGES: Record<SenderSelectionError, string> = {
  PROFILE_NOT_ACCESSIBLE: 'That profile is not available to you. Choose one of your assigned profiles.',
  PROFILE_NOT_EXECUTABLE: 'That profile has no eligible channel identity. Ask an admin to enable it.',
  IDENTITY_NOT_ACCESSIBLE: 'That identity is not available to you.',
  IDENTITY_PROFILE_MISMATCH: 'That identity does not belong to the selected profile.',
}

/**
 * Resolve the sender for one analysis.
 *
 * - `requestedProfileId` set: it must be one of `candidates` and must carry an
 *   identity on its own platform. `requestedIdentityId`, when also set, must be
 *   that identity.
 * - only `requestedIdentityId` set: it must belong to one of `candidates`.
 * - neither set: no selection (`sender: null`) — the caller may use its default.
 */
export function resolveAnalysisSender(input: {
  requestedProfileId: string | null
  requestedIdentityId: string | null
  candidates: readonly SenderCandidate[]
}): { sender: SelectedSender | null; error: SenderSelectionError | null } {
  const { requestedProfileId, requestedIdentityId, candidates } = input

  if (requestedProfileId) {
    const profile = candidates.find((row) => row.profileId === requestedProfileId)
    if (!profile) return { sender: null, error: 'PROFILE_NOT_ACCESSIBLE' }

    const identity =
      profile.identities.find((row) => row.channel === profile.platform) ?? profile.identities[0] ?? null
    if (!identity) return { sender: null, error: 'PROFILE_NOT_EXECUTABLE' }

    if (requestedIdentityId && requestedIdentityId !== identity.id) {
      return { sender: null, error: 'IDENTITY_PROFILE_MISMATCH' }
    }

    return {
      sender: {
        profileId: profile.profileId,
        platform: profile.platform,
        identityId: identity.id,
        channel: identity.channel,
      },
      error: null,
    }
  }

  if (requestedIdentityId) {
    for (const profile of candidates) {
      const identity = profile.identities.find((row) => row.id === requestedIdentityId)
      if (identity) {
        return {
          sender: {
            profileId: profile.profileId,
            platform: profile.platform,
            identityId: identity.id,
            channel: identity.channel,
          },
          error: null,
        }
      }
    }
    return { sender: null, error: 'IDENTITY_NOT_ACCESSIBLE' }
  }

  return { sender: null, error: null }
}
