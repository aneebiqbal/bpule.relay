/**
 * BUG-39 — the analysis reuse fingerprint.
 *
 * A cached analysis may only be reused for the SAME organization, the SAME
 * prospect text, the SAME selected profile AND channel identity, under the
 * SAME opportunity/scoring version. Missing any of those made a result leak
 * across accounts or survive a scoring change.
 */
import { opportunityVersionTag } from '@/lib/intelligence-v3/versions'

export function analysisFingerprint(input: {
  rawText: string
  profileId: string | null
  identityId: string | null
  orgId: string | null
  generateNote: boolean
}): string {
  const text = input.rawText.slice(0, 200).toLowerCase().replace(/\s+/g, ' ').trim()
  return [
    opportunityVersionTag(),
    input.orgId ?? '',
    text,
    input.rawText.length,
    input.profileId ?? '',
    input.identityId ?? '',
    input.generateNote ? 'note' : 'analyze',
  ].join(':')
}
