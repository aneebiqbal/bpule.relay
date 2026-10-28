/**
 * Architecture test — the canonical normalization boundary (Phase 17).
 *
 * Product contract: "All external text enters intelligence through the
 * canonical normalization boundary."
 *
 * No Prospect / Inbound / Lead / Upwork route may implement its own label
 * stripping or label parsing. This reads source, like
 * `relay-contract-owners.test.ts`, and asserts the boundary is real: it exists,
 * every surface reaches it, and no surface re-implements it.
 */

import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const SRC = path.join(process.cwd(), 'src')

function allSourceFiles(dir: string = SRC): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...allSourceFiles(full))
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

const FILES = allSourceFiles().filter((f) => !f.includes('.test.'))

const BOUNDARY = 'src/lib/intelligence-v3/normalize-external-input.ts'

/** The surfaces that turn external text into intelligence. */
const SURFACES = [
  { name: 'Prospect / Lead / Inbound identity', file: 'src/lib/intelligence-v3/bridge.ts' },
  { name: 'Upwork deterministic facts', file: 'src/lib/upwork/facts.ts' },
  { name: 'Upwork AI extraction', file: 'src/lib/upwork-v2.ts' },
]

describe('the normalization boundary exists', () => {
  it('is a real module, not a re-export', () => {
    const source = readFileSync(path.join(process.cwd(), BOUNDARY), 'utf8')
    expect(source).toContain('export function normalizeExternalInput')
  })

  it('is consumed by every external-text surface', () => {
    for (const surface of SURFACES) {
      const source = readFileSync(path.join(process.cwd(), surface.file), 'utf8')
      expect(
        source,
        `${surface.name} (${surface.file}) must read fields through normalizeExternalInput`,
      ).toContain('normalizeExternalInput')
    }
  })
})

describe('no surface re-implements label parsing', () => {
  /**
   * A surface that compiles its own label regex is a second boundary. The
   * adapter in bridge.ts is allowed: it only maps legacy label names onto the
   * canonical fields.
   */
  const FORBIDDEN = [
    'LABELED_FIELD',
    'extractLabeledField',
    'parseLabeledFields',
  ]

  it.each(FORBIDDEN)('%s is not defined outside the boundary', (symbol) => {
    const offenders = FILES.filter((file) => file !== BOUNDARY && readFileSync(file, 'utf8').includes(symbol))
    expect(offenders, `${symbol} is a second label-parsing boundary`).toEqual([])
  })

  it('no surface compiles a label alternation regex', () => {
    const offenders = FILES.filter((file) => {
      if (file === BOUNDARY) return false
      const source = readFileSync(file, 'utf8')
      // A label alternation is the tell: a regex listing field labels.
      return /\^\(\s*(?:name|company|organization|employer|role|title|position|location|headline)\b[^)]*\|/.test(source)
    })
    expect(offenders, 'a surface compiles its own label list').toEqual([])
  })
})
