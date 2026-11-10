import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { isAllowlistedServiceCall } from '@/lib/supabase/service-allowlist'

/**
 * NORMAL_REQUEST_SERVICE_CALLS_ZERO
 *
 * Every service-client call site in the API surface must be explicitly
 * allowlisted with a written justification. Unknown = failure.
 */
function collectFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...collectFiles(full))
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full)
  }
  return out
}

describe('NORMAL_REQUEST_SERVICE_CALLS_ZERO', () => {
  it('every service-client call site is allowlisted', () => {
    const roots = ['src/app/api', 'src/app/(app)']
    const offenders: string[] = []
    for (const root of roots) {
      for (const file of collectFiles(root)) {
        const source = readFileSync(file, 'utf8')
        if (!/createServiceSupabase( Auth)?\(\)/.test(source)) continue
        if (file.includes('.test.')) continue
        if (!isAllowlistedServiceCall(relative(process.cwd(), file))) offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })
})
