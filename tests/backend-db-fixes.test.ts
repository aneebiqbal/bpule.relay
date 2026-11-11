/**
 * Backend database fixes: schema-level assertions.
 *
 * These are the issues found by exercising every write path against a live
 * database and a fresh migration run — not UI behaviour. A regression here is a
 * silent security or data-integrity failure, so the migrations are pinned.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations')
const read = (file: string) => readFileSync(path.join(MIGRATIONS, file), 'utf8')

describe('profile coverage configuration writes', () => {
  it('uses 1-based priorities, matching the column check constraint', async () => {
    const source = readFileSync(
      path.join(ROOT, 'src', 'lib', 'coverage', 'actions.ts'),
      'utf8',
    )
    // `priority >= 1` is a hard DB constraint; a PRIMARY row written as 0 was
    // rejected by profile_coverage_priority_check.
    expect(source).not.toMatch(/role:\s*'PRIMARY'[^}]*priority:\s*0/)
    expect(source).toMatch(/priority:\s*1/)
    expect(source).toMatch(/index \+ 1/)
  })
})

describe('mailbox OAuth challenge insert', () => {
  it('grants the authenticated connect route an org-scoped INSERT policy', () => {
    const migration = read('20261106140000_backend_db_fixes.sql')
    expect(migration).toContain('"eoc_insert"')
    expect(migration).toContain('for insert')
    expect(migration).toContain('organization_id = current_org_id()')
  })

  it('enforces one active coverage assignment per profile', () => {
    const migration = read('20261106140000_backend_db_fixes.sql')
    expect(migration).toContain('ca_one_active_profile_idx')
    expect(migration).toContain("where status = 'ACTIVE'")
  })
})

describe('anonymous key exposure', () => {
  it('revokes the anon default privileges and existing grants', () => {
    const migration = read('20261106150000_revoke_anon_default_privileges.sql')
    expect(migration).toContain('alter default privileges for role neondb_owner in schema public')
    expect(migration).toContain('revoke all on all tables in schema public from anon')
    expect(migration).toContain('revoke all on table auth_user_mapping from anon')
    // The mapping table has no RLS, so no application role may hold grants.
    expect(migration).toContain('revoke all on table auth_user_mapping from authenticated')
    expect(migration).toContain('revoke all on table auth_user_mapping from relay_app')
  })
})

describe('SECURITY DEFINER surface', () => {
  it('guards atomic_log_send against cross-rep and cross-org attribution', () => {
    const migration = read('20261106160000_security_definer_guards.sql')
    expect(migration).toContain('p_org_id <> public.current_org_id()')
    expect(migration).toContain('p_rep_id <> public.current_rep_id()')
  })

  it('scopes next_sample_version to the caller organization', () => {
    const migration = read('20261106160000_security_definer_guards.sql')
    expect(migration).toContain('and organization_id = current_org_id()')
  })

  it('narrows EXECUTE on every public function to the application roles', () => {
    const migration = read('20261106160000_security_definer_guards.sql')
    expect(migration).toContain("revoke execute on function %s from public")
    expect(migration).toContain("grant execute on function %s to authenticated, service_role")
  })
})

describe('policy roles', () => {
  it('recreates `to public` policies for authenticated and service_role only', () => {
    const migration = read('20261106170000_public_policy_roles.sql')
    expect(migration).toContain("'public' = any(roles)")
    expect(migration).toContain('to authenticated, service_role')
  })
})

describe('service client RLS bypass', () => {
  it('uses a dedicated service connection so relay_app can be least-privilege', () => {
    const source = readFileSync(path.join(ROOT, 'src', 'lib', 'db', 'neon.ts'), 'utf8')
    expect(source).toContain('getNeonServicePool')
    expect(source).toContain('SERVICE_DATABASE_URL')
    expect(source).toMatch(/neonServiceDbClient\(pool:\s*Pool\s*=\s*getNeonServicePool\(\)\)/)
  })
})
