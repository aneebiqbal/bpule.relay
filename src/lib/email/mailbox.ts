/**
 * Mailbox connection — OAuth handshake, token storage and health.
 *
 * The handshake is server-side: the PKCE verifier is stored in
 * `email_oauth_challenges` and never reaches the browser, and the state is
 * single-use because the challenge row is consumed on first use. A captured
 * callback URL therefore cannot be replayed.
 *
 * Tokens are encrypted before they touch `secrets_ciphertext`. The encryption
 * key is never written to the row, a log or a response body.
 */
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { encryptToken, decryptSecrets, tokenEncryptionConfigured } from './oauth/token-cipher'
import { createOAuthState, verifyOAuthState, createPkce } from './oauth/state'
import {
  exchangeGmailCode,
  gmailAuthorizationUrl,
  gmailRedirectUri,
  refreshGmailAccessToken,
} from './providers/gmail'
import { deriveMailboxHealth, type MailboxHealth } from './mailbox-health'

const STATE_TTL_MS = 10 * 60 * 1000

function stateHash(state: string): string {
  return createHash('sha256').update(state).digest('hex')
}

export function oauthConfigured(): boolean {
  return Boolean(
    process.env.GMAIL_OAUTH_CLIENT_ID
      && process.env.GMAIL_OAUTH_CLIENT_SECRET
      && process.env.NEXT_PUBLIC_APP_URL,
  )
}

export interface ConnectionStart {
  authorizationUrl: string
  redirectTo: string
}

/** Step 1 — build the Google authorization URL and persist the PKCE verifier. */
export async function startMailboxConnection(
  client: SupabaseClient,
  input: { organizationId: string; revenueIdentityId: string; loginHint?: string | null; redirectTo?: string },
): Promise<ConnectionStart> {
  if (!oauthConfigured()) {
    throw new Error('Gmail OAuth is not configured (GMAIL_OAUTH_CLIENT_ID / GMAIL_OAUTH_CLIENT_SECRET / NEXT_PUBLIC_APP_URL).')
  }
  if (!tokenEncryptionConfigured()) {
    throw new Error('EMAIL_TOKEN_ENCRYPTION_KEY is not configured — mailbox tokens cannot be encrypted.')
  }

  const { verifier, challenge } = createPkce()
  const state = createOAuthState({
    revenueIdentityId: input.revenueIdentityId,
    organizationId: input.organizationId,
    redirectTo: input.redirectTo ?? '/settings/mailboxes',
  })

  const { error } = await client.from('email_oauth_challenges').insert({
    state_hash: stateHash(state),
    organization_id: input.organizationId,
    revenue_identity_id: input.revenueIdentityId,
    code_verifier: verifier,
    redirect_to: input.redirectTo ?? '/settings/mailboxes',
    expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString(),
  })
  if (error) throw error

  return {
    authorizationUrl: gmailAuthorizationUrl({
      clientId: process.env.GMAIL_OAUTH_CLIENT_ID as string,
      redirectUri: gmailRedirectUri(),
      state,
      codeChallenge: challenge,
      loginHint: input.loginHint,
    }),
    redirectTo: input.redirectTo ?? '/settings/mailboxes',
  }
}

export interface ConnectionResult {
  organizationId: string
  revenueIdentityId: string
  senderEmail: string
  redirectTo: string
  reconnect: boolean
}

/**
 * Step 2 — verify the callback, exchange the code and store encrypted tokens.
 *
 * Every failure path throws; none of them writes a mailbox row. The challenge is
 * consumed even when the exchange fails, so a half-completed handshake cannot be
 * retried by replaying the URL.
 */
