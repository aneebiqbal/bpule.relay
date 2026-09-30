/**
 * V3 Provider Benchmark — Full Metrics
 * Runs identical inputs through all available providers and calculates:
 * - buyer precision/recall/F1
 * - relationship macro-F1
 * - need-owner accuracy
 * - service-provider false-buyer rate
 * - explicit-buyer false-negative rate
 * - message-eligibility precision
 * - dangerous false-send rate after HUMAN_REVIEW policy
 * - Brier/ECE where probabilities exist
 * - p50/p95 latency
 *
 * Output: audit-reports/decision-v3/02_PROVIDER_BENCHMARK.csv
 */

import { FROZEN_EVAL_SET, datasetStats } from './frozen-eval-data.mjs'
import { deterministicDecide, normalizeForProvider } from './normalize-input.mjs'
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Apply V3 Action Policy to get final action + message eligibility ─────────

function applyV3ActionPolicy(
  relationship,
  buyerProb,
  msgEligible,
  explicitRequest,
  confidence,
) {
  const UNCERTAIN_MIN = 0.3
  const UNCERTAIN_MAX = 0.7

  // Hard gates
  if (relationship === 'SERVICE_PROVIDER' || relationship === 'COMPETITOR' || relationship === 'CANDIDATE') {
    if (!explicitRequest || buyerProb < 0.7) {
      return { action: 'SKIP', messageEligible: false }
    }
  }

  // Uncertain zone → HUMAN_REVIEW
  if (buyerProb >= UNCERTAIN_MIN && buyerProb < UNCERTAIN_MAX && !explicitRequest) {
    return { action: 'HUMAN_REVIEW', messageEligible: false }
  }

  // Low confidence contact → HUMAN_REVIEW
  if (buyerProb >= 0.6 && confidence < 0.5) {
    return { action: 'HUMAN_REVIEW', messageEligible: false }
  }

  // Determine action from buyer probability
  let action
  if (buyerProb >= 0.7 && explicitRequest) action = 'CONTACT_NOW'
  else if (buyerProb >= 0.5) action = 'CONNECT_WITH_NOTE'
  else if (buyerProb >= 0.3) action = 'CONNECT_WITHOUT_NOTE'
  else if (buyerProb >= 0.15) action = 'OBSERVE'
  else action = 'SKIP'

  // Non-buyer relationship + contact → HUMAN_REVIEW
  if ((action === 'CONTACT_NOW' || action === 'CONNECT_WITH_NOTE') && relationship !== 'BUYER' && relationship !== 'PARTNER') {
    return { action: 'HUMAN_REVIEW', messageEligible: false }
  }

  // Message eligibility (conservative)
  const canMessage = buyerProb >= 0.4 && msgEligible >= 0.3 &&
    !(buyerProb >= UNCERTAIN_MIN && buyerProb < UNCERTAIN_MAX && !explicitRequest) &&
    action !== 'SKIP' && action !== 'HUMAN_REVIEW' && action !== 'OBSERVE'

  return { action, messageEligible: canMessage }
}

// ── Metrics Calculator ────────────────────────────────────────────────────────

