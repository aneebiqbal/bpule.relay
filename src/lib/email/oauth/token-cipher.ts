/**
 * Mailbox token encryption at rest.
 *
 * `email_mailboxes.secrets_ciphertext` already exists and was never read. OAuth
 * refresh tokens are bearer credentials: a leaked database row is a leaked
 * mailbox. They are encrypted with AES-256-GCM before they are stored, and the
 * key lives only in the environment.
 *
 * Fail closed: a missing or malformed key is an error, never a silent
 * plaintext write.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const KEY_ENV = 'EMAIL_TOKEN_ENCRYPTION_KEY'
const VERSION = 1

/** 32 bytes, base64 (44 chars) or 64 hex chars. */
function loadKey(): Buffer {
  const raw = process.env[KEY_ENV]
  if (!raw || !raw.trim()) {
    throw new Error(`${KEY_ENV} is not configured — mailbox tokens cannot be encrypted.`)
  }
  const trimmed = raw.trim()
  const key = /^[0-9a-f]{64}$/i.test(trimmed) ? Buffer.from(trimmed, 'hex') : Buffer.from(trimmed, 'base64')
  if (key.length !== 32) {
    throw new Error(`${KEY_ENV} must decode to 32 bytes (got ${key.length}).`)
  }
  return key
}

export interface CipherPayload {
  v: number
  iv: string
  tag: string
  data: string
}

/** True when the deployment can encrypt mailbox tokens. */
export function tokenEncryptionConfigured(): boolean {
  try {
    loadKey()
    return true
  } catch {
    return false
  }
}

/** Encrypt a token. Returns a JSON string for the `secrets_ciphertext` column. */
export function encryptToken(plaintext: string): string {
  if (!plaintext) throw new Error('Refusing to encrypt an empty token.')
  const key = loadKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const payload: CipherPayload = {
    v: VERSION,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  }
  return JSON.stringify(payload)
}

/** Decrypt a token. Throws when the payload is not ours or does not authenticate. */
export function decryptToken(payload: string | null | undefined): string | null {
  if (!payload) return null
  const key = loadKey()
  let parsed: CipherPayload
  try {
    parsed = JSON.parse(payload) as CipherPayload
  } catch {
    throw new Error('Mailbox token payload is not valid JSON.')
  }
  if (parsed.v !== VERSION || !parsed.iv || !parsed.tag || !parsed.data) {
    throw new Error('Mailbox token payload is malformed.')
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(parsed.data, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

/** Decrypt a whole secrets object, dropping any key that will not decrypt. */
export function decryptSecrets(
  payload: string | Record<string, unknown> | null | undefined,
): Record<string, string> {
  if (!payload) return {}
  let parsed: Record<string, unknown>
  if (typeof payload === 'string') {
    try {
      parsed = JSON.parse(payload) as Record<string, unknown>
    } catch {
      return {}
    }
  } else {
    parsed = payload
  }

  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(parsed)) {
    if (typeof value !== 'string') continue
    try {
      const plain = decryptToken(value)
      if (plain) out[name] = plain
    } catch {
      // A key that no longer matches is not a token this deployment can read.
      // Dropping it is fail-closed: the mailbox reports REAUTH_REQUIRED rather
      // than sending with a credential we cannot decrypt.
    }
  }
  return out
}
