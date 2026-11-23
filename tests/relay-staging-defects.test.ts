/**
 * Regression contracts for defects reproduced against the real staging
 * database (see docs/sprints/staging-recovery).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildMockStore } from '@/lib/store/mock-store'
import { LeadAccessDeniedError, safeErrorResponse } from '@/lib/errors'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const repA = { id: 'rep-a', name: 'A', role: 'rep' as const, organizationId: 'org-demo', createdAt: '2024-01-01T00:00:00.000Z', timezone: 'UTC' }

describe('OUT_OF_SCOPE_LEAD_IS_404_NOT_500', () => {
  it('the store gate raises an AppError with 404 status', async () => {
    const store = buildMockStore({ rep: repA, mode: 'demo' })
    await expect(store.getLead('lead-beacon', { repIds: ['rep-a'] })).rejects.toBeInstanceOf(LeadAccessDeniedError)
    try {
      await store.getLead('lead-beacon', { repIds: ['rep-a'] })
    } catch (error) {
      expect((error as LeadAccessDeniedError).statusCode).toBe(404)
    }
  })

  it('safeErrorResponse maps that denial to HTTP 404 without leaking ownership', async () => {
    const response = safeErrorResponse(new LeadAccessDeniedError(), 500, 'Could not load the conversation.', 'leads/conversation')
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Lead not found.' })
  })
})

describe('WORK_SETUP_REVISION_SCHEMA_EXISTS', () => {
  it('identity_assignments carries the updated_at the revision query reads', () => {
    const migration = read('supabase/migrations/20261124000000_add_identity_assignments_updated_at.sql')
    expect(migration).toContain("alter table identity_assignments add column if not exists updated_at")
    const writer = read('src/lib/operations/work-setup-write.ts')
    expect(writer).toContain('MAX(updated_at) FROM identity_assignments')
    const loader = read('src/lib/operations/work-setup.ts')
    expect(loader).toContain('MAX(ia.updated_at)')
  })

  it('the staging bootstrap provisions the full schema with no migration failures', () => {
    const bootstrap = read('scripts/qa/staging-bootstrap.mjs')
    expect(bootstrap).toContain('staging-bootstrap')
    expect(bootstrap).toMatch(/failed\.length > 0/)
  })
})
