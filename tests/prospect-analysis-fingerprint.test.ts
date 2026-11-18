import { describe, expect, it } from 'vitest'
import { analysisFingerprint } from '@/lib/prospect/analysis-fingerprint'

/**
 * BUG-39 — a cached analysis must only be reused for the same organization,
 * prospect, selected profile/channel identity and pipeline version.
 */
const BASE = {
  rawText: 'Sarah Chen\nHead of Engineering at Northwind Cloud\nHiring platform engineers.',
  profileId: 'profile-aneeb',
  identityId: 'identity-aneeb-linkedin',
  orgId: 'org-1',
  generateNote: false,
}

describe('analysisFingerprint (BUG-39)', () => {
  it('is stable for the same analysis', () => {
    expect(analysisFingerprint(BASE)).toBe(analysisFingerprint(BASE))
  })

  it('changes when the selected profile changes', () => {
    expect(analysisFingerprint({ ...BASE, profileId: 'profile-mehak' })).not.toBe(analysisFingerprint(BASE))
  })

  it('changes when the channel identity changes', () => {
    expect(analysisFingerprint({ ...BASE, identityId: 'identity-aneeb-upwork' })).not.toBe(
      analysisFingerprint(BASE),
    )
  })

  it('changes when the organization changes', () => {
    expect(analysisFingerprint({ ...BASE, orgId: 'org-2' })).not.toBe(analysisFingerprint(BASE))
  })

  it('changes when the prospect text changes', () => {
    expect(analysisFingerprint({ ...BASE, rawText: `${BASE.rawText} Different prospect.` })).not.toBe(
      analysisFingerprint(BASE),
    )
  })

  it('changes between analyze and note generation', () => {
    expect(analysisFingerprint({ ...BASE, generateNote: true })).not.toBe(analysisFingerprint(BASE))
  })
})