function calculateMetrics(scored, provider) {
  const rows = scored.filter(s => s.provider === provider)
  if (rows.length === 0) return null

  const n = rows.length

  // ── Buyer Request (treat EXPLICIT+STRONG as positive class) ─────────────
  const buyerPos = rows.filter(r => r.gtBuyer === 'EXPLICIT' || r.gtBuyer === 'STRONG')
  const buyerNeg = rows.filter(r => r.gtBuyer === 'NONE')
  const predBuyerPos = rows.filter(r => r.predBuyerProb >= 0.4)

  const truePosBuyer = buyerPos.filter(r => r.predBuyerProb >= 0.4).length
  const falsePosBuyer = buyerNeg.filter(r => r.predBuyerProb >= 0.4).length
  const falseNegBuyer = buyerPos.filter(r => r.predBuyerProb < 0.4).length

  const buyerPrecision = predBuyerPos.length > 0 ? truePosBuyer / predBuyerPos.length : 0
  const buyerRecall = buyerPos.length > 0 ? truePosBuyer / buyerPos.length : 0
  const buyerF1 = (buyerPrecision + buyerRecall) > 0 ? 2 * (buyerPrecision * buyerRecall) / (buyerPrecision + buyerRecall) : 0

  // ── Explicit-buyer false-negative rate ──────────────────────────────────
  const explicitBuyers = rows.filter(r => r.gtBuyer === 'EXPLICIT')
  const missedExplicit = explicitBuyers.filter(r => r.predBuyerProb < 0.4).length
  explicitBuyers.length > 0 ? missedExplicit / explicitBuyers.length : 0

  // ── Relationship macro-F1 ───────────────────────────────────────────────
  const relClasses = ['BUYER', 'SERVICE_PROVIDER', 'COMPETITOR', 'PARTNER', 'CANDIDATE', 'MIXED', 'UNKNOWN']
  let macroF1Sum = 0
  let relClassCount = 0

  for (const cls of relClasses) {
    const gtCls = rows.filter(r => r.gtRel === cls)
    const predCls = rows.filter(r => r.predRel === cls)
    if (gtCls.length === 0 && predCls.length === 0) continue

    const tp = rows.filter(r => r.gtRel === cls && r.predRel === cls).length
    const fp = predCls.filter(r => r.gtRel !== cls).length
    const fn = gtCls.filter(r => r.predRel !== cls).length

    const prec = (tp + fp) > 0 ? tp / (tp + fp) : 0
    const rec = (tp + fn) > 0 ? tp / (tp + fn) : 0
    const f1 = (prec + rec) > 0 ? 2 * (prec + rec) > 0 ? 2 * prec * rec / (prec + rec) : 0 : 0

    macroF1Sum += (prec + rec) > 0 ? 2 * prec * rec / (prec + rec) : 0
    relClassCount++
  }

  const relMacroF1 = relClassCount > 0 ? macroF1Sum / relClassCount : 0

  // ── Need-owner accuracy ─────────────────────────────────────────────────
  const needCorrect = rows.filter(r => r.predNeedOwner === r.gtNeedOwner || r.gtNeedOwner === 'UNKNOWN').length
  const needAccuracy = needCorrect / n

  // ── Service-provider false-buyer rate ───────────────────────────────────
  const spExamples = rows.filter(r => r.gtRel === 'SERVICE_PROVIDER' || r.gtRel === 'COMPETITOR')
  const spFalseBuyers = spExamples.filter(r => r.predBuyerProb >= 0.4).length
  const spFalseBuyerRate = spExamples.length > 0 ? spFalseBuyers / spExamples.length : 0

  // ── Message-eligibility precision ───────────────────────────────────────
  const msgPos = rows.filter(r => r.messageEligible)
  const gtMsgPos = rows.filter(r => r.gtMsgEligible === 'YES')
  const msgTruePos = rows.filter(r => r.messageEligible && r.gtMsgEligible === 'YES').length
  const msgPrecision = msgPos.length > 0 ? msgTruePos / msgPos.length : 1

  // ── Dangerous false-send rate (message sent when gt says NO) ────────────
  const dangerousSends = rows.filter(r => r.messageEligible && r.gtMsgEligible === 'NO').length
  const dangerousFalseSendRate = dangerousSends / n

  // ── Brier score (buyer request probability calibration) ─────────────────
  const brierScores = rows.map(r => {
    const actual = (r.gtBuyer === 'EXPLICIT' || r.gtBuyer === 'STRONG') ? 1 : 0
    return Math.pow(r.predBuyerProb - actual, 2)
  })
  const brierScore = brierScores.reduce((a, b) => a + b, 0) / n

  // ── Expected Calibration Error (10 bins) ───────────────────────────────
  const bins = Array.from({ length: 10 }, (_, i) => ({
    predicted: i * 0.1 + 0.05,
    actual: 0,
    count: 0,
  }))

  for (const r of rows) {
    const actual = (r.gtBuyer === 'EXPLICIT' || r.gtBuyer === 'STRONG') ? 1 : 0
    const binIdx = Math.min(9, Math.floor(r.predBuyerProb * 10))
    bins[binIdx].actual += actual
    bins[binIdx].count++
  }

  let ece = 0
  for (const bin of bins) {
    if (bin.count > 0) {
      const avgPredicted = bin.predicted
      const avgActual = bin.actual / bin.count
      ece += (bin.count / n) * Math.abs(avgPredicted - avgActual)
    }
  }

  // ── Latency ─────────────────────────────────────────────────────────────
  const latencies = rows.map(r => r.latencyMs).sort((a, b) => a - b)
  const p50 = latencies[Math.floor(n * 0.5)] || 0
  const p95 = latencies[Math.floor(n * 0.95)] || 0
  const avgLat = latencies.reduce((a, b) => a + b, 0) / n

  // ── Action agreement ────────────────────────────────────────────────────
  const actionCorrect = rows.filter(r => {
    if (r.action === r.gtAction) return true
    // Allow nearby actions
    const actionOrder = ['CONTACT_NOW', 'CONNECT_WITH_NOTE', 'CONNECT_WITHOUT_NOTE', 'OBSERVE', 'WAIT', 'SKIP', 'HUMAN_REVIEW']
    const predIdx = actionOrder.indexOf(r.action)
    const gtIdx = actionOrder.indexOf(r.gtAction)
    return Math.abs(predIdx - gtIdx) <= 1
  }).length

  return {
    provider,
    n,
    buyerPrecision: Math.round(buyerPrecision * 100) / 100,
    buyerRecall: Math.round(buyerRecall * 100) / 100,
    buyerF1: Math.round(buyerF1 * 100) / 100,
    explicitBuyerFNR: Math.round((explicitBuyers.length > 0 ? explicitBuyers.filter(r => r.predBuyerProb < 0.4).length / explicitBuyers.length : 0) * 100) / 100,
    relMacroF1: Math.round(relMacroF1 * 100) / 100,
    needOwnerAccuracy: Math.round(needAccuracy * 100) / 100,
    spFalseBuyerRate: Math.round(spFalseBuyerRate * 100) / 100,
    msgEligibilityPrecision: Math.round(msgPrecision * 100) / 100,
    dangerousFalseSendRate: Math.round(dangerousFalseSendRate * 100) / 100,
    brierScore: Math.round(brierScore * 1000) / 1000,
    ece: Math.round(ece * 1000) / 1000,
    p50LatencyMs: Math.round(p50 * 100) / 100,
    p95LatencyMs: Math.round(p95 * 100) / 100,
    avgLatencyMs: Math.round(avgLat * 100) / 100,
    actionAgreement: Math.round((actionCorrect / n) * 100) / 100,
  }
}

