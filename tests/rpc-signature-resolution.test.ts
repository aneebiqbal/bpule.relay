/**
 * RPC signature resolution.
 *
 * Production carries more than one `record_activity_event` overload: the 4-arg
 * version from 0085/0091 was never dropped, and 20261030 added a 6-arg version.
 * `create or replace` at a different arity adds an overload, it does not replace
 * one — which is why a bare `comment on function` failed with 42725.
 *
 * PostgREST resolves an RPC by the set of parameter names it is given. A call
 * that omits `p_date` matches both the 4-arg and the 6-arg function and fails at
 * runtime as ambiguous. Nothing in TypeScript catches that, so this test does:
 * every call site must pass `p_date`, which only the 6-arg overload declares.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC = join(process.cwd(), 'src')

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

interface CallSite {
  file: string
  line: number
  body: string
}

function recordActivityEventCalls(): CallSite[] {
  const calls: CallSite[] = []
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8')
    const needle = "rpc('record_activity_event'"
    let index = text.indexOf(needle)
    while (index !== -1) {
      // The argument object follows the call. Read to the matching close brace
      // rather than a fixed window, so a long body cannot hide a missing field.
      const open = text.indexOf('{', index)
      let depth = 0
      let end = open
      for (let i = open; i < text.length; i += 1) {
        if (text[i] === '{') depth += 1
        else if (text[i] === '}') {
          depth -= 1
          if (depth === 0) { end = i; break }
        }
      }
      calls.push({
        file: relative(process.cwd(), file),
        line: text.slice(0, index).split('\n').length,
        body: text.slice(open, end + 1),
      })
      index = text.indexOf(needle, index + needle.length)
    }
  }
  return calls
}

const REQUIRED = ['p_rep_id', 'p_identity_id', 'p_activity_type', 'p_org_id']

describe('record_activity_event RPC resolution', () => {
  const calls = recordActivityEventCalls()

  it('finds the call sites (the guard is pointless if the scan breaks)', () => {
    expect(calls.length).toBeGreaterThan(0)
  })

  it('every call passes p_date, so it resolves to the 6-arg overload only', () => {
    const ambiguous = calls.filter((c) => !/\bp_date\s*:/.test(c.body))
    expect(
      ambiguous.map((c) => `${c.file}:${c.line} omits p_date — ambiguous between the 4-arg and 6-arg overloads`),
    ).toEqual([])
  })

  it('every call passes the four required parameters', () => {
    const missing = calls.flatMap((c) =>
      REQUIRED.filter((p) => !new RegExp(`\\b${p}\\s*:`).test(c.body))
        .map((p) => `${c.file}:${c.line} is missing ${p}`),
    )
    expect(missing).toEqual([])
  })

  it('no call passes a parameter the 6-arg overload does not declare', () => {
    const declared = new Set([...REQUIRED, 'p_source_event_id', 'p_date'])
    const unknown = calls.flatMap((c) => {
      const names = [...c.body.matchAll(/\b(p_[a-z_]+)\s*:/g)].map((m) => m[1])
      return names.filter((n) => !declared.has(n)).map((n) => `${c.file}:${c.line} passes undeclared ${n}`)
    })
    expect(unknown).toEqual([])
  })
})
