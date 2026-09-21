#!/usr/bin/env node
/**
 * Relay Intelligence Benchmark
 *
 * Pipelines:
 * - baseline: legacy extraction/scoring stack
 * - v2: src/lib/intelligence-v2 orchestrator (real production path)
 * - mock: explicit harness smoke mode only
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { config as loadDotenv } from 'dotenv'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')

loadDotenv({ path: resolve(REPO_ROOT, '.env.local') })

const { loadGoldenDataset, loadTortureDataset, evaluateCase } = await import('./lib/benchmark/evaluator.mjs')
const { evaluateOutreach, computeMessageSimilarity } = await import('./lib/benchmark/outreach-eval.mjs')
const { generateConsoleReport, saveResultsJson } = await import('./lib/benchmark/report.mjs')

const args = process.argv.slice(2)
const options = {
  pipeline: 'v2',
  compare: null,
  cases: null,
  includeTorture: false,
  skipOutreach: false,
  requireProvider: null,
  forbidDemoFallback: false,
}

for (const arg of args) {
  if (arg.startsWith('--pipeline=')) options.pipeline = arg.split('=')[1]
  else if (arg.startsWith('--compare=')) options.compare = arg.split('=')[1]
  else if (arg.startsWith('--cases=')) options.cases = arg.split('=')[1].split(',')
  else if (arg === '--include-torture') options.includeTorture = true
  else if (arg.startsWith('--require-provider=')) options.requireProvider = arg.split('=')[1]
  else if (arg === '--forbid-demo-fallback') options.forbidDemoFallback = true
  else if (arg === '--skip-outreach') options.skipOutreach = true
  else if (arg === '--mock') options.pipeline = 'mock'
}

function checkExecutionConstraints(callLog, options) {
  const violations = []
  const entries = Array.isArray(callLog) ? callLog : []

  if (entries.length === 0) {
    if (options.requireProvider || options.forbidDemoFallback) {
      violations.push('Missing execution call log for provider verification')
    }
    return violations
  }

  for (const entry of entries) {
    const provider = String(entry?.provider ?? '').toLowerCase()
    const model = String(entry?.model ?? '').toLowerCase()
    const task = String(entry?.task ?? 'unknown')
    const fallback = Boolean(entry?.fallback)

    if (options.forbidDemoFallback) {
      if (provider === 'demo' || provider === 'fallback' || model === 'demo' || model === 'deterministic_fallback') {
        violations.push(`Task ${task} used demo fallback (${provider}/${model})`)
      }
    }

    if (options.requireProvider) {
      const expected = String(options.requireProvider).toLowerCase()
      if (provider !== expected) {
        violations.push(`Task ${task} ran on ${provider || 'unknown'} instead of required ${expected}`)
      }
      if (fallback) {
        violations.push(`Task ${task} marked fallback=true (required provider mode expects primary execution)`)
      }
    }
  }

  return violations
}

function toRepoFileUrl(relativePath) {
  return pathToFileURL(resolve(REPO_ROOT, relativePath)).href
}

function abortV2Unavailable(errorMessage) {
  console.error('V2 PIPELINE UNAVAILABLE — BENCHMARK ABORTED')
  if (errorMessage) {
    console.error(String(errorMessage))
  }
  process.exit(1)
}

function mapV2RemoteEligibility(remoteEligibility) {
  if (!remoteEligibility || typeof remoteEligibility !== 'object') return 'unknown'

  const workplaceType = remoteEligibility.workplaceType ?? 'UNKNOWN'
  const remoteScope = remoteEligibility.remoteScope ?? 'UNKNOWN'
  const reason = String(remoteEligibility.reason ?? '').toLowerCase()

  if (workplaceType === 'HYBRID') {
    if (reason.includes('london')) return 'hybrid_london'
    return 'hybrid'
  }

  if (workplaceType === 'ONSITE') {
    if (reason.includes('manhattan') || reason.includes('new york')) return 'onsite_manhattan'
    return 'onsite'
  }

  if (workplaceType === 'REMOTE') {
    if (remoteScope === 'WORLDWIDE' || remoteScope === 'ANYWHERE') return 'worldwide'
    if (remoteScope === 'REGION_RESTRICTED' && reason.includes('eu')) return 'eu_only'
    if (remoteScope === 'COUNTRY_RESTRICTED') {
      if (reason.includes('us')) return 'us_only'
      if (reason.includes('eu')) return 'eu_only'
      return 'restricted'
    }
    if (remoteScope === 'TIMEZONE_RESTRICTED') return 'timezone_restricted'
  }

  return 'unknown'
}

function mapV2Signal(primarySignal, signals) {
  const s = primarySignal ?? signals?.[0] ?? null
  if (!s) return 'none'
  if (s === 'explicit_ask' || s === 'freelance_project_need') return 'asking'
  if (s === 'technical_problem' || s === 'hiring_pressure') return 'pain'
  if (s === 'hiring') return 'hiring'
  if (s === 'funding') return 'funding'
  if (s === 'migration' || s === 'rebuild') return 'weak_stack'
  if (s === 'launch' || s === 'growth_signal') return 'stale'
  return 'none'
}

function mapV2QualificationToLegacyVerdict(qualification) {
  if (qualification === 'strong' || qualification === 'worth_pursuing') return 'send'
  if (qualification === 'maybe') return 'research_more'
  return 'skip'
}

async function createMockRunner() {
  return {
    pipeline_requested: 'mock',
    pipeline_executed: 'mock',
    pipeline_version: 'mock-v1',
    mock_fallback: false,
    async runCase(caseObj) {
      const expected = caseObj.expected_key_facts ?? {}
      const extraction = {
        company: expected.company ?? null,
        name: expected.person ?? null,
        locationRaw: expected.location ?? null,
        signalType: expected.signal ?? null,
        signalEvidence: expected.signal_evidence ?? null,
        remoteEligibility: caseObj.expected_remote_eligibility,
        tags: expected.tech_stack ?? [],
        url: caseObj.source_urls?.[0] ?? null,
        rawFacts: caseObj.must_preserve_fields?.join(' | ') ?? '',
      }

      let score = 2
      if (expected.signal === 'asking') score = 8
      else if (expected.signal === 'pain') score = 7
      else if (expected.signal === 'hiring') score = 7
      else if (expected.signal === 'understaffed') score = 6
      else if (expected.signal === 'funding') score = 5
      else if (expected.signal === 'stale') score = 4

      const scoring = {
        total: score,
        verdict: score >= 10 ? 'send' : score >= 7 ? 'research_more' : 'skip',
        breakdown: [],
        gates: [],
      }

      return { extraction, scoring, debug: { provider: 'mock' } }
    },
  }
}

async function createBaselineRunner() {
  const { extractLeadBundle } = await import(toRepoFileUrl('src/lib/ai/extract.ts'))
  const { computeScore } = await import(toRepoFileUrl('src/lib/score/rubric.ts'))
  const { SIGNALS, VERDICT_RULES } = await import(toRepoFileUrl('src/lib/score/signals.ts'))

  const rulebook = {
    organizationId: 'benchmark',
    signals: SIGNALS,
    verdictThresholds: VERDICT_RULES,
    maxSignalWeight: 7,
    maxCompleteness: 5,
    confidenceSendThreshold: 62,
  }

  return {
    pipeline_requested: 'baseline',
    pipeline_executed: 'baseline',
    pipeline_version: 'legacy_rubric_v1',
    mock_fallback: false,
    async runCase(caseObj) {
      const bundle = await extractLeadBundle(caseObj.raw_input)
      const primary = bundle.primary
      const scoring = computeScore(primary, rulebook)
      const extraction = {
        company: primary.company ?? null,
        name: primary.name ?? null,
        titleRaw: primary.titleRaw ?? primary.title ?? null,
        locationRaw: primary.locationRaw ?? null,
        aboutSummary: primary.aboutSummary ?? null,
        signalType: primary.signalType ?? null,
        signalEvidence: primary.signalEvidence ?? null,
        extractionConfidence: primary.extractionConfidence ?? null,
        verbatimQuote: primary.verbatimQuote ?? null,
        tags: primary.tags ?? [],
        recentPosts: primary.recentPosts ?? [],
        url: primary.url ?? caseObj.source_urls?.[0] ?? null,
        remoteEligibility: 'unknown',
      }

      return { extraction, scoring, debug: { provider: bundle.callLog?.[0]?.host ?? 'baseline' } }
    },
  }
}

async function createV2Runner() {
  let produceCanonicalIntelligence
  let scoreVersion = 'relay_qualification_v2'
  try {
    const mod = await import(toRepoFileUrl('src/lib/intelligence-v2/index.ts'))
    produceCanonicalIntelligence = mod.produceCanonicalIntelligence
    scoreVersion = mod.SCORE_VERSION ?? scoreVersion
  } catch (err) {
    abortV2Unavailable(err instanceof Error ? err.message : String(err))
  }

  if (typeof produceCanonicalIntelligence !== 'function') {
    abortV2Unavailable('produceCanonicalIntelligence export missing from src/lib/intelligence-v2')
  }

  return {
    pipeline_requested: 'v2',
    pipeline_executed: 'v2',
    pipeline_version: scoreVersion,
    mock_fallback: false,
    async runCase(caseObj) {
      const run = await produceCanonicalIntelligence(caseObj.raw_input, {
        knownSourceUrl: caseObj.source_urls?.[0] ?? null,
        strictLiveMode: options.forbidDemoFallback,
      })
      const canonical = run.intelligence
      if (options.forbidDemoFallback) {
        const callLog = canonical.extractionCallLog ?? []
        const hasDemoFallback = callLog.some(
          (e) => e && (e.provider === 'demo' || e.provider === 'fallback' || e.model === 'deterministic_fallback' || e.model === 'demo'),
        )
        if (hasDemoFallback) {
          throw new Error('Live extraction required but demo fallback was used')
        }
      }
      const normalized = canonical.intelligence
      const remote = canonical.remoteEligibility
      const extraction = {
        company: normalized.company.name,
        name: normalized.person.fullName,
        titleRaw: normalized.person.title,
        locationRaw: normalized.person.location,
        signalType: mapV2Signal(normalized.opportunity.primarySignal, normalized.opportunity.signals),
        signalSource: normalized.opportunity.primarySignal,
        signalEvidence:
          canonical.evidenceLedger.find((e) => e.verbatimQuote)?.verbatimQuote
          ?? normalized.opportunity.description
          ?? normalized.opportunityTrigger
          ?? '',
        opportunityDescription: normalized.opportunity.description,
        extractionConfidence: canonical.confidence,
        tags: normalized.content.technicalSignals,
        explicitProblems: normalized.content.explicitProblems,
        hiringSignals: normalized.content.hiringSignals,
        recentPosts: normalized.content.recentPosts,
        jobTitle: normalized.job?.title ?? null,
        jobCompensation: normalized.job?.compensation ?? null,
        jobWorkplaceType: normalized.job?.workplaceType ?? null,
        jobAllowedGeography: normalized.job?.allowedGeography ?? null,
        jobSkills: normalized.job?.skills ?? [],
        companySize: normalized.company.size ?? null,
        companySizeEvidence: normalized.company.sizeEvidence ?? null,
        url:
          canonical.rawSource.sourceUrl
          ?? canonical.rawSource.profileUrl
          ?? canonical.rawSource.companyUrl
          ?? canonical.rawSource.jobUrl
          ?? caseObj.source_urls?.[0]
          ?? null,
        urlsPreserved: canonical.extractionCompleteness.urlsPreserved,
        sourceUrlsFound: canonical.extractionCompleteness.sourceUrlsFound,
        remoteEligibility: mapV2RemoteEligibility(remote),
        remoteEligibilityDetails: remote,
        companyLocation: normalized.company.linkedinUrl ?? normalized.person.location ?? null,
      }

      const scoring = {
        total: canonical.canonicalScore,
        verdict: mapV2QualificationToLegacyVerdict(canonical.qualification),
        qualification: canonical.qualification,
        breakdown: canonical.scoreBreakdown.dimensions,
        missingInfo: canonical.scoreBreakdown.missingInfo,
        hardNegatives: canonical.scoreBreakdown.hardNegatives,
        reasons: canonical.scoreBreakdown.reasons,
      }

      return {
        extraction,
        scoring,
        debug: {
          provider: canonical.extractionCallLog?.[0]?.provider ?? 'v2',
          orchestrator: 'produceCanonicalIntelligence',
          callLog: canonical.extractionCallLog,
        },
      }
    },
  }
}

async function resolveRunner() {
  if (options.pipeline === 'mock') return createMockRunner()
  if (options.pipeline === 'baseline') return createBaselineRunner()
  if (options.pipeline === 'v2') return createV2Runner()
  throw new Error(`Unknown pipeline "${options.pipeline}". Use baseline, v2, or mock.`)
}

function generateSummaryForComparison(results) {
  const total = results.caseResults.length
  const pass = results.caseResults.filter((r) => r.status === 'PASS').length
  const warn = results.caseResults.filter((r) => r.status === 'WARN').length
  const fail = results.caseResults.filter((r) => r.status === 'FAIL').length

  const remoteResults = results.caseResults.filter((r) => r.remote && r.remote.skipped !== true)
  const remoteMatch = remoteResults.filter((r) => r.remote.matches).length

  const completenessScores = results.caseResults
    .filter((r) => r.completeness.max > 0)
    .map((r) => r.completeness.fraction)
  const avgCompleteness = completenessScores.length > 0
    ? completenessScores.reduce((a, b) => a + b, 0) / completenessScores.length
    : 0

  const knownWins = results.caseResults.filter((r) => r.knownOutcome === 'WON')
  const knownWinRecognition = knownWins.filter((r) =>
    r.scoring.alignment === 'aligned' || r.scoring.alignment === 'acceptable'
  ).length

  const badLeads = results.caseResults.filter((r) =>
    r.knownOutcome === 'BAD_PROSPECT' || r.knownOutcome === 'INELIGIBLE'
  )
  const badLeadRejection = badLeads.filter((r) =>
    r.scoring.alignment === 'aligned' || r.status === 'PASS'
  ).length

  const withMessages = results.outreachResults ?? []
  const fabricationFree = withMessages.filter((r) => r.status !== 'UNSAFE').length

  return {
    total,
    pass,
    warn,
    fail,
    remoteMatch,
    remoteTotal: remoteResults.length,
    avgCompleteness,
    knownWins: knownWins.length,
    knownWinRecognition,
    badLeads: badLeads.length,
    badLeadRejection,
    totalWithMessages: withMessages.length,
    fabricationFree,
    outreach: {
      good: withMessages.filter((r) => r.status === 'GOOD').length,
      lightEdit: withMessages.filter((r) => r.status === 'LIGHT_EDIT').length,
      bad: withMessages.filter((r) => r.status === 'BAD').length,
      unsafe: withMessages.filter((r) => r.status === 'UNSAFE').length,
    },
  }
}

async function main() {
  console.error('')
  console.error('╔══════════════════════════════════════════════════════════════════════╗')
  console.error('║          RELAY INTELLIGENCE BENCHMARK                              ║')
  console.error(`║          Pipeline: ${options.pipeline.padEnd(52)}║`)
  console.error('╚══════════════════════════════════════════════════════════════════════╝')
  console.error('')

  let runner
  try {
    runner = await resolveRunner()
  } catch (err) {
    if (options.pipeline === 'v2') {
      abortV2Unavailable(err instanceof Error ? err.message : String(err))
      return
    }
    throw err
  }

  const dataset = loadGoldenDataset()
  const torture = options.includeTorture ? loadTortureDataset() : null
  let cases = [
    ...dataset.cases,
    ...(torture?.cases ?? []).map((c) => ({
      ...c,
      known_outcome: c.known_outcome ?? 'UNKNOWN',
    })),
  ]
  if (options.cases) {
    cases = cases.filter((c) => options.cases.includes(c.id))
    console.error(`  Filtered to ${cases.length} cases: ${options.cases.join(', ')}`)
  }

  console.error(`  Golden dataset v${dataset.version}${torture ? ` + torture v${torture.version}` : ''}: ${cases.length} cases`)
  console.error(
    `  Cases: ${cases.filter((c) => c.known_outcome === 'WON').length} wins, ` +
      `${cases.filter((c) => c.known_outcome === 'STRONG_OPPORTUNITY').length} strong, ` +
      `${cases.filter((c) => c.known_outcome === 'BAD_PROSPECT').length} bad, ` +
      `${cases.filter((c) => c.known_outcome === 'INELIGIBLE').length} ineligible`,
  )
  console.error(
    `  Executing pipeline: ${runner.pipeline_executed} (${runner.pipeline_version})`,
  )
  console.error('')

  const caseResults = []
  const outreachResults = []
  const messages = []
  const executionProof = []

  for (const caseObj of cases) {
    process.stderr.write(`  Evaluating ${caseObj.id}...`)
    const startTime = Date.now()
    let pipelineResult
    try {
      pipelineResult = await runner.runCase(caseObj)
    } catch (err) {
      if (options.pipeline === 'v2') {
        abortV2Unavailable(`case ${caseObj.id}: ${err instanceof Error ? err.message : String(err)}`)
        return
      }
      throw err
    }

    const latency = Date.now() - startTime
    const caseResult = evaluateCase(caseObj, pipelineResult)
    const executionViolations = checkExecutionConstraints(pipelineResult.debug?.callLog, options)
    if (executionViolations.length > 0) {
      caseResult.status = 'FAIL'
      caseResult.reasons.push(...executionViolations.map((v) => `EXECUTION: ${v}`))
    }
    caseResult.latencyMs = latency
    caseResults.push(caseResult)

    executionProof.push({
      caseId: caseObj.id,
      provider: pipelineResult.debug?.provider ?? null,
      orchestrator: pipelineResult.debug?.orchestrator ?? null,
      callLog: pipelineResult.debug?.callLog ?? null,
    })

    if (!options.skipOutreach && pipelineResult.outreach) {
      const outreachResult = evaluateOutreach(caseObj, pipelineResult.outreach)
      outreachResult.caseId = caseObj.id
      outreachResults.push(outreachResult)
      messages.push(pipelineResult.outreach)
    }

    const icon = caseResult.status === 'PASS' ? '✓' : caseResult.status === 'WARN' ? '!' : '✗'
    process.stderr.write(` ${icon} ${caseResult.status} (${latency}ms)\n`)
  }

  const similarity = messages.length >= 2 ? computeMessageSimilarity(messages) : null

  const results = {
    timestamp: new Date().toISOString(),
    pipeline: options.pipeline,
    pipeline_requested: options.pipeline,
    pipeline_executed: runner.pipeline_executed,
    pipeline_version: runner.pipeline_version,
    mock_fallback: false,
    datasetVersion: dataset.version,
    options,
    summary: {},
    caseResults,
    outreachResults,
    similarity,
    executionProof,
  }
  results.summary = generateSummaryForComparison(results)

  let baselineResults = null
  if (options.compare) {
    const comparePath = resolve(REPO_ROOT, options.compare)
    if (existsSync(comparePath)) {
      baselineResults = JSON.parse(readFileSync(comparePath, 'utf-8'))
      console.error(`\n  Loaded baseline: ${options.compare}`)
    } else {
      console.error('\n  Baseline unavailable')
    }
  }

  const report = generateConsoleReport(results, baselineResults)
  console.log(report)

  const outputDir = join(REPO_ROOT, 'benchmark-results')
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  const filename = saveResultsJson(results, options.pipeline)
  console.error(`  Results saved: ${filename}`)
  console.error('')

  const failCount = caseResults.filter((r) => r.status === 'FAIL').length
  if (failCount > 0) {
    console.error(`  ✗ ${failCount} case(s) failed invariants.`)
    process.exitCode = 1
  } else {
    console.error('  ✓ All cases passed.')
  }
}

main().catch((err) => {
  if (options.pipeline === 'v2') {
    abortV2Unavailable(err instanceof Error ? err.message : String(err))
    return
  }
  console.error('Benchmark failed:', err)
  process.exit(1)
})
