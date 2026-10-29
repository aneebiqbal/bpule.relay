/**
 * Cleanup-scope guard.
 *
 * A cleanup that deletes by TIME WINDOW ALONE destroys data it was never asked
 * to touch. That is not hypothetical: an ad-hoc script removed every unsent
 * Upwork draft row created in the preceding six hours — including real user
 * drafts — while trying to clear one test artefact.
 *
 * The rule this enforces:
 *
 *   A `delete` may narrow by time ONLY when the same statement also narrows by
 *   an identity the caller already knows (a row id, a job, a lead, a rep…).
 *
 *   DELETE … WHERE created_at >= <window>                      → forbidden
 *   DELETE … WHERE job_id = $job AND created_at >= <window>    → allowed
 *
 * Time is a bound on how much history to sweep, never a selector for what the
 * caller means. If you are writing a cleanup, name the rows you created and
 * delete those ids.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(process.cwd())
const SCAN_DIRS = ['scripts', 'e2e']

const TIME_COLUMNS = ['created_at', 'occurred_at', 'updated_at', 'sent_at', 'target_date', 'date']
const IDENTITY_COLUMNS = ['id', 'job_id', 'lead_id', 'rep_id', 'person_id', 'organization_id', 'sample_id', 'message_id', 'draft_id']

/** Every `*.mjs` / `*.ts` file under the scanned directories. */
function collectFiles(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'test-results' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    let isDir = false
    try {
      isDir = statSync(full).isDirectory()
    } catch {
      continue
    }
    if (isDir) collectFiles(full, out)
    else if (/\.(mjs|ts)$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * Split a source file into statements. A `.delete()` call and the filters that
 * follow it live in the same statement, so scoping is judged per statement —
 * exactly the unit a developer writes and reviews.
 */
function statements(source: string): string[] {
  return source
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function usesTimeWindow(statement: string): boolean {
  return TIME_COLUMNS.some((col) => new RegExp(`\\.(gte|lte|gt|lt)\\(\\s*['"\`]${col}['"\`]`).test(statement))
}

function usesIdentityScope(statement: string): boolean {
  return IDENTITY_COLUMNS.some((col) => new RegExp(`\\.(eq|in)\\(\\s*['"\`]${col}['"\`]`).test(statement))
}

describe('cleanup-scope guard — a delete may not select rows by time alone', () => {
  const files = SCAN_DIRS.flatMap((d) => collectFiles(join(ROOT, d)))

  it('scans a real set of scripts', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it('never deletes on a time window without also naming the rows', () => {
    const offenders: string[] = []

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const statement of statements(source)) {
        if (!statement.includes('.delete(')) continue
        if (!usesTimeWindow(statement)) continue
        if (usesIdentityScope(statement)) continue
        offenders.push(`${relative(ROOT, file)} :: ${statement.replace(/\s+/g, ' ').slice(0, 160)}`)
      }
    }

    expect(offenders, `deletes scoped only by a time window:\n${offenders.join('\n')}`).toEqual([])
  })

  it('requires an explicit identity scope even for a bounded historical sweep', () => {
    // Guards the shape of the rule itself: a window plus an identity is the
    // minimum acceptable statement, and the identity must be a known column.
    expect(usesTimeWindow(".gte('created_at', since)")).toBe(true)
    expect(usesIdentityScope(".eq('job_id', jobId).gte('created_at', since)")).toBe(true)
    expect(usesIdentityScope(".gte('created_at', since)")).toBe(false)
  })
})

describe('the committed E2E cleanup demonstrates the allowed pattern', () => {
  const spec = readFileSync(join(ROOT, 'e2e', 'bug-23-31-closure.spec.ts'), 'utf8')

  it('names the job before bounding the window', () => {
    const deletes = statements(spec).filter((s) => s.includes('.delete('))
    expect(deletes.length).toBeGreaterThan(0)
    for (const statement of deletes) {
      if (!usesTimeWindow(statement)) continue
      expect(usesIdentityScope(statement), statement).toBe(true)
    }
  })
})
