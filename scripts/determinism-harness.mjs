#!/usr/bin/env node
/**
 * Relay Intelligence Determinism Harness (Phase 3 of the hardening sprint)
 *
 * Runs the SAME raw input through produceCanonicalIntelligence() N times and
 * diffs every stage of the pipeline to find the FIRST point of divergence:
 *
 *   input hash → extraction (Pass A) → normalization (Pass B, pure) →
 *   intelligence (Pass C) → remote eligibility → score input (inferred
 *   proof/identity/pastWin) → score breakdown → canonical score →
 *   qualification → Right-to-Contact/Next Action (revenue strategy)
 *
 * Does NOT change scoring, prompts, thresholds, or fixtures. Read-only
 * diagnostic tool: it observes and reports where two runs first disagree.
 *
 * Usage:
 *   npx tsx scripts/determinism-harness.mjs --runs=20
 *   npx tsx scripts/determinism-harness.mjs --runs=20 --cases=strong_buyer_1
 *   npx tsx scripts/determinism-harness.mjs --runs=20 --all-golden
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { config as loadDotenv } from 'dotenv'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')
loadDotenv({ path: resolve(REPO_ROOT, '.env.local') })

function toRepoFileUrl(relativePath) {
  return pathToFileURL(resolve(REPO_ROOT, relativePath)).href
}

const args = process.argv.slice(2)
const options = { runs: 20, cases: null, allGolden: false, out: null }
for (const arg of args) {
  if (arg.startsWith('--runs=')) options.runs = Number(arg.split('=')[1]) || 20
  else if (arg.startsWith('--cases=')) options.cases = arg.split('=')[1].split(',')
  else if (arg === '--all-golden') options.allGolden = true
  else if (arg.startsWith('--out=')) options.out = arg.split('=')[1]
}

const { loadGoldenDataset } = await import('./lib/benchmark/evaluator.mjs')

let produceCanonicalIntelligence
try {
  const mod = await import(toRepoFileUrl('src/lib/intelligence-v2/index.ts'))
  produceCanonicalIntelligence = mod.produceCanonicalIntelligence
} catch (err) {
  console.error('FATAL: could not import produceCanonicalIntelligence')
  console.error(err)
  process.exit(1)
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16)
}

function stableStringify(value) {
  // Deterministic JSON stringify (sorted keys) so diffing isn't fooled by key order.
  const seen = new WeakSet()
  const sorter = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj
    if (seen.has(obj)) return '[circular]'
    seen.add(obj)
    if (Array.isArray(obj)) return obj.map(sorter)
    return Object.keys(obj).sort().reduce((acc, k) => {
      acc[k] = sorter(obj[k])
      return acc
    }, {})
  }
  return JSON.stringify(sorter(value))
}

function hashOf(value) {
  return sha256(stableStringify(value))
}

// ── Stage extractors: pull a comparable snapshot out of one orchestrator run ──

function extractStages(canonical, rawText) {
  const intel = canonical.intelligence
  return {
    inputHash: sha256(rawText),
    // Pass A / B combined (normalized extraction) — everything except Pass-C-only fields
    extraction: {
      person: intel.person,
      company: intel.company,
      opportunity: intel.opportunity,
      job: intel.job,
      content: intel.content,
    },
    normalizedEvidenceHash: hashOf({
      person: intel.person,
      company: intel.company,
      opportunity: intel.opportunity,
      job: intel.job,
      content: intel.content,
    }),
    // Pass C fields
    intelligenceC: {
      probableNeed: intel.probableNeed,
      opportunityTrigger: intel.opportunityTrigger,
      timingSignal: intel.timingSignal,
      risks: intel.risks,
      unknowns: intel.unknowns,
      resolvedContradictions: intel.resolvedContradictions,
    },
    remoteEligibility: intel.remoteEligibility,
    scoreBreakdown: {
      total: canonical.scoreBreakdown.total,
      label: canonical.scoreBreakdown.label,
      hardNegatives: canonical.scoreBreakdown.hardNegatives,
      dimensions: canonical.scoreBreakdown.dimensions.map((d) => ({ key: d.key, points: d.points, direction: d.direction })),
    },
    canonicalScore: canonical.canonicalScore,
    qualification: canonical.qualification,
    confidence: canonical.confidence,
    extractionCallLog: canonical.extractionCallLog.map((c) => ({ provider: c.provider, model: c.model, task: c.task, fallback: c.fallback })),
  }
}

const STAGE_ORDER = [
  'inputHash',
  'extraction',
  'intelligenceC',
  'remoteEligibility',
  'scoreBreakdown',
  'canonicalScore',
  'qualification',
]

function firstDivergence(runs) {
  // runs: array of { stages }
  for (const stage of STAGE_ORDER) {
    const hashes = new Set(runs.map((r) => hashOf(r.stages[stage])))
    if (hashes.size > 1) {
      return { stage, distinctValues: hashes.size }
    }
  }
  return null
}

async function runOnce(rawText, index) {
  const t0 = Date.now()
  const result = await produceCanonicalIntelligence(rawText, {})
  const canonical = result.intelligence
  return {
    index,
    ms: Date.now() - t0,
    stages: extractStages(canonical, rawText),
    providers: canonical.extractionCallLog.map((c) => `${c.task}:${c.provider}/${c.model}${c.fallback ? '(fallback)' : ''}`),
  }
}

async function harnessForCase(label, rawText, runs) {
  console.log(`\n=== ${label} (${runs} runs) ===`)
  console.log(`input sha256: ${sha256(rawText)}`)

  const results = []
  for (let i = 0; i < runs; i++) {
    try {
      results.push(await runOnce(rawText, i))
    } catch (err) {
      results.push({ index: i, error: err instanceof Error ? err.message : String(err) })
    }
  }

  const ok = results.filter((r) => !r.error)
  const failed = results.filter((r) => r.error)

  if (failed.length > 0) {
    console.log(`  ${failed.length}/${runs} runs THREW: ${failed.map((f) => f.error).slice(0, 3).join(' | ')}`)
  }

  if (ok.length < 2) {
    console.log('  Not enough successful runs to compare.')
    return { label, runs, divergence: null, insufficientRuns: true, results }
  }

  const uniqueScores = new Set(ok.map((r) => r.stages.canonicalScore))
  const uniqueQualifications = new Set(ok.map((r) => r.stages.qualification))
  const uniqueProviders = new Set(ok.map((r) => r.providers.join(',')))

  console.log(`  unique canonical scores: ${uniqueScores.size} → [${[...uniqueScores].join(', ')}]`)
  console.log(`  unique qualifications: ${uniqueQualifications.size} → [${[...uniqueQualifications].join(', ')}]`)
  console.log(`  unique provider/model paths: ${uniqueProviders.size}`)
  for (const p of uniqueProviders) console.log(`    - ${p}`)

  const divergence = firstDivergence(ok)
  if (divergence) {
    console.log(`  FIRST DIVERGENCE at stage: ${divergence.stage} (${divergence.distinctValues} distinct values)`)
    // Show a compact diff for the diverging stage across up to 3 distinct values
    const byHash = new Map()
    for (const r of ok) {
      const h = hashOf(r.stages[divergence.stage])
      if (!byHash.has(h)) byHash.set(h, { count: 0, sample: r.stages[divergence.stage], runIndexes: [] })
      const entry = byHash.get(h)
      entry.count++
      entry.runIndexes.push(r.index)
    }
    let shown = 0
    for (const [, entry] of byHash) {
      if (shown++ >= 3) break
      console.log(`    variant (${entry.count}x, runs=${entry.runIndexes.slice(0, 5).join(',')}${entry.runIndexes.length > 5 ? '...' : ''}):`)
      console.log(`      ${JSON.stringify(entry.sample).slice(0, 400)}`)
    }
  } else {
    console.log('  0 divergences across all stages. Fully deterministic for this input under current conditions.')
  }

  return {
    label,
    runs,
    inputHash: sha256(rawText),
    successfulRuns: ok.length,
    failedRuns: failed.length,
    uniqueScores: [...uniqueScores],
    uniqueQualifications: [...uniqueQualifications],
    uniqueProviderPaths: [...uniqueProviders],
    divergence,
    avgMs: Math.round(ok.reduce((s, r) => s + r.ms, 0) / ok.length),
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const dataset = loadGoldenDataset().cases ?? loadGoldenDataset()
  let cases = dataset
  if (options.cases) {
    cases = dataset.filter((c) => options.cases.includes(c.id))
  } else if (!options.allGolden) {
    // Default: a small representative slice (fast, but covers different signal types)
    cases = dataset.slice(0, 5)
  }

  console.log(`Determinism harness: ${cases.length} case(s) × ${options.runs} runs`)
  console.log(`Provider keys configured: ${['GROQ_API_KEY', 'OPENCODE_API_KEY', 'OPENAI_API_KEY', 'LONGCAT_API_KEY'].filter((k) => Boolean(process.env[k])).join(', ') || 'NONE (demo/fallback mode — extraction will use deterministic regex fallback, not live LLM)'}`)

  const summary = []
  for (const c of cases) {
    const label = c.id ?? c.label ?? 'unnamed_case'
    const rawText = c.raw_input ?? c.rawText
    if (!rawText) {
      console.log(`\n=== ${label} === SKIPPED (no raw_input field)`)
      continue
    }
    summary.push(await harnessForCase(label, rawText, options.runs))
  }

  console.log('\n\n=== SUMMARY ===')
  let totalDivergent = 0
  for (const s of summary) {
    if (s.insufficientRuns) continue
    const status = s.divergence ? `DIVERGED at ${s.divergence.stage}` : 'STABLE'
    if (s.divergence) totalDivergent++
    console.log(`  ${s.label}: ${status} (scores: ${s.uniqueScores.join(',')})`)
  }
  console.log(`\n${totalDivergent}/${summary.length} cases showed divergence across ${options.runs} runs each.`)

  if (options.out) {
    const outPath = resolve(REPO_ROOT, options.out)
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, JSON.stringify(summary, null, 2))
    console.log(`\nFull results written to ${options.out}`)
  }
}

await main()
