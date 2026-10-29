/**
 * ORG_CLOCK_ARCHITECTURE_GUARD
 *
 * A business date must come from the organization's clock, never from the UTC
 * date. The bug this prevents is not hypothetical: every accountability path
 * used `new Date().toISOString().slice(0, 10)`, which is the wrong calendar day
 * for a Karachi morning and a New York evening.
 *
 * The guard scans the modules that own accountability. Adding
 * `toISOString().slice(0, 10)` back into any of them fails the build.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()

/** Directories and files that own business dates. */
const SCOPED_DIRS = [
  'src/lib/org-clock',
  'src/lib/rep-day',
  'src/lib/accountability',
  'src/app/api/accountability',
  'src/app/api/rep',
]

const SCOPED_FILES = [
  'src/lib/relay/accountability-engine.ts',
  'src/lib/relay/warning-service.ts',
  'src/lib/relay/dashboard-loader.ts',
  'src/lib/auth/workspace.ts',
  'src/lib/store/supabase-store.ts',
  'src/app/(app)/dashboard/page.tsx',
]

/** The one place allowed to convert an instant to a business date. */
const CLOCK_MODULE = 'src/lib/org-clock/index.ts'

const UTC_DATE_SLICE = /toISOString\(\)\s*\.\s*slice\(\s*0\s*,\s*10\s*\)/
/** The old offset trick: render in a zone, re-parse as server-local. */
const LOCALE_REPARSE = /toLocaleString\(\s*['"]en-US['"]\s*,\s*\{\s*timeZone/

function collect(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    let isDir = false
    try {
      isDir = statSync(full).isDirectory()
    } catch {
      continue
    }
    if (isDir) collect(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

const files = [
  ...SCOPED_DIRS.flatMap((d) => collect(join(ROOT, d))),
  ...SCOPED_FILES.map((f) => join(ROOT, f)),
].filter((f) => !f.endsWith('.test.ts'))

/** Strip block comments and line comments so prose cannot trip the guard. */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('ORG_CLOCK_ARCHITECTURE_GUARD', () => {
  it('scans a real set of accountability modules', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it('never derives a business date from the UTC ISO string', () => {
    const offenders: string[] = []
    for (const file of files) {
      const rel = relative(ROOT, file)
      if (rel === CLOCK_MODULE) continue
      const code = codeOnly(readFileSync(file, 'utf8'))
      if (UTC_DATE_SLICE.test(code)) offenders.push(rel)
    }
    expect(offenders, `UTC date slicing in accountability code:\n${offenders.join('\n')}`).toEqual([])
  })

  it('never re-parses a locale string to recover a zone offset', () => {
    const offenders: string[] = []
    for (const file of files) {
      const rel = relative(ROOT, file)
      if (rel === CLOCK_MODULE) continue
      const code = codeOnly(readFileSync(file, 'utf8'))
      if (LOCALE_REPARSE.test(code)) offenders.push(rel)
    }
    expect(offenders, `toLocaleString offset math in accountability code:\n${offenders.join('\n')}`).toEqual([])
  })

  it('the clock module is the only exporter of the business date', () => {
    const clock = readFileSync(join(ROOT, CLOCK_MODULE), 'utf8')
    expect(clock).toContain('export function orgDate')
    expect(clock).toContain('export function orgToday')
    expect(clock).toContain('export function workdayProgress')
  })
})
