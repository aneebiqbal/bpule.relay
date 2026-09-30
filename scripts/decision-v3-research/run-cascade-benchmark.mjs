#!/usr/bin/env node
/**
 * V3 Multi-Model Cascade Benchmark
 *
 * Runs identical 105 frozen examples through:
 *   - gpt-4o-mini
 *   - gpt-4o
 *   - gpt-4.1
 *
 * Plus cascade strategies:
 *   - A: gpt-4o-mini only
 *   - B: gpt-4o only
 *   - C: gpt-4.1 only
 *   - D: gpt-4o-mini → gpt-4o on escalation
 *   - E: gpt-4o-mini → gpt-4.1 on escalation
 *
 * Same bounded questions, schemas, labels, and policy for all models.
 */

// ── Load frozen dataset ──────────────────────────────────────────────────────

const frozenModule = await import('./frozen-eval-data.mjs')
const FROZEN = frozenModule.FROZEN_EVAL_SET

// ── Shared System Prompt (identical for all models) ──────────────────────────

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

// ── Model configurations ─────────────────────────────────────────────────────

const MODELS = {
  'gpt-4o-mini': { model: 'gpt-4o-mini', costPerInputToken: 0.15 / 1e6, costPerOutputToken: 0.60 / 1e6 },
  'gpt-4o': { model: 'gpt-4o', costPerInputToken: 2.50 / 1e6, costPerOutputToken: 10.00 / 1e6 },
  'gpt-4.1': { model: 'gpt-4.1', costPerInputToken: 2.00 / 1e6, costPerOutputToken: 8.00 / 1e6 },
}

// ── Normalize input ──────────────────────────────────────────────────────────

function normalizeInput(example) {
  const text = example.rawText
  const personMatch = text.match(/^([A-Z][a-z]+(?: [A-Z][a-z]+)+)/m)
  const orgMatch = text.match(/(?:at|@)\s+([A-Z][\w\s&.]+?)(?:\.|,|\n|$)/m)

  return {
    rawText: text,
    personName: personMatch ? personMatch[1] : null,
    organizationName: orgMatch ? orgMatch[1].trim() : null,
    currentDate: new Date().toISOString(),
    explicitRequest: detectExplicitRequest(text),
  }
}

function detectExplicitRequest(text) {
  const t = text.toLowerCase()
  return /send.*(resume|portfolio|github|availability)|apply.*(email|here|link)|dm me|email.*to.*apply/i.test(t)
}

function buildPrompt(input) {
  return `Evaluate this single opportunity episode:\n\n## Source Text\n${input.rawText}\n\n## Person: ${input.personName || 'Unknown'}\n## Organization: ${input.organizationName || 'Unknown'}\n## Current Date: ${input.currentDate}\n\nRemember: A SERVICE_PROVIDER relationship does NOT disqualify a separate explicit BUYER_REQUEST event. Score the episode, not the person globally.`
}

// ── Call OpenAI API ──────────────────────────────────────────────────────────

async function callOpenAI(model, prompt) {
  const start = performance.now()
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'v3_decision', schema: JSON_SCHEMA, strict: true },
        },
        temperature: 0.1,
        max_tokens: 300,
      }),
    })

    const latency = performance.now() - start

    if (!resp.ok) {
      return { error: `HTTP ${resp.status}`, latency, relationship: 'UNKNOWN', buyerRequestProbability: 0, needOwner: 'UNKNOWN', timing: 'UNKNOWN', fit: 'MEDIUM', access: 'INDIRECT', messageEligible: 0, confidence: 0 }
    }

    const data = await resp.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return { error: 'empty', latency, relationship: 'UNKNOWN', buyerRequestProbability: 0, needOwner: 'UNKNOWN', timing: 'UNKNOWN', fit: 'MEDIUM', access: 'INDIRECT', messageEligible: 0, confidence: 0 }

    const p = JSON.parse(content)
    const latencyMs = Math.round(latency * 100) / 100

    return {
      latency: latencyMs,
      error: null,
      relationship: validateRel(p.relationship),
      buyerRequestProbability: clampProb(p.buyerRequestProbability),
      needOwner: validateOwner(p.needOwner),
      timing: validateTiming(p.timing),
      fit: validateFit(p.fit),
      access: validateAccess(p.access),
      messageEligible: clampProb(p.messageEligible),
      confidence: clampProb(1 - 2 * Math.abs(clampProb(p.buyerRequestProbability) - 0.5)),
    }
  } catch (e) {
    return { error: String(e), latency: performance.now() - start, relationship: 'UNKNOWN', buyerRequestProbability: 0, needOwner: 'UNKNOWN', timing: 'UNKNOWN', fit: 'MEDIUM', access: 'INDIRECT', messageEligible: 0, confidence: 0 }
  }
}

