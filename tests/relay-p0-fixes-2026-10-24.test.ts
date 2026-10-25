/**
 * Relay — P0/P1 fixes applied 2026-10-24 (audit pass).
 *
 * Guards the specific regressions fixed in this pass so they do not return:
 *  1. `leads` has no `updated_at`; accountability and revenue-intelligence must
 *     not query it (the query errors silently into zeros).
 *  2. The dataset metrics event count must read the exact count and be org-scoped.
 *  3. /api/admin/performance and /api/admin/rep-performance must gate team data
 *     behind VIEW_TEAM_ANALYTICS (a rep may read only their own row).
 *  4. intelligence_sample_events must have RLS enabled.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (entry.endsWith('.ts')) out.push(full)
  }
  return out
}

const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

describe('P0 — leads.updated_at is not queried', () => {
  const offenders = walk(join(ROOT, 'src'))
    .filter((f) => !f.endsWith('.test.ts'))
    .filter((f) => {
      const src = readFileSync(f, 'utf8')
      // Only flag a leads() builder that touches updated_at.
      return /from\(['"]leads['"]\)[\s\S]{0,400}?updated_at/.test(src)
    })
  it('no leads query references the non-existent updated_at column', () => {
    expect(offenders).toEqual([])
  })
})

describe('P0 — revenue intelligence no longer selects updated_at', () => {
  it('drops updated_at from the leads select', () => {
    const src = read('src/app/api/admin/revenue-intelligence/route.ts')
    const select = src.match(/from\('leads'\)\.select\('([^']+)'\)/)
    expect(select).not.toBeNull()
    expect(select![1]).not.toContain('updated_at')
    expect(select![1]).toContain('created_at')
  })
})

describe('P0 — accountability wins use outcomes, not leads.updated_at', () => {
  it('counts wins from the outcomes table', () => {
    const src = read('src/lib/accountability/metrics.ts')
    expect(src).toContain(".from('outcomes')")
    expect(src).toContain(".eq('stage', 'won')")
    expect(src).toContain("'occurred_at'")
    expect(src).not.toMatch(/from\(['"]leads['"]\)[\s\S]{0,300}?updated_at/)
  })
})

describe('P0 — dataset metrics event count is exact and org-scoped', () => {
  it('reads the count and filters by organization_id', () => {
    const src = read('src/lib/dataset/metrics.ts')
    expect(src).toContain('count: \'exact\'')
    expect(src).toContain('editEventCount')
    expect(src).toContain(".eq('organization_id', orgId)")
    expect(src).not.toContain('editEvents ? (editEvents as unknown as []).length')
  })
})

describe('P1 — admin performance routes gate team data', () => {
  it('/api/admin/rep-performance requires VIEW_TEAM_ANALYTICS', () => {
    const src = read('src/app/api/admin/rep-performance/route.ts')
    expect(src).toContain("can(auth, 'VIEW_TEAM_ANALYTICS')")
  })

  it('/api/admin/performance allows self but gates other reps', () => {
    const src = read('src/app/api/admin/performance/route.ts')
    expect(src).toContain("can(auth, 'VIEW_TEAM_ANALYTICS')")
    expect(src).toContain('repId !== auth.repId')
  })
})

describe('P0 — intelligence_sample_events has RLS enabled', () => {
  it('a migration enables row level security on the events table', () => {
    const migrations = readdirSync(join(ROOT, 'supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8'))
      .join('\n')
    expect(migrations).toMatch(
      /alter\s+table\s+intelligence_sample_events\s+enable\s+row\s+level\s+security/i,
    )
  })
})
