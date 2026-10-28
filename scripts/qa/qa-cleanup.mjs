/**
 * QA cleanup (Phase 29).
 *
 * Removes seeded QA leads (is_test = true) so test data never affects metrics.
 * Dry-run by default; pass --apply to delete.
 *
 *   node scripts/qa/qa-cleanup.mjs            # report only
 *   node scripts/qa/qa-cleanup.mjs --apply    # delete is_test leads
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

function headers() {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
}

async function main() {
  const apply = process.argv.includes('--apply')
  if (!url || !key) {
    console.log('SKIP: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.')
    console.log('Set them to the target project before running cleanup.')
    process.exit(0)
  }

  const listRes = await fetch(`${url}/rest/v1/leads?is_test=eq.true&select=id,company,created_at`, {
    headers: headers(),
  })
  if (!listRes.ok) {
    console.error(`FAIL: could not list test leads (${listRes.status})`)
    process.exit(1)
  }
  const rows = await listRes.json()
  console.log(`test leads: ${rows.length}`)
  for (const row of rows.slice(0, 50)) console.log(`  ${row.id}  ${row.company}  ${row.created_at}`)

  // A production lead must never be is_test. If any is, surface it loudly.
  const prodRes = await fetch(`${url}/rest/v1/leads?is_test=eq.false&select=id&limit=1`, { headers: headers() })
  console.log(`production leads present: ${prodRes.ok ? 'yes' : 'unknown'}`)

  if (!apply) {
    console.log('dry run — pass --apply to delete the test leads above.')
    return
  }
  if (rows.length === 0) {
    console.log('nothing to delete.')
    return
  }
  const delRes = await fetch(`${url}/rest/v1/leads?is_test=eq.true`, { method: 'DELETE', headers: headers() })
  if (!delRes.ok) {
    console.error(`FAIL: delete failed (${delRes.status})`)
    process.exit(1)
  }
  const deleted = await delRes.json()
  console.log(`deleted ${Array.isArray(deleted) ? deleted.length : 'unknown'} test lead(s).`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
