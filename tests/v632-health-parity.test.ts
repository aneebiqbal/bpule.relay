/**
 * V6.3.2 — provider health parity (§15).
 *
 * /admin/providers (raw config) and /admin/health (derived status) must agree:
 * the health status is a projection of the same provider_config truth, not a
 * separate status formula.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { computeHealth } from '@/lib/admin/health'
import { neonServiceDbClient, closeNeonPool } from '@/lib/db/neon'

const ORG = '11111111-1111-1111-1111-111111111111'

afterAll(async () => { await closeNeonPool() })

describe('HEALTH_PARITY', () => {
  it('health status is derived from provider_config, not a separate truth', async () => {
    const client = neonServiceDbClient()
    const report = await computeHealth(client, ORG)
    const { data: configs } = await client
      .from('provider_config')
      .select('provider, enabled, consecutive_failures, last_success_at')
      .eq('organization_id', ORG)

    expect(report.providerHealth.map((row) => row.provider)).toEqual(['prospeo', 'snov', 'apollo'])
    for (const row of configs ?? []) {
      const health = report.providerHealth.find((entry) => entry.provider === row.provider)
      expect(health).toBeTruthy()
      expect(health?.consecutiveFailures).toBe(row.consecutive_failures ?? 0)
      expect(health?.lastSuccessAt).toBe(row.last_success_at ?? null)
      if (row.enabled === false) expect(health?.status).toBe('DISABLED')
      else if ((row.consecutive_failures ?? 0) > 0) expect(health?.status).toBe('DEGRADED')
      else expect(['HEALTHY', 'UNCONFIGURED']).toContain(health?.status)
    }
  }, 60_000)
})
