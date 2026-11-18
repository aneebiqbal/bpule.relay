import { config } from 'dotenv'
config({ path: '.env.local' })
import { createServiceSupabase } from '../src/lib/supabase/service'
const ORG = '11111111-1111-1111-1111-111111111111'
async function main() {
  const c = createServiceSupabase() as any
  const { data: reps } = await c.from('reps').select('id, name, role').eq('organization_id', ORG)
  console.log('REPS:', JSON.stringify(reps))
  const { data: rows } = await c.from('identity_assignments').select('rep_id, revenue_identity_id').eq('organization_id', ORG)
  const { data: idn } = await c.from('revenue_identities').select('id, identity_name, channel, profile_id').eq('organization_id', ORG).eq('status','active')
  const byId = new Map((idn ?? []).map((i: any) => [i.id, i]))
  const byRep: Record<string, string[]> = {}
  for (const r of rows ?? []) {
    const i = byId.get((r as any).revenue_identity_id)
    if (!i) continue
    ;(byRep[(r as any).rep_id] ??= []).push(`${i.identity_name}/${i.channel}`)
  }
  for (const [rep, list] of Object.entries(byRep)) console.log(rep, JSON.stringify(list))
  console.log('REPS_BY_ID:', JSON.stringify(Object.fromEntries((reps ?? []).map((r: any) => [r.id, r.name]))))
}
main().then(()=>process.exit(0)).catch(e=>{console.error('FATAL',e);process.exit(1)})
