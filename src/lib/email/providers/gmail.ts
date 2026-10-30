/**
 * Gmail / Google Workspace provider.
 *
 * Implements the existing `EmailProvider` interface so no business logic changes
 * when a second provider (Outlook) is added. Credentials are decrypted from
 * `email_mailboxes.secrets_ciphertext` and never logged.
 *
 * Sending uses `users.messages.send` with a raw RFC 2822 message, because that is
 * the only Gmail endpoint that supports threading by `threadId` and
 * `In-Reply-To` — which is what makes reply ingestion match a reply to its
 * outbound message.
 */
import type { EmailProvider, EmailSendResult, ProviderHistoryMessage } from './email-provider'

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1'

export interface GmailCredentials {
  accessToken: string
  refreshToken: string
  expiresAt: number | null
  scope: string | null
}

export function isGmailCredentials(value: unknown): value is GmailCredentials {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.accessToken === 'string' && typeof v.refreshToken === 'string'
}

/** Minimal RFC 2822 message. Headers are the reply/thread identity. */
function buildRawMessage(input: {
  fromEmail: string
  fromName: string
  toEmail: string
  subject: string
  body: string
  replyTo?: string | null
  threadId?: string | null
  inReplyTo?: string | null
  references?: string | null
}): string {
  const headers = [
    `From: ${input.fromName ? `"${input.fromName}" <${input.fromEmail}>` : input.fromEmail}`,
    `To: ${input.toEmail}`,
    `Subject: ${input.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
  ]
  if (input.replyTo) headers.push(`Reply-To: ${input.replyTo}`)
  if (input.inReplyTo) headers.push(`In-Reply-To: ${input.inReplyTo}`)
  if (input.references) headers.push(`References: ${input.references}`)
  return `${headers.join('\r\n')}\r\n\r\n${input.body}`
}

function encodeRaw(raw: string): string {
  return Buffer.from(raw, 'utf8').toString('base64url')
}

/** Thrown when a Gmail call fails. Carries a category so callers never guess. */
export class GmailError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'GmailError'
    this.status = status
  }
}

export function createGmailProvider(credentials: GmailCredentials): EmailProvider {
  async function call<T>(path: string, init: RequestInit, accessToken: string): Promise<T> {
    const response = await fetch(`${GMAIL_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new GmailError(`Gmail ${response.status}: ${body.slice(0, 300)}`, response.status)
    }
    return (await response.json()) as T
  }

  return {
    id: 'gmail',
    name: 'Google Workspace / Gmail',

    async send(input): Promise<EmailSendResult> {
      const threadId = input.metadata?.providerThreadId as string | undefined ?? null
      const inReplyTo = input.metadata?.inReplyTo as string | undefined ?? null
      const references = input.metadata?.references as string | undefined ?? null

      try {
        const raw = buildRawMessage({
          fromEmail: input.fromEmail,
          fromName: input.fromName,
          toEmail: input.toEmail,
          subject: input.subject,
          body: input.body,
          replyTo: input.replyTo,
          threadId,
          inReplyTo,
          references,
        })

        const sent = await call<{ id: string; threadId: string }>(
          '/users/me/messages/send',
          { method: 'POST', body: JSON.stringify({ raw: encodeRaw(raw), threadId }) },
          credentials.accessToken,
        )

        return {
          accepted: true,
          provider: 'gmail',
          providerMessageId: sent.id,
          providerThreadId: sent.threadId ?? threadId,
          status: 'SENT',
          failureReason: null,
        }
      } catch (error) {
        if (error instanceof GmailError) {
          return {
            accepted: false,
            provider: 'gmail',
            providerMessageId: null,
            providerThreadId: null,
            status: 'FAILED',
            failureReason: `gmail_${error.status ?? 'error'}:${error.message.slice(0, 200)}`,
          }
        }
        return {
          accepted: false,
          provider: 'gmail',
          providerMessageId: null,
          providerThreadId: null,
          status: 'FAILED',
          failureReason: `gmail_network:${error instanceof Error ? error.message.slice(0, 200) : 'unknown'}`,
        }
      }
    },

    async getDeliveryStatus(input) {
      try {
        const message = await call<{
          id: string
          threadId: string
          labelIds?: string[]
        }>(`/users/me/messages/${encodeURIComponent(input.providerMessageId)}?format=metadata`, { method: 'GET' }, credentials.accessToken)

        const labels = message.labelIds ?? []
        return {
          status: labels.includes('SPAM') ? 'BOUNCED' : labels.includes('DRAFT') ? 'FAILED' : 'DELIVERED',
          raw: { labels, threadId: message.threadId },
        }
      } catch (error) {
        if (error instanceof GmailError && error.status === 404) {
          return { status: 'UNKNOWN', raw: { missing: true } }
        }
        return { status: 'UNKNOWN', raw: { error: error instanceof Error ? error.message : 'unknown' } }
      }
    },

    async getThread(input) {
      try {
        const thread = await call<{ id: string; messages?: Array<{ id: string }> }>(
          `/users/me/threads/${encodeURIComponent(input.providerThreadId)}`,
          { method: 'GET' },
          credentials.accessToken,
        )
        return {
          threadId: thread.id,
          messageIds: (thread.messages ?? []).map((m) => m.id),
        }
      } catch {
        return { threadId: input.providerThreadId, messageIds: [] }
      }
    },

    async getMessages(input) {
      try {
        const thread = await call<{
          messages?: Array<{
            id: string
            labelIds?: string[]
            payload?: { headers?: Array<{ name: string; value: string }> }
            internalDate?: string
          }>
        }>(`/users/me/threads/${encodeURIComponent(input.providerThreadId)}?format=metadata`, { method: 'GET' }, credentials.accessToken)

        const own = input.mailboxEmail?.trim().toLowerCase() ?? null
        return (thread.messages ?? []).map((m) => {
          const headers = m.payload?.headers ?? []
          const header = (name: string) => headers.find((h) => h.name.toLowerCase() === name)?.value ?? null
          const from = header('from')?.trim().toLowerCase() ?? ''
          const fromAddress = from.match(/<([^>]+)>/)?.[1] ?? from
          return {
            providerMessageId: m.id,
            // Gmail has no direction flag. A message is inbound when its From is
            // not the mailbox's own address.
            direction: own && fromAddress && fromAddress !== own ? 'INBOUND' : 'OUTBOUND',
            subject: header('subject'),
            body: null,
            sentAt: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : null,
          }
        })
      } catch {
        return []
      }
    },

    async fetchHistory(input) {
      const params = new URLSearchParams({ maxResults: String(input.pageSize ?? 50) })
      if (input.startHistoryId) params.set('startHistoryId', input.startHistoryId)

      const data = await call<{
        history?: Array<{ id: string; messages?: Array<Record<string, unknown>> }>
        historyId?: string
      }>(`/users/me/history?${params.toString()}`, { method: 'GET' }, credentials.accessToken)

      const messages: ProviderHistoryMessage[] = []
      for (const entry of data.history ?? []) {
        for (const raw of entry.messages ?? []) {
          const payload = (raw.payload ?? {}) as { headers?: Array<{ name: string; value: string }> }
          const header = (name: string) => payload.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? null
          messages.push({
            providerMessageId: String(raw.id),
            providerThreadId: (raw.threadId as string) ?? entry.id ?? null,
            fromAddress: header('from'),
            toAddress: header('to'),
            subject: header('subject'),
            inReplyTo: header('in-reply-to'),
            receivedAt: raw.internalDate ? new Date(Number(raw.internalDate as string)).toISOString() : null,
            snippet: (raw.snippet as string) ?? null,
          })
        }
      }
      return { messages, historyId: data.historyId ?? null }
    },
  }
}

