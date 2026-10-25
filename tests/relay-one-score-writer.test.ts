/**
 * Phase 15 — ONE LIVE SCORE WRITER.
 *
 * The canonical 0-100 score (score-v3) is the only score written for new
 * production rows. The legacy 0-12 rubric (lib/score/rubric) may still be
 * computed for previews and eval, but no API route may persist it.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (entry.endsWith('.ts')) out.push(full)
  }
  return out
}

const routes = walk(join(ROOT, 'src/app/api')).filter((f) => f.endsWith('route.ts'))

describe('Phase 15 — one live score writer', () => {
  it('no API route persists a legacy 0-12 rubric score on a new lead', () => {
    const offenders = routes.filter((file) => {
      const src = readFileSync(file, 'utf8')
      const usesLegacy = /computeScore\s*\(/.test(src)
      if (!usesLegacy) return false
      // A legacy compute followed by a persisted `score:` write.
      return /score:\s*(?:score|legacyScore)\??\.(?:total|verdict)/.test(src) || /updateLeadScore\(/.test(src)
    })
    expect(offenders).toEqual([])
  })

  it('the create routes pass a null legacy score and rely on the canonical score', () => {
    const save = readFileSync(join(ROOT, 'src/app/api/prospect/save/route.ts'), 'utf8')
    const create = readFileSync(join(ROOT, 'src/app/api/leads/route.ts'), 'utf8')
    expect(save).toContain('score: null,')
    expect(create).toContain('score: null,')
    expect(save).not.toMatch(/score:\s*score\.total/)
  })

  it('the CSV import does not persist a legacy score', () => {
    const src = readFileSync(join(ROOT, 'src/app/api/leads/import/route.ts'), 'utf8')
    expect(src).not.toMatch(/updateLeadScore\(/)
    expect(src).toMatch(/UNSCORED|unscored/)
  })

  it('score-v3 remains the only canonical score writer', () => {
    const scoreV3 = readFileSync(join(ROOT, 'src/lib/intelligence-v3/scoring/score-v3.ts'), 'utf8')
    expect(scoreV3).toMatch(/export function scoreEpisode/)
  })
})