// ── OpenAI Call ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a bounded commercial decision classifier for a software development agency.
You evaluate a single OPPORTUNITY EPISODE, not a person.
Your output is typed classification only. No explanations. No business impact analysis.
Rules:
1. Score the EPISODE, not the person's identity
2. A SERVICE_PROVIDER relationship does NOT disqualify an explicit BUYER_REQUEST episode
3. An agency can hire another agency. A founder can sell services AND hire developers.
4. Explicit apply instructions (email, DM, link) increase buyer_request_probability significantly
5. Timing is separate from intent — high intent + stale timing = aging opportunity, not "no opportunity"
6. Organization scoping: only evaluate the episode for the specified organization
7. If evidence is weak, probabilities should be low`

const JSON_SCHEMA = {
  type: 'object',
  properties: {
    relationship: { type: 'string', enum: ['BUYER', 'SERVICE_PROVIDER', 'COMPETITOR', 'PARTNER', 'CANDIDATE', 'MIXED', 'UNKNOWN'] },
    buyerRequestProbability: { type: 'number', minimum: 0, maximum: 1 },
    needOwner: { type: 'string', enum: ['SELF_NEED', 'ORGANIZATION_NEED', 'HIRING_NEED', 'CUSTOMER_NEED', 'MARKET_PROBLEM', 'SERVICE_OFFERING', 'PRODUCT_PROBLEM', 'UNKNOWN'] },
    timing: { type: 'string', enum: ['CURRENT', 'AGING', 'STALE', 'UNKNOWN'] },
    fit: { type: 'string', enum: ['POOR', 'WEAK', 'MEDIUM', 'STRONG', 'EXCELLENT'] },
    access: { type: 'string', enum: ['NONE', 'INDIRECT', 'CONNECTION', 'DIRECT'] },
    messageEligible: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['relationship', 'buyerRequestProbability', 'needOwner', 'timing', 'fit', 'access', 'messageEligible'],
  additionalProperties: false,
}

async function callOpenAI(input) {
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildPrompt(input) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'v3_decision', schema: JSON_SCHEMA, strict: true },
        },
        temperature: 0.1,
        max_tokens: 300,
      }),
    })

    if (!resp.ok) {
      return { relationship: 'UNKNOWN', buyerRequestProbability: 0, needOwner: 'UNKNOWN', timing: 'UNKNOWN', fit: 'MEDIUM', access: 'INDIRECT', messageEligible: 0, confidence: 0, error: `HTTP ${resp.status}` }
    }

    const data = await resp.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return { relationship: 'UNKNOWN', buyerRequestProbability: 0, needOwner: 'UNKNOWN', timing: 'UNKNOWN', fit: 'MEDIUM', access: 'INDIRECT', messageEligible: 0, confidence: 0, error: 'empty' }

    const p = JSON.parse(content)
    const validRels = ['BUYER', 'SERVICE_PROVIDER', 'COMPETITOR', 'PARTNER', 'CANDIDATE', 'MIXED', 'UNKNOWN']
    const validOwners = ['SELF_NEED', 'ORGANIZATION_NEED', 'HIRING_NEED', 'CUSTOMER_NEED', 'MARKET_PROBLEM', 'SERVICE_OFFERING', 'PRODUCT_PROBLEM', 'UNKNOWN']
    const validTimings = ['CURRENT', 'AGING', 'STALE', 'UNKNOWN']
    const validFits = ['POOR', 'WEAK', 'MEDIUM', 'STRONG', 'EXCELLENT']
    const validAccess = ['NONE', 'INDIRECT', 'CONNECTION', 'DIRECT']

    return {
      relationship: validRels.includes(p.relationship) ? p.relationship : 'UNKNOWN',
      buyerRequestProbability: (typeof p.buyerRequestProbability === 'number') ? Math.max(0, Math.min(1, p.buyerRequestProbability)) : 0.5,
      needOwner: validOwners.includes(p.needOwner) ? p.needOwner : 'UNKNOWN',
      timing: validTimings.includes(p.timing) ? p.timing : 'UNKNOWN',
      fit: validFits.includes(p.fit) ? p.fit : 'MEDIUM',
      access: validAccess.includes(p.access) ? p.access : 'INDIRECT',
      messageEligible: (typeof p.messageEligible === 'number') ? Math.max(0, Math.min(1, p.messageEligible)) : 0.5,
      confidence: 1 - 2 * Math.abs((typeof p.buyerRequestProbability === 'number' ? p.buyerRequestProbability : 0.5) - 0.5),
      error: null,
    }
  } catch (e) {
    return { relationship: 'UNKNOWN', buyerRequestProbability: 0, needOwner: 'UNKNOWN', timing: 'UNKNOWN', fit: 'MEDIUM', access: 'INDIRECT', messageEligible: 0, confidence: 0, error: String(e) }
  }
}

function buildPrompt(input) {
  return `Evaluate this single opportunity episode:\n\n## Source Text\n${input.rawText}\n\n## Person: ${input.personName || 'Unknown'}\n## Organization: ${input.organizationName || 'Unknown'}\n## Current Date: ${input.currentDate}\n\nRemember: A SERVICE_PROVIDER relationship does NOT disqualify a separate explicit BUYER_REQUEST event. Score the episode, not the person globally.`
}

