/**
 * Shared TLS configuration for every PostgreSQL client.
 *
 * Aiven presents a private CA, so `sslmode=require` (which disables
 * verification) is not enough for production. Set `DATABASE_SSL_CA` to the
 * Aiven CA PEM (inline or a file path) and verification turns on; without it we
 * keep the historical `rejectUnauthorized: false` so a deployment that has not
 * installed the CA still connects. `DATABASE_SSL_VERIFY=false` forces the
 * insecure mode explicitly, and `DATABASE_SSL=false` disables TLS entirely
 * (local development only).
 */
import { readFileSync } from 'node:fs'

export interface PgSslConfig {
  rejectUnauthorized: boolean
  ca?: string
}

let cachedCa: { raw: string; resolved: string } | null = null

function resolveCa(raw: string): string {
  if (cachedCa?.raw === raw) return cachedCa.resolved
  const resolved = raw.includes('-----BEGIN') ? raw : readFileSync(raw, 'utf8')
  cachedCa = { raw, resolved }
  return resolved
}

export function resolvePgSslConfig(env: NodeJS.ProcessEnv = process.env): PgSslConfig | undefined {
  if (env.DATABASE_SSL === 'false') return undefined

  const caRaw = env.DATABASE_SSL_CA ?? ''
  const caPresent = caRaw.trim().length > 0
  const verify =
    env.DATABASE_SSL_VERIFY === 'true' ||
    (env.DATABASE_SSL_VERIFY !== 'false' && caPresent)

  if (!verify) return { rejectUnauthorized: false }

  const ca = caPresent ? resolveCa(caRaw) : undefined
  return { rejectUnauthorized: true, ...(ca ? { ca } : {}) }
}
