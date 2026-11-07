/**
 * Runtime hardening contracts.
 *
 * Relay talks to Neon through `@neondatabase/serverless`, whose pooled client
 * opens a WebSocket. When that transport fails, pg emits an `error` event on a
 * client that has no listener yet, and Node turns it into an `uncaughtException`
 * — which takes the production server down.
 *
 * These tests pin the two guarantees:
 *   1. no unused Supabase realtime consumer exists (the WebSocket is the DB
 *      transport, not a realtime subscription), and
 *   2. an expected transport failure degrades instead of crashing, while an
 *      unknown failure still terminates the process.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Pool } from '@neondatabase/serverless'
import {
  handleUncaughtException,
  isDatabaseTransportFailure,
} from '@/lib/runtime/uncaught-exception'
import { attachPoolErrorHandling } from '@/lib/db/neon'

const ROOT = process.cwd()

function sourceFiles(dir: string = join(ROOT, 'src')): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

describe('NEON_MODE_DOES_NOT_START_UNUSED_SUPABASE_REALTIME', () => {
  it('no Supabase realtime consumer exists in the codebase', () => {
    const offenders = sourceFiles()
      .map((file) => ({ file: file.slice(ROOT.length + 1), text: readFileSync(file, 'utf8') }))
      .filter(({ text }) =>
        [/\.channel\(/, /postgres_changes/, /removeChannel/, /RealtimeChannel/, /subscribe\(/].some((re) =>
          re.test(text),
        ),
      )
    expect(offenders, `unexpected realtime consumers: ${offenders.map((o) => o.file).join(', ')}`).toEqual([])
  })
})

describe('DB_TRANSPORT_FAILURE_DEGRADES', () => {
  it('recognises the EventEmitter unhandled-error wrapper around a transport failure', () => {
    const event = new Error('Unhandled error. ()')
    ;(event as Error & { context?: unknown }).context = { type: 'error' }
    expect(isDatabaseTransportFailure(event)).toBe(true)
  })

  it('recognises driver-originated connection failures', () => {
    const error = new Error('Error connecting to database: fetch failed')
    error.stack = 'Error: Error connecting to database\n    at node_modules/@neondatabase/serverless/index.js:1:1'
    expect(isDatabaseTransportFailure(error)).toBe(true)
  })

  it('does not recognise an application error as a transport failure', () => {
    const error = new Error('Cannot read properties of undefined (reading "map")')
    error.stack = 'Error: Cannot read properties of undefined\n    at src/app/(app)/leads/page.tsx:42:10'
    expect(isDatabaseTransportFailure(error)).toBe(false)
    expect(isDatabaseTransportFailure(undefined)).toBe(false)
    expect(isDatabaseTransportFailure('boom')).toBe(false)
  })

  it('handles the failure instead of crashing', () => {
    const event = new Error('Unhandled error. ()')
    ;(event as Error & { context?: unknown }).context = { type: 'error' }
    expect(handleUncaughtException(event)).toBe(true)
  })
})

describe('UNKNOWN_FAILURE_STILL_EXITS', () => {
  it('reports an unknown failure so the process can terminate', () => {
    const error = new Error('undefined is not a function')
    error.stack = 'Error: undefined is not a function\n    at src/lib/team/workload.ts:12:4'
    expect(handleUncaughtException(error)).toBe(false)
  })
})

describe('POOL_TRANSPORT_ERROR_DOES_NOT_CRASH', () => {
  it('an error event on a guarded pool is handled, not thrown', () => {
    const pool = new Pool({
      connectionString: 'postgresql://user:pass@127.0.0.1:5432/db',
      max: 1,
    })
    attachPoolErrorHandling(pool, 'test')
    expect(() => pool.emit('error', new Error('WebSocket not available'))).not.toThrow()
  })

  it('an unguarded pool throws — proving the guard is what prevents the crash', () => {
    const pool = new Pool({
      connectionString: 'postgresql://user:pass@127.0.0.1:5432/db',
      max: 1,
    })
    expect(() => pool.emit('error', new Error('WebSocket not available'))).toThrow()
  })
})