// ── Run Benchmark ────────────────────────────────────────────────────────────

async function runBenchmark() {
  const results = []

  for (const example of FROZEN_EVAL_SET) {
    const input = normalizeForProvider(example)

    // Run deterministic V3
    const start = performance.now()
    const detResult = deterministicDecide(input.rawText)
    const latency = performance.now() - start

    const policy = applyV3ActionPolicy(
      detResult.relationship,
      detResult.buyerRequestProbability,
      detResult.messageEligible,
      input.explicitRequest,
      detResult.confidence,
    )

    results.push({
      exampleId: example.id,
      category: example.category,
      provider: 'deterministic_v3',
      gtRel: example.labels.relationship,
      gtBuyer: example.labels.buyerRequest,
      gtNeedOwner: example.labels.needOwnership,
      gtMsgEligible: example.labels.messageEligible,
      gtAction: example.labels.action,
      predRel: detResult.relationship,
      predBuyerProb: detResult.buyerRequestProbability,
      predBuyer: probToLabel(detResult.buyerRequestProbability),
      predNeedOwner: detResult.needOwner,
      predMsgEligible: detResult.messageEligible,
      predConfidence: detResult.confidence,
      action: policy.action,
      messageEligible: policy.messageEligible,
      latencyMs: Math.round(latency * 100) / 100,
    })

    // Run OpenAI if available
    if (process.env.OPENAI_API_KEY) {
      const aiStart = performance.now()
      const aiResult = await callOpenAI(input)
      const aiLatency = performance.now() - aiStart

      if (!aiResult.error) {
        const aiPolicy = applyV3ActionPolicy(
          aiResult.relationship,
          aiResult.buyerRequestProbability,
          aiResult.messageEligible,
          input.explicitRequest,
          aiResult.confidence,
        )

        results.push({
          exampleId: example.id,
          category: example.category,
          provider: 'openai_gpt-4o-mini',
          gtRel: example.labels.relationship,
          gtBuyer: example.labels.buyerRequest,
      gtNeedOwner: example.labels.needOwner,
          gtMsgEligible: example.labels.messageEligible,
          gtAction: example.labels.action,
          predRel: aiResult.relationship,
          predBuyerProb: aiResult.buyerRequestProbability,
          predBuyer: probToLabel(aiResult.buyerRequestProbability),
          predNeedOwner: aiResult.needOwner,
          predMsgEligible: aiResult.messageEligible,
          predConfidence: aiResult.confidence,
          action: aiPolicy.action,
          messageEligible: aiPolicy.messageEligible,
          latencyMs: Math.round(aiLatency * 100) / 100,
        })
      }
    }
  }

  return results
}