// ── V3 Action Policy (identical for all) ─────────────────────────────────────

function applyPolicy(result, explicitRequest) {
  const UNCERTAIN_MIN = 0.3, UNCERTAIN_MAX = 0.7

  // Hard gates
  if (['SERVICE_PROVIDER', 'COMPETITOR', 'CANDIDATE'].includes(result.relationship)) {
    if (!explicitRequest || result.buyerRequestProbability < 0.7) {
      return { action: 'SKIP', messageEligible: false }
    }
  }

  if (result.buyerRequestProbability >= UNCERTAIN_MIN && result.buyerRequestProbability < UNCERTAIN_MAX && !explicitRequest) {
    return { action: 'HUMAN_REVIEW', messageEligible: false }
  }

  if (result.buyerRequestProbability >= 0.6 && result.confidence < 0.5) {
    return { action: 'HUMAN_REVIEW', messageEligible: false }
  }

  let action
  if (result.buyerRequestProbability >= 0.7 && explicitRequest) action = 'CONTACT_NOW'
  else if (result.buyerRequestProbability >= 0.5) action = 'CONNECT_WITH_NOTE'
  else if (result.buyerRequestProbability >= 0.3) action = 'CONNECT_WITHOUT_NOTE'
  else if (result.buyerRequestProbability >= 0.15) action = 'OBSERVE'
  else action = 'SKIP'

  if ((action === 'CONTACT_NOW' || action === 'CONNECT_WITH_NOTE') && result.relationship !== 'BUYER' && result.relationship !== 'PARTNER') {
    return { action: 'HUMAN_REVIEW', messageEligible: false }
  }

  const canMessage = result.buyerRequestProbability >= 0.4 && result.messageEligible >= 0.3 &&
    !(result.buyerRequestProbability >= UNCERTAIN_MIN && result.buyerRequestProbability < UNCERTAIN_MAX && !explicitRequest) &&
    !['SKIP', 'HUMAN_REVIEW', 'OBSERVE'].includes(action)

  return { action, messageEligible: canMessage }
}

// ── Cascade Logic ────────────────────────────────────────────────────────────

function shouldEscalate(result, explicitRequest) {
  // Only escalate when the cheap model is dangerously uncertain
  // i.e., when the wrong decision would be expensive (contacting SP, missing buyer)

  const prob = result.buyerRequestProbability
  const rel = result.relationship

  // Case 1: Service provider / competitor identity with buyer event signal
  // This is the Abdulhakim case — needs careful verification
  if (['SERVICE_PROVIDER', 'COMPETITOR'].includes(rel) && prob >= 0.3) return true

  // Case 2: UNKNOWN relationship with medium buyer probability
  // The cheap model can't decide — escalate for better classification
  if (rel === 'UNKNOWN' && prob >= 0.25 && prob < 0.7) return true

  // Case 3: MIXED relationship — always escalate (needs careful handling)
  if (rel === 'MIXED') return true

  // Case 4: Buyer probability near the decision boundary (0.4-0.6)
  // where small errors change the action
  if (prob >= 0.35 && prob < 0.55 && !explicitRequest) return true

  return false
}

