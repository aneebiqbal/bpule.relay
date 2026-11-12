/**
 * Migration version integrity.
 *
 * A migration whose version collides with another file can never be recorded in
 * supabase_migrations.schema_migrations, so it silently never runs. The V6.1
 * daily-plan migration shipped as 20261111120000 — the same version as the
 * already-recorded V6.0 foundation — and was therefore unreachable. Pin the
 * versions so a collision fails the suite instead of the deploy.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { serviceDbClient } from '@/lib/db/client'

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations')

/**
 * Legacy collision, accepted and recorded: v49 was never applied because its
 * version was taken by upwork_lifecycle_v51. No new collision may join it.
 */
const KNOWN_LEGACY_DUPLICATES = new Set(['20261110080000'])

function migrationVersions(): Array<{ version: string; file: string }> {
  return readdirSync(MIGRATIONS)
    .filter((file) => /^\d+.*\.sql$/.test(file))
    .map((file) => ({ version: file.match(/^(\d+)/)![1], file }))
}

describe('MIGRATION_VERSION_UNIQUE', () => {
  it('no two migration files share a version, except the recorded legacy pair', () => {
    const byVersion = new Map<string, string[]>()
    for (const { version, file } of migrationVersions()) {
      const list = byVersion.get(version) ?? []
      list.push(file)
      byVersion.set(version, list)
    }
    const collisions = [...byVersion.entries()]
      .filter(([version, files]) => files.length > 1 && !KNOWN_LEGACY_DUPLICATES.has(version))
      .map(([version, files]) => ({ version, files }))
    expect(collisions).toEqual([])
  })

  it('no migration file reuses a version already recorded in schema_migrations', async () => {
    const client = serviceDbClient()
    const { data: recorded, error } = await client.raw<{ version: string }>(
      'select version from supabase_migrations.schema_migrations limit 1000',
    )
    expect(error).toBeNull()
    const recordedVersions = new Set((recorded ?? []).map((row) => row.version as string))
    // A recorded version may map to exactly one file — the file that was applied.
    const collisions = migrationVersions()
      .filter((row) => recordedVersions.has(row.version) && !KNOWN_LEGACY_DUPLICATES.has(row.version))
      .reduce((counts, row) => counts.set(row.version, (counts.get(row.version) ?? 0) + 1), new Map<string, number>())
    const duplicated = [...collisions.entries()].filter(([, count]) => count > 1)
    expect(duplicated).toEqual([])
  }, 60_000)
})

describe('V6.1_PLAN_MIGRATION_ORDER', () => {
  it('the plan table is created before the completion RPC reads it', () => {
    const files = migrationVersions()
    const table = files.find((row) => row.file.includes('daily_target_plans'))
    const rpc = files.find((row) => row.file.includes('record_activity_plan_truth'))
    expect(table?.version).toBe('20261111130000')
    expect(rpc?.version).toBe('20261111140000')
    expect(Number(table!.version)).toBeLessThan(Number(rpc!.version))
  })
})
