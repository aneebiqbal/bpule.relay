/**
 * Shared safety gate for QA / maintenance scripts.
 *
 *   import { assertSafeScriptTarget } from './assert-safe-target.mjs'
 *   assertSafeScriptTarget()
 *
 * Rejects:
 *   - any DATABASE_URL / SERVICE_DATABASE_URL pointing at a production database;
 *   - a browser BASE_URL pointing at the production hostname, unless the caller
 *     explicitly sets RELAY_ALLOW_PRODUCTION_TARGET=1.
 */
import { assertNoProductionDatabase } from '../../src/lib/db/test-isolation.ts'

const PRODUCTION_HOSTS = ['relay.bpulse.dev', 'bpule-relay.vercel.app']

export function assertSafeScriptTarget(env = process.env): void {
  assertNoProductionDatabase(env)
  const base = env.BASE_URL ?? ''
  if (!base) return
  const host = (() => {
    try {
      return new URL(base).host
    } catch {
      return ''
    }
  })()
  if (PRODUCTION_HOSTS.some((production) => host === production || host.endsWith(`.${production}`))) {
    if (env.RELAY_ALLOW_PRODUCTION_TARGET !== '1') {
      throw new Error(
        `Refusing to run a record-creating QA script against production host "${host}".\n` +
          '  Set RELAY_ALLOW_PRODUCTION_TARGET=1 only if you genuinely intend this.',
      )
    }
  }
}

// Allow direct execution: `node scripts/qa/assert-safe-target.mjs`
if (process.argv[1] && process.argv[1].endsWith('assert-safe-target.mjs')) {
  try {
    assertSafeScriptTarget()
    console.log('safe target')
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