// ── Validation Helpers ───────────────────────────────────────────────────────

function clampProb(v) { return typeof v === 'number' && !isNaN(v) ? Math.max(0, Math.min(1, Math.round(v * 100) / 100)) : 0.5 }
function validateRel(v) { return ['BUYER', 'SERVICE_PROVIDER', 'COMPETITOR', 'PARTNER', 'CANDIDATE', 'MIXED', 'UNKNOWN'].includes(v) ? v : 'UNKNOWN' }
function validateOwner(v) { return ['SELF_NEED', 'ORGANIZATION_NEED', 'HIRING_NEED', 'CUSTOMER_NEED', 'MARKET_PROBLEM', 'SERVICE_OFFERING', 'PRODUCT_PROBLEM', 'UNKNOWN'].includes(v) ? v : 'UNKNOWN' }
function validateTiming(v) { return ['CURRENT', 'AGING', 'STALE', 'UNKNOWN'].includes(v) ? v : 'UNKNOWN' }
function validateFit(v) { return ['POOR', 'WEAK', 'MEDIUM', 'STRONG', 'EXCELLENT'].includes(v) ? v : 'MEDIUM' }
function validateAccess(v) { return ['NONE', 'INDIRECT', 'CONNECTION', 'DIRECT'].includes(v) ? v : 'INDIRECT' }

// ── Metrics Calculator ────────────────────────────────────────────────────────

