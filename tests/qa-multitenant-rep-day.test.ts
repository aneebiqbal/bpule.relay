/**
 * MULTITENANT_REP_DAY
 *
 * `rep_day` is organization-scoped and RLS-protected. A rep reads their own
 * day; an admin reads the organization's; a manager reads their team's; nobody
 * reads another organization's. These assertions are on the migration itself,
 * because a policy that exists only in a comment protects nothing.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const repDaySql = readFileSync(
  join(ROOT, 'supabase/migrations/20261030120100_rep_day.sql'),
  'utf8',
)
const policySql = readFileSync(
  join(ROOT, 'supabase/migrations/20261030120000_organization_operating_clock.sql'),
  'utf8',
)
const schedulerSql = readFileSync(
  join(ROOT, 'supabase/migrations/20261030120200_operational_scheduler.sql'),
  'utf8',
)
const teamTs = readFileSync(join(ROOT, 'src/lib/rep-day/team.ts'), 'utf8')

function normalized(sql: string): string {
  return sql.replace(/\s+/g, ' ').toLowerCase()
}

describe('MULTITENANT_REP_DAY — schema', () => {
  it('every new table carries organization_id and is RLS-enabled', () => {
    for (const sql of [policySql, repDaySql, schedulerSql]) {
      expect(normalized(sql)).toMatch(/organization_id uuid (primary key|not null)/)
      expect(normalized(sql)).toContain('enable row level security')
    }
  })

  it('rep_day is unique per organization, rep and business date', () => {
    expect(normalized(repDaySql)).toContain('unique (organization_id, rep_id, business_date)')
  })

  it('a rep can only insert their own day', () => {
    expect(normalized(repDaySql)).toContain('create policy "rd_insert_self"')
    expect(normalized(repDaySql)).toContain('rep_id = current_rep_id()')
    expect(normalized(repDaySql)).toContain('organization_id = current_org_id()')
  })

  it('a rep reads their own day, an admin the organization, a manager their team', () => {
    expect(normalized(repDaySql)).toContain('create policy "rd_select"')
    expect(normalized(repDaySql)).toContain('or is_org_admin()')
    expect(normalized(repDaySql)).toContain("managed.membership_role = 'manager'")
  })

  it('the scheduler outbox is invisible to authenticated users', () => {
    expect(normalized(schedulerSql)).toContain('enable row level security')
    expect(normalized(schedulerSql)).toContain('intentionally no policies')
    expect(normalized(schedulerSql)).not.toContain('create policy')
  })

  it('the policy table is admin-writable and member-readable only inside the org', () => {
    expect(normalized(policySql)).toContain('create policy "oop_select"')
    expect(normalized(policySql)).toContain('create policy "oop_update"')
    expect(normalized(policySql)).toContain('and is_org_admin()')
  })
})

describe('MULTITENANT_REP_DAY — the team contract', () => {
  it('requires an admin or manager and always filters by the caller org', () => {
    expect(teamTs).toContain('if (!ctx.isAdmin && !ctx.isManager) return base')
    expect(teamTs).toContain(".eq('organization_id', ctx.orgId)")
  })

  it('never accepts a rep id from the caller', () => {
    expect(teamTs).not.toMatch(/searchParams|body\.repId|request\.json/)
  })

  it('degrades to an empty summary when the table is absent', () => {
    expect(teamTs).toContain('42P01')
  })
})
