/**
 * Final production activation regression guards.
 *
 * SECURITY DEFINER hardening · controlled stale reanalysis (dry run).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { staleVersionBreakdown } from '@/lib/intelligence-v3/stale-reanalysis'
import { SCORING_VERSION } from '@/lib/intelligence-v3/versions'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const migrations = readdirSync(join(ROOT, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8'))
  .join('\n')

describe('Day 1.5 — SECURITY DEFINER hardening', () => {
  it('append_rescore_event is scoped to the caller organisation', () => {
    expect(migrations).toMatch(/append_rescore_event[\s\S]{0,900}?organization_id = current_org_id\(\)/)
  })

  it('the two dataset RPCs verify org and reviewer', () => {
    expect(migrations).toMatch(/append_sample_event[\s\S]{0,900}?organization_id = current_org_id\(\)/)
    expect(migrations).toMatch(/approve_sample_for_training[\s\S]{0,900}?is_org_admin\(\)/)
  })

  it('no SECURITY DEFINER mutator lacks an org guard', () => {
    // The mutating security-definer functions must each be org-scoped in their
    // LATEST definition (later migrations supersede earlier ones).
    const guarded = (name: string, pattern: RegExp) => {
      const re = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\b`, 'gi')
      const matches = [...migrations.matchAll(re)]
      expect(matches.length, `${name} should be defined`).toBeGreaterThan(0)
      const last = matches[matches.length - 1]!
      const body = migrations.slice(last.index, last.index + 5000)
      expect(body, `${name} should be org-scoped`).toMatch(pattern)
    }
    guarded('append_rescore_event', /organization_id = current_org_id\(\)/)
    guarded('append_sample_event', /organization_id = current_org_id\(\)/)
    guarded('refresh_few_shot_wins', /cross-org denied/)
  })
})

describe('Day 5 — stale reanalysis is a dry run', () => {
  it('breaks stale versions down and excludes the current one', () => {
    const breakdown = staleVersionBreakdown([
      { score_version: SCORING_VERSION },
      { score_version: 'relay_decision_v3.2.0' },
      { score_version: 'relay_decision_v3.2.0' },
      { score_version: 'relay_decision_v3.1.0' },
    ])
    expect(breakdown[SCORING_VERSION]).toBeUndefined()
    expect(breakdown['relay_decision_v3.2.0']).toBe(2)
    expect(breakdown['relay_decision_v3.1.0']).toBe(1)
  })
})