function calculateMetrics(results, provider) {
  const rows = results.filter(r => r.provider === provider)
  if (rows.length === 0) return null
  const n = rows.length

  const buyerPos = rows.filter(r => r.gtBuyer === 'EXPLICIT' || r.gtBuyer === 'STRONG')
  const buyerNeg = rows.filter(r => r.gtBuyer === 'NONE')
  const predBuyerPos = rows.filter(r => r.predBuyerProb >= 0.4)

  const tp = buyerPos.filter(r => r.predBuyerProb >= 0.4).length
  const fp = buyerNeg.filter(r => r.predBuyerProb >= 0.4).length
  const fn = buyerPos.filter(r => r.predBuyerProb < 0.4).length

  const buyerPrecision = predBuyerPos.length > 0 ? tp / predBuyerPos.length : 0
  const buyerRecall = buyerPos.length > 0 ? tp / buyerPos.length : 0
  const buyerF1 = (buyerPrecision + buyerRecall) > 0 ? 2 * buyerPrecision * buyerRecall / (buyerPrecision + buyerRecall) : 0

  const explicitBuyers = rows.filter(r => r.gtBuyer === 'EXPLICIT')
  const missedExplicit = explicitBuyers.filter(r => r.predBuyerProb < 0.4).length
  const explicitFNR = explicitBuyers.length > 0 ? missedExplicit / explicitBuyers.length : 0

  const relClasses = ['BUYER', 'SERVICE_PROVIDER', 'COMPETITOR', 'PARTNER', 'CANDIDATE', 'MIXED', 'UNKNOWN']
  let macroF1Sum = 0, relCount = 0
  for (const cls of relClasses) {
    const gtCls = rows.filter(r => r.gtRel === cls)
    const predCls = rows.filter(r => r.predRel === cls)
    if (gtCls.length === 0 && predCls.length === 0) continue
    const tpR = rows.filter(r => r.gtRel === cls && r.predRel === cls).length
    const fpR = predCls.filter(r => r.gtRel !== cls).length
    const fnR = gtCls.filter(r => r.predRel !== cls).length
    const precR = (tpR + fpR) > 0 ? tpR / (tpR + fpR) : 0
    const recR = (tpR + fnR) > 0 ? tpR / (tpR + fnR) : 0
    const f1R = (precR + recR) > 0 ? 2 * precR * recR / (precR + recR) : 0
    macroF1Sum += (precR + recR) > 0 ? f1R : 0
    relCount++
  }
  const relMacroF1 = relCount > 0 ? macroF1Sum / relCount : 0

  const needCorrect = rows.filter(r => r.predNeedOwner === r.gtNeedOwner || r.gtNeedOwner === 'UNKNOWN').length
  const needAccuracy = needCorrect / n

  const spExamples = rows.filter(r => r.gtRel === 'SERVICE_PROVIDER' || r.gtRel === 'COMPETITOR')
  const spFalseBuyers = spExamples.filter(r => r.predBuyerProb >= 0.4).length
  const spFalseBuyerRate = spExamples.length > 0 ? spFalseBuyers / spExamples.length : 0

  // Post-policy SP false-send rate
  const spFalseSends = spExamples.filter(r => r.messageEligible).length
  const spFalseSendRate = spExamples.length > 0 ? spFalseSends / spExamples.length : 0

  const msgPos = rows.filter(r => r.messageEligible)
  const msgTP = rows.filter(r => r.messageEligible && r.gtMsgEligible === 'YES').length
  const msgPrecision = msgPos.length > 0 ? msgTP / msgPos.length : 1

  const dangerousSends = rows.filter(r => r.messageEligible && r.gtMsgEligible === 'NO').length
  const dangerousFalseSendRate = dangerousSends / n

  // Brier
  const brier = rows.map(r => Math.pow(r.predBuyerProb - ((r.gtBuyer === 'EXPLICIT' || r.gtBuyer === 'STRONG') ? 1 : 0), 2)).reduce((a, b) => a + b, 0) / n

  // ECE (10 bins)
  const bins = Array.from({ length: 10 }, (_, i) => ({ pred: i * 0.1 + 0.05, actual: 0, count: 0 }))
  for (const r of rows) {
    const actual = (r.gtBuyer === 'EXPLICIT' || r.gtBuyer === 'STRONG') ? 1 : 0
    const idx = Math.min(9, Math.floor(r.predBuyerProb * 10))
    bins[idx].actual += actual
    bins[idx].count++
  }
  let ece = 0
  for (const bin of bins) {
    if (bin.count > 0) ece += (bin.count / n) * Math.abs(bin.pred - bin.actual / bin.count)
  }

  const latencies = rows.map(r => r.latencyMs).sort((a, b) => a - b)
  const p50 = latencies[Math.floor(n * 0.5)] || 0
  const p95 = latencies[Math.floor(n * 0.95)] || 0
  const avgLat = latencies.reduce((a, b) => a + b, 0) / n

  const escalations = rows.filter(r => r.escalated).length
  const escalationRate = escalations / n

  return {
    provider, n,
    buyerPrecision: Math.round(buyerPrecision * 100) / 100,
    buyerRecall: Math.round(buyerRecall * 100) / 100,
    buyerF1: Math.round(buyerF1 * 100) / 100,
    explicitBuyerFNR: Math.round(explicitFNR * 100) / 100,
    relMacroF1: Math.round(relMacroF1 * 100) / 100,
    needOwnerAccuracy: Math.round(needAccuracy * 100) / 100,
    spFalseBuyerRate: Math.round(spFalseBuyerRate * 100) / 100,
    spFalseSendRate: Math.round(spFalseSendRate * 100) / 100,
    msgEligibilityPrecision: Math.round(msgPrecision * 100) / 100,
    dangerousFalseSendRate: Math.round(dangerousFalseSendRate * 100) / 100,
    brierScore: Math.round(brier * 1000) / 1000,
    ece: Math.round(ece * 1000) / 1000,
    p50LatencyMs: Math.round(p50),
    p95LatencyMs: Math.round(p95),
    avgLatencyMs: Math.round(avgLat),
    escalationRate: Math.round(escalationRate * 100) / 100,
  }
}

// ── Run Benchmark ────────────────────────────────────────────────────────────

