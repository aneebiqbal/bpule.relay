/**
 * One-off maintenance: repair double-encoded UTF-8 in existing job text.
 *
 * Non-destructive: only rewrites fields that contain the classic C1
 * continuation-byte signature, and only when the repaired value differs.
 * Re-run the inventory reindex afterwards.
 */
import { createServiceSupabase } from '@/lib/supabase/service'
import { repairEncoding } from '@/lib/job-discovery/adapters'

async function main() {
  const db = createServiceSupabase()
  const rows = await db.raw<Array<Record<string, unknown>>>(
    'select id, title, company, description, location_raw from jobs',
    [],
  )
  if (rows.error) throw new Error(rows.error.message)

  let repaired = 0
  for (const row of rows.data ?? []) {
    const title = repairEncoding(String(row.title ?? ''))
    const company = repairEncoding(String(row.company ?? ''))
    const description = repairEncoding(String(row.description ?? ''))
    const locationRaw = repairEncoding(String(row.location_raw ?? ''))
    if (title === row.title && company === row.company && description === row.description && locationRaw === row.location_raw) continue
    const result = await db.raw(
      'update jobs set title = ?, company = ?, description = ?, location_raw = ?, updated_at = now() where id = ?',
      [title, company, description, locationRaw, String(row.id)],
    )
    if (result.error) throw new Error(result.error.message)
    repaired++
  }
  console.log(JSON.stringify({ scanned: (rows.data ?? []).length, repaired }))
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1) })