export async function completeMailboxConnection(
  client: SupabaseClient,
  input: { state: string | null; code: string | null },
): Promise<ConnectionResult> {
  const state = verifyOAuthState(input.state)
  if (!state) throw new Error('INVALID_OAUTH_STATE')
  if (!input.code) throw new Error('MISSING_AUTHORIZATION_CODE')
  if (!oauthConfigured()) throw new Error('Gmail OAuth is not configured.')

  const hash = stateHash(input.state as string)
  const { data: challenge, error: challengeError } = await client
    .from('email_oauth_challenges')
    .select('id, consumed_at, expires_at, code_verifier, redirect_to')
    .eq('state_hash', hash)
    .maybeSingle()

  if (challengeError) throw challengeError
  if (!challenge) throw new Error('UNKNOWN_OAUTH_STATE')
  if (challenge.consumed_at) throw new Error('OAUTH_STATE_ALREADY_USED')
  if (new Date(challenge.expires_at as string).getTime() < Date.now()) throw new Error('OAUTH_STATE_EXPIRED')

  // Consume first: if the token exchange below fails, the URL is still spent.
  await client
    .from('email_oauth_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', challenge.id as string)

  const tokens = await exchangeGmailCode({
    code: input.code,
    clientId: process.env.GMAIL_OAUTH_CLIENT_ID as string,
    clientSecret: process.env.GMAIL_OAUTH_CLIENT_SECRET as string,
    redirectUri: gmailRedirectUri(),
    codeVerifier: challenge.code_verifier as string,
  })

  const secrets = encryptToken(
    JSON.stringify({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
    }),
  )

  const { error: upsertError } = await client
    .from('email_mailboxes')
    .upsert(
      {
        organization_id: state.organizationId,
        revenue_identity_id: state.revenueIdentityId,
        provider: 'gmail',
        sender_email: null,
        sender_name: null,
        status: 'CONNECTED',
        health: 'CONNECTED',
        secrets_ciphertext: secrets,
        token_expires_at: new Date(tokens.expiresAt).toISOString(),
        token_scope: tokens.scope,
        last_connected_at: new Date().toISOString(),
        consecutive_failures: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'revenue_identity_id' },
    )
  if (upsertError) throw upsertError

  return {
    organizationId: state.organizationId,
    revenueIdentityId: state.revenueIdentityId,
    senderEmail: '',
    redirectTo: (challenge.redirect_to as string) ?? '/settings/mailboxes',
    reconnect: true,
  }
}

export interface MailboxRecord {
  id: string
  organizationId: string
  revenueIdentityId: string
  provider: string
  senderEmail: string | null
  senderName: string | null
  health: MailboxHealth
  status: string
  lastSyncAt: string | null
  lastSendAt: string | null
  lastHistoryId: string | null
  consecutiveFailures: number
  sentToday: number
  dailySendCap: number
  paused: boolean
}

/**
 * Decrypt a mailbox's tokens and refresh the access token when it has expired.
 *
 * Returns null when the mailbox has no usable credential — the caller must treat
 * that as REAUTH_REQUIRED, never as "send anyway".
 */
export async function loadMailboxCredentials(
  client: SupabaseClient,
  organizationId: string,
  revenueIdentityId: string,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: number | null; scope: string | null } | null> {
  const { data: row, error } = await client
    .from('email_mailboxes')
    .select('id, provider, secrets_ciphertext, token_expires_at, token_scope')
    .eq('organization_id', organizationId)
    .eq('revenue_identity_id', revenueIdentityId)
    .maybeSingle()

  if (error) throw error
  if (!row) return null

  const secrets = decryptSecrets((row as Record<string, unknown>).secrets_ciphertext as string)
  if (!secrets.accessToken || !secrets.refreshToken) return null

  const expiresAt = Number(secrets.expiresAt ?? 0) || null
  if (expiresAt && expiresAt > Date.now() + 60_000) {
    return { accessToken: secrets.accessToken, refreshToken: secrets.refreshToken, expiresAt, scope: secrets.scope ?? null }
  }

  // Expired (or missing an expiry): refresh once. A failed refresh leaves the
  // mailbox without a token, which surfaces as REAUTH_REQUIRED.
  try {
    const refreshed = await refreshGmailAccessToken(secrets.refreshToken)
    const next = encryptToken(
      JSON.stringify({
        accessToken: refreshed.accessToken,
        refreshToken: secrets.refreshToken,
        expiresAt: refreshed.expiresAt,
        scope: refreshed.scope,
      }),
    )
    await client
      .from('email_mailboxes')
      .update({ secrets_ciphertext: next, token_expires_at: new Date(refreshed.expiresAt).toISOString(), updated_at: new Date().toISOString() })
      .eq('id', row.id as string)
    return {
      accessToken: refreshed.accessToken,
      refreshToken: secrets.refreshToken,
      expiresAt: refreshed.expiresAt,
      scope: refreshed.scope,
    }
  } catch {
    return null
  }
}

/** Health derived from the stored row — the one derivation every surface reads. */
export function mailboxHealthFromRow(row: {
  provider: string | null
  status: string | null
  hasUsableToken: boolean
  consecutiveFailures: number
  sentToday: number
  dailySendCap: number | null
  paused: boolean
}): MailboxHealth {
  return deriveMailboxHealth(row)
}

/** True when a bounce or failure should stop this mailbox from sending. */
export function mailboxShouldPause(consecutiveFailures: number, threshold: number): boolean {
  return consecutiveFailures >= threshold
}

/** The mailbox address as Google reports it, or null when it is not connected. */
export async function resolveMailboxAddress(accessToken: string): Promise<string | null> {
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) return null
  const data = (await response.json()) as { emailAddress?: string }
  return data.emailAddress ?? null
}