async function runBenchmark() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY required')
    process.exit(1)
  }

  const results = []
  const strategies = [
    { id: 'A: gpt-4o-mini only', primary: 'gpt-4o-mini', escalation: null },
    { id: 'B: gpt-4o only', primary: 'gpt-4o', escalation: null },
    { id: 'C: gpt-4.1 only', primary: 'gpt-4.1', escalation: null },
    { id: 'D: mini→4o cascade', primary: 'gpt-4o-mini', escalation: 'gpt-4o' },
    { id: 'E: mini→4.1 cascade', primary: 'gpt-4o-mini', escalation: 'gpt-4.1' },
  ]

  for (const strategy of strategies) {
    console.log(`Running strategy: ${strategy.id}...`)

    for (const example of FROZEN) {
      const input = normalizeInput(example)
      const prompt = buildPrompt(input)

      // Primary model
      const primaryResult = await callOpenAI(MODELS[strategy.primary].model, prompt)
      let finalResult = primaryResult
      let escalated = false

      // Cascade escalation
      if (strategy.escalation && !primaryResult.error && shouldEscalate(primaryResult, input.explicitRequest)) {
        const escalationResult = await callOpenAI(MODELS[strategy.escalation].model, prompt)
        if (!escalationResult.error) {
          finalResult = escalationResult
          escalated = true
        }
      }

      if (finalResult.error) continue

      const policy = applyPolicy(finalResult, input.explicitRequest)

      results.push({
        provider: strategy.id,
        exampleId: example.id,
        category: example.category,
        gtRel: example.labels.relationship,
        gtBuyer: example.labels.buyerRequest,
        gtNeedOwner: example.labels.needOwner,
        gtMsgEligible: example.labels.messageEligible,
        gtAction: example.labels.action,
        predRel: finalResult.relationship,
        predBuyerProb: finalResult.buyerRequestProbability,
        predNeedOwner: finalResult.needOwner,
        predMsgEligible: finalResult.messageEligible,
        predConfidence: finalResult.confidence,
        action: policy.action,
        messageEligible: policy.messageEligible,
        escalated,
        latencyMs: finalResult.latency,
      })
    }
  }

  return results
}

// ── Generate CSV ─────────────────────────────────────────────────────────────

function generateCSV(results) {
  const headers = [
    'example_id', 'category', 'provider',
    'gt_relationship', 'pred_relationship', 'rel_correct',
    'gt_buyer_request', 'pred_buyer_prob', 'buyer_correct',
    'gt_need_owner', 'pred_need_owner', 'need_owner_correct',
    'gt_msg_eligible', 'pred_msg_eligible', 'msg_eligible_correct',
    'gt_action', 'pred_action', 'action_correct',
    'escalated', 'confidence', 'latency_ms',
  ]

  const rows = results.map(r => [
    r.exampleId, r.category, r.provider,
    r.gtRel, r.predRel, r.predRel === r.gtRel ? 1 : 0,
    r.gtBuyer, r.predBuyerProb.toFixed(2),
    ((r.gtBuyer === 'EXPLICIT' || r.gtBuyer === 'STRONG') && r.predBuyerProb >= 0.4) ||
    (r.gtBuyer === 'NONE' && r.predBuyerProb < 0.25) ||
    (r.gtBuyer === 'WEAK' && r.predBuyerProb >= 0.15 && r.predBuyerProb < 0.6) ? 1 : 0,
    r.gtNeedOwner, r.predNeedOwner, r.predNeedOwner === r.gtNeedOwner ? 1 : 0,
    r.gtMsgEligible, r.messageEligible ? 'YES' : 'NO',
    (r.gtMsgEligible === 'YES' && r.messageEligible) ||
    (r.gtMsgEligible === 'NO' && !r.messageEligible) ||
    (r.gtMsgEligible === 'HUMAN_REVIEW') ? 1 : 0,
    r.gtAction, r.action, r.action === r.gtAction ? 1 : 0,
    r.escalated ? 1 : 0,
    r.predConfidence.toFixed(2), r.latencyMs,
  ])

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
}

// ── Generate Report ──────────────────────────────────────────────────────────