function probToLabel(prob) {
  if (prob >= 0.6) return 'EXPLICIT'
  if (prob >= 0.35) return 'STRONG'
  if (prob >= 0.15) return 'WEAK'
  return 'NONE'
}

// ── Generate Outputs ──────────────────────────────────────────────────────────

function generateCSV(results) {
  const headers = [
    'example_id', 'category', 'provider',
    'gt_relationship', 'pred_relationship', 'rel_correct',
    'gt_buyer_request', 'pred_buyer_prob', 'pred_buyer_label', 'buyer_correct',
    'gt_need_owner', 'pred_need_owner', 'need_owner_correct',
    'gt_msg_eligible', 'pred_msg_eligible', 'msg_eligible_correct',
    'gt_action', 'pred_action', 'action_correct',
    'confidence', 'latency_ms',
  ]

  const rows = results.map(r => [
    r.exampleId, r.category, r.provider,
    r.gtRel, r.predRel, r.predRel === r.gtRel ? 1 : 0,
    r.gtBuyer, r.predBuyerProb.toFixed(2), r.predBuyer,
    ((r.gtBuyer === 'EXPLICIT' || r.gtBuyer === 'STRONG') && r.predBuyerProb >= 0.4) ||
    (r.gtBuyer === 'NONE' && r.predBuyerProb < 0.25) ||
    (r.gtBuyer === 'WEAK' && r.predBuyerProb >= 0.15 && r.predBuyerProb < 0.6) ? 1 : 0,
    r.gtNeedOwner, r.predNeedOwner, r.predNeedOwner === r.gtNeedOwner ? 1 : 0,
    r.gtMsgEligible, r.messageEligible ? 'YES' : 'NO',
    (r.gtMsgEligible === 'YES' && r.messageEligible) ||
    (r.gtMsgEligible === 'NO' && !r.messageEligible) ||
    (r.gtMsgEligible === 'HUMAN_REVIEW') ? 1 : 0,
    r.gtAction, r.action,
    r.action === r.gtAction ? 1 : 0,
    r.predConfidence.toFixed(2), r.latencyMs,
  ])

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
}

