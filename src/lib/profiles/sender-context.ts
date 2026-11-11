import type { RevenueIdentityChannel } from '@/lib/domain/types'
import { normalizeChannel } from '@/lib/profiles/channel'

export interface SenderIdentityRef {
  id: string
  channel: RevenueIdentityChannel
}

export interface SenderContextEntry {
  profileId: string
  /** The channel this profile sends as. */
  platform: string
  identities: SenderIdentityRef[]
}

export interface SenderContext {
  profileId: string
  platform: string
  identity: SenderIdentityRef
  channel: RevenueIdentityChannel
}

/**
 * The ONE resolver for "which person and channel is the rep acting as".
 *
 * An explicitly selected profile is authoritative: it decides both the
 * knowledge used for generation and the revenue identity the lead is
 * attributed to. The active workspace is only a fallback, and a bare
 * identity id is the last resort — never the other way round.
 *
 * Before this existed the workspace identity was returned even when the rep
 * had selected a different sender, so a lead created "as Aneeb · LinkedIn"
 * was stored under whichever profile happened to be active (BUG-32).
 */
export function resolveSenderContext(
  profiles: ReadonlyArray<SenderContextEntry>,
  selectedProfileId: string | null,
  fallbackIdentityId?: string | null,
): SenderContext | null {
  if (selectedProfileId) {
    const entry = profiles.find((row) => row.profileId === selectedProfileId)
    if (entry) {
      const platform = normalizeChannel(entry.platform)
      const identity = entry.identities.find((row) => row.channel === platform)
        ?? entry.identities[0]
        ?? null
      if (identity) {
        return { profileId: entry.profileId, platform: entry.platform, identity, channel: identity.channel }
      }
    }
  }

  if (fallbackIdentityId) {
    for (const entry of profiles) {
      const identity = entry.identities.find((row) => row.id === fallbackIdentityId)
      if (identity) {
        return { profileId: entry.profileId, platform: entry.platform, identity, channel: identity.channel }
      }
    }
  }

  return null
}
