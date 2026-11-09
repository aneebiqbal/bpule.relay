/**
 * Cutover verifier contracts.
 *
 * The release gate must fail on a warm owner pool. Counting opened backends is
 * not enough: a warm pool reuses connections and produces a false pass. These
 * tests pin the role-attributed assertion that replaced it.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  assertCutover,
  classifyRoleAttribution,
} from '../scripts/qa/role-attribution.mjs'

const SET_CONFIG = 'SELECT set_config($1, $2, $3)'
const LEADS_READ = 'SELECT id, name FROM "leads" WHERE "organization_id" = $1'

function rows(...entries) {
  return entries.map(([role, query, calls]) => ({ role, query, calls }))
}

describe('CUTOVER_VERIFIER_WARM_POOL_SAFE', () => {
  it('owner page traffic fails even when no new backend was opened', () => {
    const attribution = classifyRoleAttribution(
      rows(['neondb_owner', SET_CONFIG, 85], ['neondb_owner', LEADS_READ, 9]),
    )
    const verdict = assertCutover(attribution)
    expect(verdict.pass).toBe(false)
    expect(verdict.reason).toMatch(/owner executed 85/)
  })

  it('relay_app page traffic passes', () => {
    const attribution = classifyRoleAttribution(
      rows(['relay_app', SET_CONFIG, 85], ['relay_app', LEADS_READ, 9]),
    )
    const verdict = assertCutover(attribution)
    expect(verdict.pass).toBe(true)
    expect(verdict.reason).toMatch(/relay_app executed 85/)
  })

  it('no page request is inconclusive and fails', () => {
    const attribution = classifyRoleAttribution(rows(['cloud_admin', 'SELECT pg_sleep($1)', 100]))
    const verdict = assertCutover(attribution)
    expect(verdict.pass).toBe(false)
    expect(verdict.reason).toMatch(/inconclusive/)
  })

  it('mixed relay_app and owner application queries fail', () => {
    const attribution = classifyRoleAttribution(
      rows(['relay_app', SET_CONFIG, 40], ['neondb_owner', SET_CONFIG, 45]),
    )
    const verdict = assertCutover(attribution)
    expect(verdict.pass).toBe(false)
    expect(verdict.reason).toMatch(/owner executed 45/)
  })

  it('service-pool reads without set_config are not runtime application calls', () => {
    // The service client never sets the RLS GUC, so owner reads alone are not
    // evidence of a leak — but they are also not evidence of a healthy app.
    const attribution = classifyRoleAttribution(rows(['neondb_owner', LEADS_READ, 50]))
    expect(attribution.runtimeOwnerCalls).toBe(0)
    expect(attribution.runtimeAppCalls).toBe(0)
    expect(assertCutover(attribution).pass).toBe(false)
  })

  it('verifier diagnostics exclude its own reset, role and stat reads', () => {
    const attribution = classifyRoleAttribution(
      rows(
        ['neondb_owner', 'SELECT rolname, rolbypassrls FROM pg_roles', 3],
        ['neondb_owner', 'SELECT userid, calls, query FROM pg_stat_statements', 2],
        ['relay_app', SET_CONFIG, 60],
      ),
    )
    expect(attribution.runtimeAppCalls).toBe(60)
    expect(attribution.runtimeOwnerCalls).toBe(0)
    expect(assertCutover(attribution).pass).toBe(true)
  })
})

describe('CUTOVER_VERIFIER_SHIPPED_WARM_POOL_SAFE', () => {
  const source = readFileSync(join(process.cwd(), 'scripts/qa/verify-production-rls-cutover.mjs'), 'utf8')

  it('uses role attribution as the primary assertion', () => {
    expect(source).toMatch(/classifyRoleAttribution/)
    expect(source).toMatch(/assertCutover/)
  })

  it('resets pg_stat_statements for the proof and the control', () => {
    expect(source).toMatch(/pg_stat_statements_reset/)
    expect(source).toMatch(/control/i)
  })

  it('labels backend counts as diagnostic only', () => {
    expect(source).toMatch(/DIAGNOSTIC ONLY/)
  })
})
