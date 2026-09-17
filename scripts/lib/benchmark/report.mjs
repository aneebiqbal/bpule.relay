/**
 * Relay Intelligence Benchmark — Report Generator
 *
 * Produces human-readable and JSON reports from benchmark results.
 */

import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function generateConsoleReport(results, baselineResults = null) {
  const lines = []
  lines.push('')
  lines.push('═'.repeat(72))
  lines.push('  RELAY INTELLIGENCE BENCHMARK — RESULTS')
  lines.push('═'.repeat(72))
  lines.push('')

  // Case-by-case
  lines.push('┌─── CASE RESULTS ──────────────────────────────────────────────────────┐')
  lines.push('')

  for (const r of results.caseResults) {
    const statusIcon = r.status === 'PASS' ? '✓' : r.status === 'WARN' ? '!' : '✗'
    lines.push(`  ${statusIcon} ${r.caseId} [${r.knownOutcome}] — ${r.status}`)
    if (r.reasons.length > 0) {
      for (const reason of r.reasons) {
        lines.push(`    → ${reason}`)
      }
    }
    lines.push(`    Remote: expected=${r.remote.expected} actual=${r.remote.actual} ${r.remote.matches ? '✓' : '✗'}`)
    lines.push(`    Extraction: ${r.completeness.score}/${r.completeness.max} fields matched`)
    if (r.scoring.evaluated) {
      lines.push(`    Score: ${r.scoring.score} → verdict=${r.scoring.verdict} (${r.scoring.alignment})`)
    }
    lines.push('')
  }

  lines.push('└────────────────────────────────────────────────────────────────────────┘')
  lines.push('')

  // Summary metrics
  const summary = computeSummary(results)
  lines.push('┌─── SUMMARY ───────────────────────────────────────────────────────────┐')
  lines.push('')
  lines.push(`  Cases evaluated:     ${summary.total}`)
  lines.push(`  PASS:                 ${summary.pass}`)
  lines.push(`  WARN:                 ${summary.warn}`)
  lines.push(`  FAIL:                 ${summary.fail}`)
  lines.push('')
  lines.push(`  Remote eligibility:   ${summary.remoteMatch}/${summary.remoteTotal} matched (${pct(summary.remoteMatch, summary.remoteTotal)})`)
  lines.push(`  Extraction avg:       ${(summary.avgCompleteness * 100).toFixed(0)}%`)
  lines.push(`  Known-win recognition: ${summary.knownWinRecognition}/${summary.knownWins} (${pct(summary.knownWinRecognition, summary.knownWins)})`)
  lines.push(`  Bad-lead rejection:   ${summary.badLeadRejection}/${summary.badLeads} (${pct(summary.badLeadRejection, summary.badLeads)})`)
  lines.push(`  Fabrication-free:     ${summary.fabricationFree}/${summary.totalWithMessages} (${pct(summary.fabricationFree, summary.totalWithMessages)})`)
  lines.push('')

  if (summary.outreach.total > 0) {
    lines.push('┌─── OUTREACH QUALITY ──────────────────────────────────────────────────┐')
    lines.push('')
    lines.push(`  GOOD:        ${summary.outreach.good} ${bar(summary.outreach.good, summary.outreach.total)}`)
    lines.push(`  LIGHT_EDIT:  ${summary.outreach.lightEdit} ${bar(summary.outreach.lightEdit, summary.outreach.total)}`)
    lines.push(`  BAD:         ${summary.outreach.bad} ${bar(summary.outreach.bad, summary.outreach.total)}`)
    lines.push(`  UNSAFE:      ${summary.outreach.unsafe} ${bar(summary.outreach.unsafe, summary.outreach.total)}`)
    lines.push('')
  }

  if (summary.similarity) {
    lines.push('┌─── MESSAGE SIMILARITY ────────────────────────────────────────────────┐')
    lines.push('')
    lines.push(`  Max similarity:       ${(summary.similarity.maxSimilarity * 100).toFixed(0)}%`)
    lines.push(`  Similar pairs (>60%): ${summary.similarity.similarPairs}`)
    lines.push(`  Repeated openings:    ${summary.similarity.repeatedOpenings.length}`)
    lines.push(`  Repeated CTAs:        ${summary.similarity.repeatedCTAs.length}`)
    lines.push(`  Template-heavy:       ${summary.similarity.isTemplateHeavy ? 'YES ✗' : 'No ✓'}`)
    lines.push('')
  }

  // Baseline comparison
  if (baselineResults) {
    lines.push('┌─── BEFORE / AFTER COMPARISON ─────────────────────────────────────────┐')
    lines.push('')
    const baseSummary = computeSummary(baselineResults)
    const metrics = [
      ['Extraction completeness', baseSummary.avgCompleteness, summary.avgCompleteness, true],
      ['Remote eligibility', pctNum(baseSummary.remoteMatch, baseSummary.remoteTotal), pctNum(summary.remoteMatch, summary.remoteTotal), true],
      ['Known-win recognition', pctNum(baseSummary.knownWinRecognition, baseSummary.knownWins), pctNum(summary.knownWinRecognition, summary.knownWins), true],
      ['Bad-lead rejection', pctNum(baseSummary.badLeadRejection, baseSummary.badLeads), pctNum(summary.badLeadRejection, summary.badLeads), true],
      ['Fabrication-free', pctNum(baseSummary.fabricationFree, baseSummary.totalWithMessages), pctNum(summary.fabricationFree, summary.totalWithMessages), true],
      ['Message GOOD', baseSummary.outreach.good, summary.outreach.good, true],
      ['Message UNSAFE', baseSummary.outreach.unsafe, summary.outreach.unsafe, false],
    ]

    lines.push(`  ${pad('Metric', 28)} ${pad('Baseline', 12)} ${pad('Candidate', 12)} ${pad('Delta', 10)}`)
    lines.push(`  ${'─'.repeat(28)} ${'─'.repeat(12)} ${'─'.repeat(12)} ${'─'.repeat(10)}`)

    for (const [label, base, cand, higherIsBetter] of metrics) {
      const delta = higherIsBetter ? cand - base : base - cand
      const deltaStr = delta > 0 ? `+${formatVal(delta)}` : formatVal(delta)
      const deltaIcon = delta === 0 ? '=' : (higherIsBetter ? (delta > 0 ? '↑' : '↓') : (delta > 0 ? '↑' : '↓'))
      lines.push(`  ${pad(label, 28)} ${pad(formatVal(base), 12)} ${pad(formatVal(cand), 12)} ${pad(deltaStr + ' ' + deltaIcon, 10)}`)
    }
    lines.push('')
  }

  lines.push('└────────────────────────────────────────────────────────────────────────┘')
  lines.push('')

  return lines.join('\n')
}

