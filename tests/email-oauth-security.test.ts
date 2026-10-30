/**
 * Mailbox security — token encryption at rest and the OAuth handshake.
 *
 * These are the §32 cases that do not need a browser: a leaked token payload
 * must not be readable, a forged or replayed callback state must be rejected,
 * and PKCE must be a real challenge rather than a guessable value.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { decryptToken, decryptSecrets, encryptToken, tokenEncryptionConfigured } from '@/lib/email/oauth/token-cipher'
import { challengeFor, createOAuthState, createPkce, verifyOAuthState } from '@/lib/email/oauth/state'

const KEY_ENV = 'EMAIL_TOKEN_ENCRYPTION_KEY'
const STATE_ENV = 'EMAIL_OAUTH_STATE_SECRET'

const KEY_A = Buffer.alloc(32, 7).toString('base64')
const KEY_B = Buffer.alloc(32, 9).toString('base64')

const originalKey = process.env[KEY_ENV]
const originalStateSecret = process.env[STATE_ENV]

beforeEach(() => {
  process.env[KEY_ENV] = KEY_A
  process.env[STATE_ENV] = Buffer.alloc(32, 1).toString('base64')
})

afterEach(() => {
  if (originalKey === undefined) delete process.env[KEY_ENV]
  else process.env[KEY_ENV] = originalKey
  if (originalStateSecret === undefined) delete process.env[STATE_ENV]
  else process.env[STATE_ENV] = originalStateSecret
})

describe('token encryption at rest', () => {
  it('round-trips a refresh token', () => {
    const payload = encryptToken('ya29.a0-af esport-refresh-token')
    expect(payload).not.toContain('refresh-token')
    expect(decryptToken(payload)).toBe('ya29.a0-af esport-refresh-token')
  })

  it('produces a different ciphertext each time', () => {
    expect(encryptToken('same-token')).not.toBe(encryptToken('same-token'))
  })

  it('fails closed when no key is configured', () => {
    delete process.env[KEY_ENV]
    expect(tokenEncryptionConfigured()).toBe(false)
    expect(() => encryptToken('token')).toThrow(/EMAIL_TOKEN_ENCRYPTION_KEY/)
  })

  it('rejects a key that is not 32 bytes', () => {
    process.env[KEY_ENV] = 'too-short'
    expect(() => encryptToken('token')).toThrow(/32 bytes/)
  })

  it('refuses to encrypt an empty token', () => {
    expect(() => encryptToken('')).toThrow(/empty/)
  })

  it('does not decrypt a payload encrypted under another key', () => {
    const payload = encryptToken('secret-refresh-token')
    process.env[KEY_ENV] = KEY_B
    expect(() => decryptToken(payload)).toThrow()
  })

  it('rejects a tampered authentication tag', () => {
    const payload = encryptToken('secret-refresh-token')
    const parsed = JSON.parse(payload) as { tag: string }
    parsed.tag = Buffer.from('tampered-tag-value-1234').toString('base64')
    expect(() => decryptToken(JSON.stringify(parsed))).toThrow()
  })

  it('rejects a payload that is not ours', () => {
    expect(() => decryptToken('not-json')).toThrow(/JSON/)
    expect(() => decryptToken(JSON.stringify({ v: 2, iv: 'x', tag: 'y', data: 'z' }))).toThrow(/malformed/)
  })

  it('drops a key it cannot decrypt instead of returning it in clear', () => {
    const underA = encryptToken('token-encrypted-under-a')
    process.env[KEY_ENV] = KEY_B
    const underB = encryptToken('token-encrypted-under-b')

    const out = decryptSecrets(JSON.stringify({ accessToken: underB, refreshToken: underA }))

    // The key this deployment cannot read is dropped, not surfaced.
    expect(out.accessToken).toBe('token-encrypted-under-b')
    expect(out.refreshToken).toBeUndefined()
  })

  it('treats an absent secrets column as no credentials', () => {
    expect(decryptSecrets(null)).toEqual({})
    expect(decryptSecrets('{}')).toEqual({})
  })
})

describe('OAuth state', () => {
  const input = { revenueIdentityId: 'identity-1', organizationId: 'org-1', redirectTo: '/settings/mailboxes' }

  it('round-trips and carries the identity it was issued for', () => {
    const state = createOAuthState(input)
    const verified = verifyOAuthState(state)
    expect(verified).not.toBeNull()
    expect(verified?.revenueIdentityId).toBe('identity-1')
    expect(verified?.organizationId).toBe('org-1')
  })

  it('does not leak the organization id in clear', () => {
    const state = createOAuthState(input)
    expect(state).not.toContain('org-1')
    expect(state).not.toContain('identity-1')
  })

  it('rejects a state signed with a different secret', () => {
    const state = createOAuthState(input)
    process.env[STATE_ENV] = Buffer.alloc(32, 2).toString('base64')
    expect(verifyOAuthState(state)).toBeNull()
  })

  it('rejects a state that was never issued', () => {
    expect(verifyOAuthState('forged-state')).toBeNull()
    expect(verifyOAuthState(null)).toBeNull()
    expect(verifyOAuthState('')).toBeNull()
  })

  it('rejects a state whose payload was tampered with', () => {
    const state = createOAuthState(input)
    // Flip the last character of the signature portion.
    const flipped = state.slice(0, -1) + (state.endsWith('a') ? 'b' : 'a')
    expect(verifyOAuthState(flipped)).toBeNull()
  })

  it('rejects an expired state', () => {
    const state = createOAuthState(input)
    // Verify against a clock past the 10-minute TTL.
    const realNow = Date.now
    Date.now = () => realNow() + 11 * 60 * 1000
    try {
      expect(verifyOAuthState(state)).toBeNull()
    } finally {
      Date.now = realNow
    }
  })

  it('is single-use only because the challenge row is consumed, not the state', () => {
    // The state itself is deterministic; consumption is enforced by the
    // email_oauth_challenges row. Two verifications of the same state both
    // succeed here, which is exactly why the database marks it consumed.
    const state = createOAuthState(input)
    expect(verifyOAuthState(state)?.revenueIdentityId).toBe('identity-1')
    expect(verifyOAuthState(state)?.revenueIdentityId).toBe('identity-1')
  })
})

describe('PKCE', () => {
  it('is the S256 challenge of the verifier', () => {
    const { verifier, challenge } = createPkce()
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'))
  })

  it('produces a different challenge per verifier', () => {
    expect(createPkce().challenge).not.toBe(createPkce().challenge)
  })

  it('never returns an empty verifier or challenge', () => {
    const { verifier, challenge } = createPkce()
    expect(verifier.length).toBeGreaterThan(32)
    expect(challenge.length).toBeGreaterThan(32)
  })
})
