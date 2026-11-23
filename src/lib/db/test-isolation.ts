/**
 * Fail-closed database isolation for tests and maintenance scripts.
 *
 * A previous configuration pointed the local live suite at the production
 * Aiven database (`relay_prod_final`), so `npm run test:live` mutated
 * production. This module is the single guard that must run before any
 * write-capable connection is opened.
 *
 * Rules:
 *   - any database URL whose database name looks like production is rejected,
 *     regardless of what any other variable claims;
 *   - a live test run must set an explicit opt-in marker;
 *   - a missing database URL is a failure for live tests, never a silent
 *     fallback to a default;
 *   - all variables that can carry a URL are inspected, so a swapped
 *     `SERVICE_DATABASE_URL` cannot smuggle production in.
 */

/** Environment variables that can carry a database connection string. */
export const DATABASE_URL_VARS = [
  'DATABASE_URL',
  'SERVICE_DATABASE_URL',
  'TEST_DATABASE_URL',
  'RELAY_TEST_DATABASE_URL',
] as const

/** Opt-in markers for a disposable test database. */
export const TEST_MARKER_VARS = ['RELAY_TEST_DATABASE', 'RELAY_LIVE_TEST'] as const

/** Optional extra production service fingerprints (host substrings). */
export const FINGERPRINT_VAR = 'RELAY_PRODUCTION_SERVICE_FINGERPRINT'

export interface DatabaseUrlInfo {
  variable: string
  host: string
  port: string
  name: string
}

export function parseDatabaseUrl(raw: string): { host: string; port: string; name: string } | null {
  try {
    const url = new URL(raw)
    if (!url.hostname) return null
    return {
      host: url.hostname,
      port: url.port,
      name: decodeURIComponent(url.pathname.replace(/^\/+/, '')),
    }
  } catch {
    return null
  }
}

/**
 * Production detection is by database NAME, not host: the Aiven staging clone
 * (`relay_staging`) lives on the same service/host as `relay_prod_final`, so a
 * host check would reject the disposable database too.
 */
export function isProductionDatabaseName(name: string): boolean {
  if (!name) return false
  return /(^|[^a-z])prod([^a-z]|$)/i.test(name) || /production/i.test(name)
}

function redact(raw: string): string {
  try {
    const url = new URL(raw)
    if (url.password) url.password = '***'
    if (url.username) url.username = '***'
    return url.toString()
  } catch {
    return '<unparsable>'
  }
}

/** Every configured URL that targets a production database. */
export function productionViolations(env: NodeJS.ProcessEnv = process.env): string[] {
  const violations: string[] = []
  const fingerprints = (env[FINGERPRINT_VAR] ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  for (const variable of DATABASE_URL_VARS) {
    const raw = env[variable]
    if (!raw) continue
    const parsed = parseDatabaseUrl(raw)
    if (!parsed) {
      violations.push(`${variable} is not a parsable database URL (${redact(raw)})`)
      continue
    }
    if (isProductionDatabaseName(parsed.name)) {
      violations.push(`${variable} targets production database "${parsed.name}"`)
      continue
    }
    if (fingerprints.some((fingerprint) => parsed.host.includes(fingerprint))) {
      violations.push(`${variable} targets a fingerprinted production service host "${parsed.host}"`)
    }
  }
  return violations
}

/**
 * Refuse to run when any configured URL is production-like. Read-only
 * reconciliation scripts may still call this to prove they are not pointed at
 * production.
 */
export function assertNoProductionDatabase(env: NodeJS.ProcessEnv = process.env): void {
  const violations = productionViolations(env)
  if (violations.length > 0) {
    throw new Error(
      ['Refusing to run: production database detected.', ...violations.map((line) => `  - ${line}`)].join('\n'),
    )
  }
}

/** True when an explicit test-database marker is present. */
export function hasTestMarker(env: NodeJS.ProcessEnv = process.env): boolean {
  return TEST_MARKER_VARS.some((variable) => env[variable] === '1')
}

/**
 * Full live-test isolation check. Throws unless:
 *   - an opt-in marker is set;
 *   - at least one database URL is configured;
 *   - no configured URL is production-like.
 */
export function assertLiveTestIsolation(env: NodeJS.ProcessEnv = process.env): void {
  if (!hasTestMarker(env)) {
    throw new Error(
      'Live database tests require an explicit disposable-database marker.\n' +
        `  Set RELAY_TEST_DATABASE=1 (and point DATABASE_URL / SERVICE_DATABASE_URL at a\n` +
        `  non-production database, e.g. relay_staging). Refusing to guess.`,
    )
  }
  assertNoProductionDatabase(env)
  const configured = DATABASE_URL_VARS.filter((variable) => Boolean(env[variable]))
  if (configured.length === 0) {
    throw new Error('Live database tests require DATABASE_URL or SERVICE_DATABASE_URL to be set.')
  }
}

/** Human-readable summary, for global setup logging. */
export function describeDatabaseTarget(env: NodeJS.ProcessEnv = process.env): string {
  const parts = DATABASE_URL_VARS.filter((variable) => env[variable]).map((variable) => {
    const parsed = parseDatabaseUrl(env[variable] as string)
    return `${variable}=${parsed ? `${parsed.host}/${parsed.name}` : '<unparsable>'}`
  })
  return parts.length > 0 ? parts.join(' ') : 'no database URL configured'
}