function computeSummary(results) {
  const total = results.caseResults.length
  const pass = results.caseResults.filter((r) => r.status === 'PASS').length
  const warn = results.caseResults.filter((r) => r.status === 'WARN').length
  const fail = results.caseResults.filter((r) => r.status === 'FAIL').length

  const remoteResults = results.caseResults.filter((r) => r.remote)
  const remoteTotal = remoteResults.length
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

  const outreach = {
    total: withMessages.length,
    good: withMessages.filter((r) => r.status === 'GOOD').length,
    lightEdit: withMessages.filter((r) => r.status === 'LIGHT_EDIT').length,
    bad: withMessages.filter((r) => r.status === 'BAD').length,
    unsafe: withMessages.filter((r) => r.status === 'UNSAFE').length,
  }

  return {
    total, pass, warn, fail,
    remoteTotal, remoteMatch,
    avgCompleteness,
    knownWins: knownWins.length,
    knownWinRecognition,
    badLeads: badLeads.length,
    badLeadRejection,
    totalWithMessages: withMessages.length,
    fabricationFree,
    outreach,
    similarity: results.similarity,
  }
}

function pct(num, denom) {
  if (denom === 0) return 'n/a'
  return `${Math.round((num / denom) * 100)}%`
}

function pctNum(num, denom) {
  if (denom === 0) return 0
  return Math.round((num / denom) * 100)
}

function formatVal(v) {
  if (typeof v === 'number') {
    if (v >= 1) return `${v}%`
    return `${Math.round(v * 100)}%`
  }
  return String(v)
}

function pad(str, len) {
  return String(str).padEnd(len)
}

function bar(val, total) {
  if (total === 0) return ''
  const width = 20
  const filled = Math.round((val / total) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export function saveResultsJson(results, label = 'candidate') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `benchmark-${label}-${timestamp}.json`
  const outputDir = join(__dirname, '..', '..', '..', 'benchmark-results')
  try {
    writeFileSync(join(outputDir, filename), JSON.stringify(results, null, 2))
    return filename
  } catch {
    // Directory may not exist — write to current dir
    writeFileSync(join(process.cwd(), filename), JSON.stringify(results, null, 2))
    return filename
  }
}