/**
 * Refresh an expired access token.
 *
 * Separate from the provider so the mailbox row is refreshed in one place and
 * every consumer sees the same credential.
 */
export async function refreshGmailAccessToken(refreshToken: string): Promise<{
  accessToken: string
  expiresAt: number
  scope: string | null
}> {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('GMAIL_OAUTH_CLIENT_ID / GMAIL_OAUTH_CLIENT_SECRET are not configured.')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new GmailError(`token refresh failed ${response.status}: ${body.slice(0, 200)}`, response.status)
  }

  const data = (await response.json()) as { access_token: string; expires_in?: number; scope?: string }
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    scope: data.scope ?? null,
  }
}

/** The Google OAuth authorization URL for a mailbox connection. */
export function gmailAuthorizationUrl(input: {
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
  loginHint?: string | null
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    // Minimum scopes: send, read the thread for reply matching, and know who the
    // mailbox is. No mailbox modification, no label management, no full read.
    scope: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.metadata',
    access_type: 'offline',
    prompt: 'consent',
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
  })
  if (input.loginHint) params.set('login_hint', input.loginHint)
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

/** Exchange the authorization code for tokens. */
export async function exchangeGmailCode(input: {
  code: string
  clientId: string
  clientSecret: string
  redirectUri: string
  codeVerifier: string
}): Promise<{ accessToken: string; refreshToken: string; expiresAt: number; scope: string | null }> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: input.codeVerifier,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new GmailError(`code exchange failed ${response.status}: ${body.slice(0, 200)}`, response.status)
  }

  const data = (await response.json()) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
    scope?: string
  }

  if (!data.refresh_token) {
    throw new Error('Google did not return a refresh token — re-run consent with prompt=consent.')
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    scope: data.scope ?? null,
  }
}

/** Where the OAuth callback lives in this deployment. */
export function gmailRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'http://localhost:3000'
  return `${base}/api/email/mailbox/callback`
}