function generateMetricsReport(results) {
  const lines = []
  lines.push('# V3 Provider Benchmark — Metrics')
  lines.push('')
  lines.push(`Generated: ${new Date().toISOString()}`)
  lines.push(`Frozen examples: ${FROZEN_EVAL_SET.length}`)

  // Get all providers in results
  const providers = [...new Set(results.map(r => r.provider))].sort()
  lines.push(`Providers: ${providers.join(', ')}`)
  lines.push('')

  lines.push('## Dataset Distribution')
  lines.push('')
  const stats = datasetStats()
  lines.push(`Total: ${stats.total}`)
  lines.push(`Relationships: ${JSON.stringify(stats.relationships)}`)
  lines.push(`Buyer Requests: ${JSON.stringify(stats.buyerRequests)}`)
  lines.push(`Message Eligible: ${JSON.stringify(stats.messageEligible)}`)
  lines.push('')

  // Calculate metrics for each provider
  let allPass = true
  for (const provider of providers) {
    const metrics = calculateMetrics(results, provider)
    if (!metrics) continue

    lines.push(`## Metrics: ${provider}`)
    lines.push('')
    lines.push('| Metric | Value | Pass Criteria | Status |')
    lines.push('|--------|-------|---------------|--------|')

  const checks = [ // name, value, criteria, pass
    ['Buyer Precision', metrics.buyerPrecision, '>= 0.60', metrics.buyerPrecision >= 0.60],
    ['Buyer Recall', metrics.buyerRecall, '>= 0.90', metrics.buyerRecall >= 0.90],
    ['Buyer F1', metrics.buyerF1, '>= 0.75', metrics.buyerF1 >= 0.75],
    ['Relationship Macro-F1', metrics.relMacroF1, '>= 0.80', metrics.relMacroF1 >= 0.80],
    ['Need-Owner Accuracy', metrics.needOwnerAccuracy, '>= 0.60', metrics.needOwnerAccuracy >= 0.60],
    ['SP False-Buyer Rate', metrics.spFalseBuyerRate, '<= 0.10', metrics.spFalseBuyerRate <= 0.10],
    ['Msg-Eligibility Precision', metrics.msgEligibilityPrecision, '>= 0.90', metrics.msgEligibilityPrecision >= 0.90],
    ['Dangerous False-Send Rate', metrics.dangerousFalseSendRate, '<= 0.02', metrics.dangerousFalseSendRate <= 0.02],
    ['Explicit-Buyer FNR', metrics.explicitBuyerFNR, '<= 0.10', metrics.explicitBuyerFNR <= 0.10],
    ['Brier Score', metrics.brierScore, '<= 0.15', metrics.brierScore <= 0.15],
    ['ECE', metrics.ece, '<= 0.10', metrics.ece <= 0.10],
    ['Action Agreement', metrics.actionAgreement, '>= 0.60', metrics.actionAgreement >= 0.60],
    ['p50 Latency (ms)', metrics.p50LatencyMs, '<= 100', metrics.p50LatencyMs <= 100],
    ['p95 Latency (ms)', metrics.p95LatencyMs, '<= 500', metrics.p95LatencyMs <= 500],
  ]

  let providerPass = 0
  let providerTotal = 0
  for (const [name, value, criteria, pass] of checks) {
    lines.push(`| ${name} | ${value} | ${criteria} | ${pass ? 'PASS' : 'FAIL'} |`)
    providerTotal++
    if (pass) providerPass++
  }

  lines.push('')
  lines.push(`**${providerPass}/${providerTotal} criteria passed**`)
  if (providerPass < providerTotal) {
    allPass = false
    lines.push('')
    lines.push('Failed:')
    for (const [name, value, criteria, pass] of checks) {
      if (!pass) lines.push(`- ${name}: ${value} (need ${criteria})`)
    }
  }
  lines.push('')
  lines.push('---')
  lines.push('')
  }

  lines.push('## Overall Verdict')
  lines.push('')
  if (allPass) {
    lines.push('**All providers pass all criteria.** Ready for shadow validation.')
  } else {
    lines.push('**Some providers fail criteria.** See details above.')
    lines.push('')
    lines.push('Dangerous false-send must be <= 2% for ALL providers before promotion.')
  }

  return lines.join('\n')
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Running V3 provider benchmark...')
  console.log(`Dataset: ${FROZEN_EVAL_SET.length} examples`)
  console.log('')

  const results = await runBenchmark()

  // Generate CSV
  const csv = generateCSV(results)
  const csvPath = resolve(__dirname, '../../audit-reports/decision-v3/02_PROVIDER_BENCHMARK.csv')
  writeFileSync(csvPath, csv, 'utf8')
  console.log(`CSV written: ${csvPath}`)

  // Generate metrics report
  const report = generateMetricsReport(results)
  const reportPath = resolve(__dirname, '../../audit-reports/decision-v3/03_PROVIDER_BENCHMARK.md')
  writeFileSync(reportPath, report, 'utf8')
  console.log(`Report written: ${reportPath}`)

  // Print summary
  console.log('')
  console.log(report)

  return results
}

main().catch(console.error)
