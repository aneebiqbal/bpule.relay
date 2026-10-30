/**
 * Timezone authority.
 *
 * `organization_operating_policy.timezone` is the operating clock. Business
 * dates, workday windows, warnings and closes must derive from it — never from
 * `organizations.timezone` (legacy) and never from `rep.timezone` (a personal
 * display preference).
 *
 * Production currently disagrees with itself: organizations.timezone is UTC for
 * bpulse while the policy says Asia/Karachi. Anything reading the legacy column
 * computes a different business day, so this guard pins the modules that decide
 * what day it is.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const OPERATING_DAY_MODULES = [
  'src/app/(app)/dashboard/page.tsx',
  'src/app/(app)/performance/page.tsx',
  'src/app/api/admin/performance/route.ts',
  'src/app/api/accountability/warnings/route.ts',
  'src/lib/org-clock/index.ts',
  'src/lib/org-clock/load.ts',
]

const FORBIDDEN = [
  { pattern: /rep\.timezone/, why: "reads the rep's personal timezone instead of the operating policy" },
  { pattern: /from\(['"]organizations['"]\)[\s\S]{0,80}select\(['"]timezone['"]\)/, why: 'reads legacy organizations.timezone' },
  { pattern: /org\?\.timezone|org\.timezone/, why: 'reads legacy organizations.timezone' },
]

describe('timezone authority', () => {
  it('operating-day modules never derive time from rep or legacy org timezone', () => {
    const violations: string[] = []

    for (const rel of OPERATING_DAY_MODULES) {
      const path = join(process.cwd(), rel)
      if (!existsSync(path)) continue
      const text = readFileSync(path, 'utf8')
      for (const { pattern, why } of FORBIDDEN) {
        if (pattern.test(text)) violations.push(`${rel} ${why}`)
      }
    }

    expect(violations).toEqual([])
  })

  it('the modules that decide the business day use the policy', () => {
    const path = join(process.cwd(), 'src/app/(app)/dashboard/page.tsx')
    const text = readFileSync(path, 'utf8')
    expect(text).toMatch(/loadOperatingPolicy/)
  })
})
