/**
 * Fail-closed database isolation contracts.
 *
 * A previous configuration pointed the live suite at `relay_prod_final`, so
 * `npm run test:live` wrote to production. These tests pin the guard that must
 * reject production under every plausible misconfiguration.
 */
import { describe, expect, it } from 'vitest'
import {
  assertLiveTestIsolation,
  assertNoProductionDatabase,
  describeDatabaseTarget,
  isProductionDatabaseName,
  productionViolations,
} from '@/lib/db/test-isolation'

const PROD = 'postgres://user:secret@pg-393a7079.example.com:22864/relay_prod_final'
const STAGING = 'postgres://user:secret@pg-393a7079.example.com:22864/relay_staging'

describe('isProductionDatabaseName', () => {
  it('recognizes production names', () => {
    expect(isProductionDatabaseName('relay_prod_final')).toBe(true)
    expect(isProductionDatabaseName('relay_prod')).toBe(true)
    expect(isProductionDatabaseName('production')).toBe(true)
    expect(isProductionDatabaseName('my-production-db')).toBe(true)
  })

  it('accepts staging and local names', () => {
    expect(isProductionDatabaseName('relay_staging')).toBe(false)
    expect(isProductionDatabaseName('relay_test')).toBe(false)
    expect(isProductionDatabaseName('scout_local')).toBe(false)
  })
})

describe('productionViolations', () => {
  it('rejects a production DATABASE_URL', () => {
    const violations = productionViolations({ DATABASE_URL: PROD })
    expect(violations.join('\n')).toMatch(/DATABASE_URL.*production/)
  })

  it('rejects a swapped SERVICE_DATABASE_URL even when DATABASE_URL is clean', () => {
    const violations = productionViolations({ DATABASE_URL: STAGING, SERVICE_DATABASE_URL: PROD })
    expect(violations.join('\n')).toMatch(/SERVICE_DATABASE_URL.*production/)
  })

  it('rejects production supplied through two different variables', () => {
    const violations = productionViolations({
      DATABASE_URL: PROD,
      RELAY_TEST_DATABASE_URL: PROD,
      RELAY_TEST_DATABASE: '1',
    })
    expect(violations).toHaveLength(2)
  })

  it('does not leak credentials in violation messages', () => {
    const violations = productionViolations({ DATABASE_URL: PROD })
    expect(violations.join('\n')).not.toContain('secret')
  })

  it('honors an explicit service fingerprint', () => {
    const violations = productionViolations({
      DATABASE_URL: STAGING,
      RELAY_PRODUCTION_SERVICE_FINGERPRINT: 'prod-host',
    })
    expect(violations).toHaveLength(0)
    const hit = productionViolations({
      DATABASE_URL: 'postgres://u:p@prod-host.example.com:5432/relay_staging',
      RELAY_PRODUCTION_SERVICE_FINGERPRINT: 'prod-host',
    })
    expect(hit.join('\n')).toMatch(/fingerprinted production service/)
  })
})

describe('assertNoProductionDatabase', () => {
  it('throws on production and passes on staging', () => {
    expect(() => assertNoProductionDatabase({ DATABASE_URL: PROD })).toThrow(/production database/i)
    expect(() => assertNoProductionDatabase({ DATABASE_URL: STAGING })).not.toThrow()
  })
})

describe('assertLiveTestIsolation', () => {
  it('rejects staging without the opt-in marker (fail closed)', () => {
    expect(() => assertLiveTestIsolation({ DATABASE_URL: STAGING })).toThrow(/marker/i)
  })

  it('rejects production even when the marker is set', () => {
    expect(() =>
      assertLiveTestIsolation({ DATABASE_URL: PROD, RELAY_TEST_DATABASE: '1' }),
    ).toThrow(/production database/i)
  })

  it('fails closed when no database URL is configured', () => {
    expect(() => assertLiveTestIsolation({ RELAY_TEST_DATABASE: '1' })).toThrow(/require DATABASE_URL/i)
  })

  it('accepts staging with the marker', () => {
    expect(() =>
      assertLiveTestIsolation({ DATABASE_URL: STAGING, RELAY_TEST_DATABASE: '1' }),
    ).not.toThrow()
  })

  it('describes the target without credentials', () => {
    const summary = describeDatabaseTarget({ DATABASE_URL: STAGING })
    expect(summary).toContain('relay_staging')
    expect(summary).not.toContain('secret')
  })
})
