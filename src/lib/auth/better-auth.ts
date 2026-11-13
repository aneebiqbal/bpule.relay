/**
 * Better Auth engine backed by Aiven PostgreSQL.
 *
 * This is the same engine Neon Auth runs, pointed at the `neon_auth` schema we
 * migrated to Aiven — so the existing users, accounts and sessions keep working
 * with no migration. It replaces the hosted Neon Auth service; nothing else in
 * the auth contract changes.
 *
 * Server-only: it opens its own pool and must never be pulled into a browser
 * bundle. The browser client is origin-agnostic (it calls `/api/auth/*`), so it
 * works against this handler unchanged.
 */
import { Pool } from 'pg'
import { Kysely, PostgresDialect } from 'kysely'
import { betterAuth } from 'better-auth'
import { kyselyAdapter } from '@better-auth/kysely-adapter'
import { admin } from 'better-auth/plugins/admin'

const SCHEMA = 'neon_auth'

function createAuth() {
  const secret = process.env.NEON_AUTH_COOKIE_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('NEON_AUTH_COOKIE_SECRET must be at least 32 characters for the Aiven auth provider')
  }
  const url = process.env.SERVICE_DATABASE_URL ?? process.env.DATABASE_URL
  if (!url) throw new Error('SERVICE_DATABASE_URL is not configured for the Aiven auth provider')

  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.AUTH_DATABASE_POOL_MAX ?? 4),
    ssl: process.env.DATABASE_SSL === 'false' ? undefined : { rejectUnauthorized: false },
  })
  const kysely = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({ pool }),
  }).withSchema(SCHEMA)

  // The app is served from its own origin (e.g. a custom domain in front of
  // Vercel), so the trusted set must include the origin the request actually
  // arrived on — not just the Vercel deployment URL. The Origin header is still
  // checked against this list, so a cross-site request is still rejected.
  const extraOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  return betterAuth({
    database: kyselyAdapter(kysely),
    advanced: {
      database: {
        // The migrated neon_auth tables use uuid ids with gen_random_uuid()
        // defaults; let the database assign them instead of Better Auth's text ids.
        generateId: false,
      },
      // Reproduces Neon Auth's exact cookie names (`__Secure-neon-auth.session_token`),
      // so existing sessions and the existing browser client keep working.
      cookiePrefix: 'neon-auth',
    },
    secret,
    emailAndPassword: { enabled: true },
    trustedOrigins: async (request) => [
      request ? new URL(request.url).origin : '',
      ...extraOrigins,
    ].filter(Boolean),
    // User administration (create / remove / revoke) for the admin console.
    plugins: [admin()],
    // Links in verification / reset emails point back at the app.
    baseURL:
      process.env.NEXT_PUBLIC_APP_URL
      ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'),
  })
}

export type BetterAuthInstance = ReturnType<typeof createAuth>

let instance: BetterAuthInstance | null = null

/** The shared Better Auth instance, constructed on first use. */
export function getBetterAuthInstance(): BetterAuthInstance {
  if (!instance) instance = createAuth()
  return instance
}
