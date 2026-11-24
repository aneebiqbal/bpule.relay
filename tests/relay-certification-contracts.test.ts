/**
 * Certification contracts: the guarantees the disposable-environment harnesses
 * depend on must stay wired to the canonical sources.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { LeadAccessDeniedError } from '@/lib/errors'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

describe('PROVIDER_PARITY_USES_CANONICAL_BOOTSTRAP', () => {
  it('staging bootstrap runs the repository Aiven bootstrap, not a private shim', () => {
    const bootstrap = read('scripts/qa/staging-bootstrap.mjs')
    expect(bootstrap).toContain("supabase/aiven/bootstrap.sql")
    // The old private copy stubbed auth.uid() to NULL, which silently disabled
    // every organization policy in the test environment.
    expect(bootstrap).not.toContain("select null::uuid $$")
  })

  it('the canonical bootstrap derives identity from the request context', () => {
    const sql = read('supabase/aiven/bootstrap.sql')
    expect(sql).toContain("current_setting('app.current_user_id'")
    expect(sql).toContain("request.jwt.claim.sub")
    expect(sql).toContain("in role authenticated")
  })
})

describe('ADMIN_BOUNDARY_IS_ENFORCED_TWICE', () => {
  it('the Work Setup API requires the target capability', () => {
    const route = read('src/app/api/admin/work-setup/route.ts')
    expect(route).toContain("can(ctx, 'MANAGE_TEAM_TARGETS')")
  })

  it('the Work Setup page uses the canonical product-admin guard', () => {
    const page = read('src/app/(app)/admin/targets/page.tsx')
    expect(page).toContain('requireProductAdmin')
  })
})

describe('TENANT_DENIAL_IS_A_404_APP_ERROR', () => {
  it('exposes a typed 404 denial instead of a generic 500', () => {
    const error = new LeadAccessDeniedError()
    expect(error.statusCode).toBe(404)
    expect(error.safeMessage).toBe('Lead not found.')
    expect(error.message).toMatch(/not the owner/i)
  })

  it('both store adapters raise it', () => {
    expect(read('src/lib/store/supabase-store.ts')).toContain('LeadAccessDeniedError')
    expect(read('src/lib/store/mock-store.ts')).toContain('LeadAccessDeniedError')
  })
})
