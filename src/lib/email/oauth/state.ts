/**
 * OAuth state and PKCE.
 *
 * The state parameter is the only thing binding an authorization response to the
 * browser that started it. It is a signed, single-use, short-lived value, not a
 * guessable id — an attacker who can choose the state can forge a callback and
 * connect their mailbox to a victim organization.
 *
 * PKCE is used because the callback runs in a browser context and there is no
 * client secret safe to ship to it.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { encryptToken, decryptToken } from './token-cipher'

const STATE_ENV = 'EMAIL_OAUTH_STATE_SECRET'
/** A state is single-use and short-lived. */
const STATE_TTL_MS = 10 * 60 * 1000

function stateSecret(): Buffer {
  const raw = process.env[STATE_ENV]
  if (!raw || !raw.trim()) throw new Error(`${STATE_ENV} is not configured — OAuth cannot start.`)
  return Buffer.from(raw.trim(), 'base64')
}

export interface OAuthState {
  /** The Relay sender identity the mailbox will belong to. */
  revenueIdentityId: string
  organizationId: string
  /** Where to return the rep after the handshake. */
  redirectTo: string
  expiresAt: number
  nonce: string
}

function sign(payload: string): string {
  return createHmac('sha256', stateSecret()).update(payload).digest('base64url')
}

/** Build the `state` value sent to the provider. */
export function createOAuthState(input: Omit<OAuthState, 'expiresAt' | 'nonce'>): string {
  const state: OAuthState = {
    ...input,
    expiresAt: Date.now() + STATE_TTL_MS,
    nonce: randomBytes(16).toString('base64url'),
  }
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url')
  const signature = sign(payload)
  // The state itself is encrypted as well as signed: the payload names an
  // organization, and that is not something to hand to a browser in clear.
  return encryptToken(`${payload}.${signature}`)
}

/**
 * Verify a callback state.
 *
 * Returns null on any failure — expired, tampered, replayed or malformed. A
 * null here must stop the handshake, never fall back to trusting the query.
 */
export function verifyOAuthState(state: string | null | undefined): OAuthState | null {
  if (!state) return null
  let raw: string | null = null
  try {
    raw = decryptToken(state)
  } catch {
    return null
  }
  if (raw === null) return null

  const separator = raw.lastIndexOf('.')
  if (separator < 0) return null
  const payload = raw.slice(0, separator)
  const signature = raw.slice(separator + 1)
  const expected = sign(payload)

  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  let parsed: OAuthState
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OAuthState
  } catch {
    return null
  }
  if (!parsed.revenueIdentityId || !parsed.organizationId || typeof parsed.expiresAt !== 'number') return null
  if (parsed.expiresAt < Date.now()) return null
  return parsed
}

/** PKCE verifier + challenge. The verifier never leaves the server. */
export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: challengeFor(verifier) }
}

export function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}