function generateReport(results) {
  const providers = [...new Set(results.map(r => r.provider))].sort()
  const lines = []

  lines.push('# V3 Multi-Model Cascade Benchmark')
  lines.push('')
  lines.push(`Generated: ${new Date().toISOString()}`)
  lines.push(`Dataset: ${FROZEN.length} frozen examples`)
  lines.push(`Models: gpt-4o-mini, gpt-4o, gpt-4.1`)
  lines.push(`Strategies: A (mini only), B (4o only), C (4.1 only), D (mini→4o), E (mini→4.1)`)
  lines.push('')

  for (const provider of providers) {
    const m = calculateMetrics(results, provider)
    if (!m) continue

    lines.push(`## ${provider}`)
    lines.push('')
    lines.push('| Metric | Value | Target | Status |')
    lines.push('|--------|-------|--------|--------|')

    const checks = [
      ['Buyer Precision', m.buyerPrecision, '>= 0.60', m.buyerPrecision >= 0.60],
      ['Buyer Recall', m.buyerRecall, '>= 0.90', m.buyerRecall >= 0.90],
      ['Buyer F1', m.buyerF1, '>= 0.75', m.buyerF1 >= 0.75],
      ['Relationship Macro-F1', m.relMacroF1, '>= 0.80', m.relMacroF1 >= 0.80],
      ['Need-Owner Accuracy', m.needOwnerAccuracy, '>= 0.60', m.needOwnerAccuracy >= 0.60],
      ['Explicit-Buyer FNR', m.explicitBuyerFNR, '<= 0.10', m.explicitBuyerFNR <= 0.10],
      ['SP False-Buyer (semantic)', m.spFalseBuyerRate, '<= 0.10', m.spFalseBuyerRate <= 0.10],
      ['SP False-Send (post-policy)', m.spFalseSendRate, '<= 0.05', m.spFalseSendRate <= 0.05],
      ['Msg-Eligibility Precision', m.msgEligibilityPrecision, '>= 0.90', m.msgEligibilityPrecision >= 0.90],
      ['Dangerous False-Send', m.dangerousFalseSendRate, '<= 0.02', m.dangerousFalseSendRate <= 0.02],
      ['Brier Score', m.brierScore, '<= 0.15', m.brierScore <= 0.15],
      ['ECE', m.ece, '<= 0.10', m.ece <= 0.10],
      ['p50 Latency (ms)', m.p50LatencyMs, '<= 1500', m.p50LatencyMs <= 1500],
      ['p95 Latency (ms)', m.p95LatencyMs, '<= 4000', m.p95LatencyMs <= 4000],
    ]

    if (m.escalationRate !== undefined) {
      checks.push(['Escalation Rate', m.escalationRate, '< 0.30', m.escalationRate < 0.30])
    }

    let pass = 0
    for (const [name, value, target, ok] of checks) {
      lines.push(`| ${name} | ${value} | ${target} | ${ok ? 'PASS' : 'FAIL'} |`)
      if (ok) pass++
    }

    lines.push('')
    lines.push(`**${pass}/${checks.length} criteria passed**`)
    lines.push('')
  }

  return lines.join('\n')
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Running V3 Multi-Model Cascade Benchmark...')
  console.log(`Dataset: ${FROZEN.length} examples × 5 strategies`)
  console.log('')

  const results = await runBenchmark()

  // Write CSV
  const csvPath = 'audit-reports/decision-v3/02_PROVIDER_BENCHMARK.csv'
  const { writeFileSync } = await import('node:fs')
  writeFileSync(csvPath, generateCSV(results), 'utf8')
  console.log(`CSV: ${csvPath}`)

  // Write report
  const reportPath = 'audit-reports/decision-v3/03_PROVIDER_BENCHMARK.md'
  writeFileSync(reportPath, generateReport(results), 'utf8')
  console.log(`Report: ${reportPath}`)
  console.log('')
  console.log(generateReport(results))
}

main().catch(console.error)
