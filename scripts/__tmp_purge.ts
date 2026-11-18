import { config } from 'dotenv'
config({ path: '.env.local' })
import { createServiceSupabase } from '../src/lib/supabase/service'
const ORG = '11111111-1111-1111-1111-111111111111'
async function main() {
  const c = createServiceSupabase() as any
  const { data: profiles } = await c.from('profiles').select('id, label, full_name, archived_at').eq('organization_id', ORG)
  const isTest = (p: any) => p.archived_at == null && (
    /^(zz|v6 fixture)/i.test(`${p.label ?? ''}`) ||
    (p.label == null && /^TEST JSON$/i.test(`${p.full_name ?? ''}`))
  )
  const candidates = (profiles ?? []).filter(isTest)

  const report: any[] = []
  for (const p of candidates) {
    const { data: idn } = await c.from('revenue_identities').select('id').eq('profile_id', p.id)
    const acct = (idn ?? []).map((i: any) => i.id)
    const counts: Record<string, number> = {}
    if (acct.length) {
      for (const [k, t, col] of [['assigns','identity_assignments','revenue_identity_id'],['targets','daily_target_plans','revenue_identity_id'],['leads','leads','sender_profile_id'],['msgs','messages','sender_profile_id']] as const) {
        const { count } = await c.from(t).select('id', { count: 'exact', head: true }).in(col as string, acct)
        counts[k] = count ?? 0
      }
    }
    const { count: cov } = await c.from('profile_coverage').select('id', { count: 'exact', head: true }).eq('profile_id', p.id)
    const { count: know } = await c.from('profile_experience').select('id', { count: 'exact', head: true }).eq('profile_id', p.id)
    const deps = Object.values(counts).reduce((a, b) => a + b, 0) + (cov ?? 0) + (know ?? 0) + acct.length
    report.push({ id: p.id, label: p.label ?? p.full_name, identities: acct.length, cov, know, ...counts, deps })
  }

  const deletable = report.filter((r) => r.deps === 0)
  const protectedRows = report.filter((r) => r.deps > 0)
  console.log('DELETE:', deletable.length, JSON.stringify(deletable.map((r) => r.label)))
  console.log('ARCHIVE:', protectedRows.length, JSON.stringify(protectedRows.map((r) => ({ label: r.label, deps: r.deps }))))

  // 1. Archive anything with dependencies (never delete).
  for (const row of protectedRows) {
    const { error } = await c.from('profiles').update({ archived_at: new Date().toISOString() }).eq('id', row.id).eq('organization_id', ORG)
    if (error) throw new Error(`archive ${row.label}: ${error.message}`)
    await c.from('accountability_audit_log').insert({
      organization_id: ORG, rep_id: 'aaaaaaaa-0000-0000-0000-000000000001',
      revenue_identity_id: null, event_type: 'profile_archived',
      detail: { reason: 'test fixture cleanup', profile_id: row.id },
    })
  }

  // 2. Delete zero-dependency test profiles, guarded.
  for (const row of deletable) {
    const { data: idn } = await c.from('revenue_identities').select('id').eq('profile_id', row.id)
    for (const i of idn ?? []) {
      await c.from('identity_assignments').delete().eq('revenue_identity_id', i.id)
      await c.from('daily_target_plans').delete().eq('revenue_identity_id', i.id)
    }
    await c.from('revenue_identities').delete().eq('profile_id', row.id)
    await c.from('profile_coverage').delete().eq('profile_id', row.id)
    await c.from('profile_experience').delete().eq('profile_id', row.id)

    const { error } = await c.from('profiles').delete().eq('id', row.id).eq('organization_id', ORG)
    if (error) throw new Error(`delete ${row.label}: ${error.message}`)
    await c.from('accountability_audit_log').insert({
      organization_id: ORG, rep_id: 'aaaaaaaa-0000-0000-0000-000000000001',
      revenue_identity_id: null, event_type: 'test_profile_deleted',
      detail: { profile_id: row.id, label: row.label },
    })
  }

  const { data: after } = await c.from('profiles').select('id, label, archived_at').eq('organization_id', ORG)
  console.log('REMAINING PROFILES:', after?.length)
  console.log('REMAINING LABELS:', JSON.stringify((after ?? []).map((p: any) => p.label ?? '(null)')))
}
main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1) })
