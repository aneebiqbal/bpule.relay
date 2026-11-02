/** Preview runtime regressions found during V3 certification. */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { isMissingColumn, isSchemaNotReady } from '@/lib/operations/db-errors'
import {
  getDatabaseCapabilities,
  resetCapabilityCache,
} from '@/lib/operations/capabilities'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/**
 * Minimal DbClient double. `failFor` makes a table's select reject with the
 * shape error Neon actually returned on the preview.
 */
function fakeClient(failFor: Record<string, string> = {}) {
  const selected: string[] = []
  const makeBuilder = (table: string) => {
    const builder: Record<string, unknown> = {
      select(cols: string) {
        if (!selected.includes(`${table}:${cols}`)) selected.push(`${table}:${cols}`)
        return builder
      },
      limit() { return builder },
      eq() { return builder },
      neq() { return builder },
      in() { return builder },
      is() { return builder },
      order() { return builder },
      or() { return builder },
    }
    if (failFor[table]) {
      builder.then = (resolve: unknown, reject: unknown) =>
        Promise.reject(new Error(failFor[table])).then(resolve, reject)
    } else {
      builder.then = (resolve: unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve as never)
    }
    return builder
  }
  return {
    selected,
    from: (table: string) => makeBuilder(table),
    rpc: async () => ({ data: null, error: null }),
  }
}

describe('NOTIFICATIONS_SCHEMA_SHAPE_DEGRADES', () => {
  it('recognizes driver-wrapped missing-column errors without a Postgres code', () => {
    const neonError = new Error(
      'Neon query failed: column "notification_type" does not exist\nSELECT ... FROM "notifications"',
    )
    expect(isMissingColumn(neonError)).toBe(true)
    expect(isSchemaNotReady(neonError)).toBe(true)
  })

  it('probes the columns the feature uses, not just a row count', async () => {
    resetCapabilityCache()
    const client = fakeClient()
    await getDatabaseCapabilities(client as never)
    expect(client.selected).toContain('notifications:id, recipient_id, notification_type, body, link, dedupe_key, read')
  })

  it('reports notifications unavailable instead of querying a broken shape', async () => {
    resetCapabilityCache()
    const client = fakeClient({
      notifications: 'Neon query failed: column "notification_type" does not exist',
    })
    const caps = await getDatabaseCapabilities(client as never)
    expect(caps.notifications).toBe(false)
  })
})

describe('HYDRATION_CLIENT_CLOCK_TEXT', () => {
  it('marks server/client clock-dependent text so React does not warn (#418)', () => {
    const primitives = read('src/components/v3/primitives.tsx')
    expect(primitives).toContain('suppressHydrationWarning')
    // The greeting lives in the page header; relative ages and activity times
    // are rendered through these primitives.
    const repView = read('src/components/rep/rep-home-view.tsx')
    expect(repView).not.toContain('Good {greeting()}')
  })
})
