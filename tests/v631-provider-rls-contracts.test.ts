/**
 * V6.3.1 — provider RLS + service boundary (§32, §33).
 *
 * The four provider tables are org-isolated; configuration writes are admin-only.
 * Provider admin pages use the RLS runtime client, not the service boundary.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { execSync } from 'node:child_process'
import { closeNeonPool, neonServiceDbClient } from '@/lib/db/neon'

afterAll(async () => { await closeNeonPool() })

interface PolicyRow {
  tablename: string
  policyname: string
  cmd: string
  qual: string | null
  with_check: string | null
}

describe('PROVIDER_RLS', () => {
  it('every policy on the four provider tables is org-scoped', async () => {
    const client = neonServiceDbClient()
    const { data, error } = await client.raw<PolicyRow>(
      `select tablename, policyname, cmd, qual, with_check
       from pg_policies
       where tablename in ('provider_config','provider_saved_searches','provider_search_runs','provider_telemetry')
       order by tablename, policyname`,
      [],
    )
    expect(error).toBeNull()
    const policies = data ?? []
    expect(policies.length).toBeGreaterThan(0)
    for (const policy of policies) {
      const expression = `${policy.qual ?? ''} ${policy.with_check ?? ''}`
      expect(expression, `${policy.tablename}.${policy.policyname}`).toContain('current_org_id()')
    }
  }, 60_000)

  it('provider configuration writes require is_org_admin', async () => {
    const client = neonServiceDbClient()
    const { data, error } = await client.raw<PolicyRow>(
      `select tablename, policyname, cmd, qual, with_check
       from pg_policies
       where tablename in ('provider_config','provider_saved_searches')
         and cmd in ('INSERT','UPDATE','DELETE','ALL')
       order by tablename, policyname`,
      [],
    )
    expect(error).toBeNull()
    const writes = data ?? []
    expect(writes.length).toBeGreaterThan(0)
    for (const policy of writes) {
      const expression = `${policy.qual ?? ''} ${policy.with_check ?? ''}`
      expect(expression, `${policy.tablename}.${policy.policyname}`).toContain('is_org_admin()')
    }
  }, 60_000)

  it('provider runs and telemetry are read-only for org members', async () => {
    const client = neonServiceDbClient()
    const { data, error } = await client.raw<PolicyRow>(
      `select tablename, policyname, cmd, qual, with_check
       from pg_policies
       where tablename in ('provider_search_runs','provider_telemetry')
         and cmd in ('INSERT','UPDATE','DELETE','ALL')
       order by tablename, policyname`,
      [],
    )
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  }, 60_000)
})

describe('PROVIDER_SERVICE_BOUNDARY', () => {
  it('provider admin pages use the RLS client, not the service boundary', () => {
    const hits = execSync(
      "grep -rlE 'createServiceSupabase' src/app/api/admin/providers src/app/api/admin/provider-searches || true",
      { encoding: 'utf8' },
    ).trim()
    expect(hits).toBe('')
  })
})
