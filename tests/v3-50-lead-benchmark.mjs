import { config } from 'dotenv'
config({ path: '.env.local' })

import { produceV3Intelligence } from '@/lib/intelligence-v3/bridge'
import { FROZEN_EVAL_SET } from '../scripts/decision-v3-research/frozen-eval-data.mjs'
import { writeFileSync } from 'node:fs'

// Take 50 leads: prioritize diverse categories, fill rest randomly
const priority = [
  // All explicit buyers (10)
  'buyer-001', 'buyer-002', 'buyer-003', 'buyer-004', 'buyer-005',
  'strong-001', 'strong-002', 'strong-003', 'strong-004', 'strong-005',
  // Multi-role / SP + buyer (4)
  'multi-001', 'multi-002', 'multi-003',
  'gap-001',
  // Service providers (7)
  'sp-001', 'sp-002', 'sp-003', 'sp-004', 'sp-005', 'sp-006', 'sp-007',
  // Competitors (2)
  'comp-001', 'comp-002',
  // Recruiters (4)
  'recruiter-001', 'recruiter-002', 'recruiter-003', 'rec-004',
  // Weak / latent (5)
  'weak-001', 'weak-002', 'weak-003', 'nonbuy-004', 'gap-004',
  // Freelance / project (3)
  'buyer-003', 'upwork-001', 'explicit_frealeance',
]

const seen = new Set()
const sample = []
for (const id of priority) {
  const ex = FROZEN_EVAL_SET.find(e => e.id === id)
  if (ex && !seen.has(ex.id)) {
    sample.push(ex)
    seen.add(ex.id)
  }
}

// Fill remaining from full set
for (const ex of FROZEN_EVAL_SET) {
  if (sample.length >= 50) break
  if (!seen.has(ex.id)) {
    sample.push(ex)
    seen.add(ex.id)
  }
}

console.log(`V3 GPT Benchmark: ${sample.length} leads`)
console.log(`Provider: GPT-4o-mini → GPT-4.1 cascade`)
console.log('')

const results = []
let totalLatency = 0
let totalCost = 0

for (let i = 0; i < sample.length; i++) {
  const ex = sample[i]
  const start = Date.now()

  try {
    const result = await produceV3Intelligence(ex.rawText, [])
    const latency = Date.now() - start
    totalLatency += latency

    const v3 = result.intelligence.v3DecisionPacket
    const gt = ex.labels

    // Correctness checks
    const buyerProb = v3?.decision?.buyerRequestProbability || 0
    const isBuyer = gt.buyerRequest === 'EXPLICIT' || gt.buyerRequest === 'STRONG'
    const buyerCorrect = isBuyer ? buyerProb > 0.4 : buyerProb < 0.4

    const msgEligible = v3?.messageEligible
    const gtMsg = gt.messageEligible === 'YES'
    const msgCorrect = gtMsg === msgEligible

    const isSP = gt.relationship === 'SERVICE_PROVIDER' || gt.relationship === 'COMPETITOR'
    const spCorrect = isSP ? buyerProb < 0.4 : true

    const resultObj = {
      id: ex.id,
      category: ex.category,
      gt_relationship: gt.relationship,
      gt_buyerRequest: gt.buyerRequest,
      gt_messageEligible: gt.messageEligible,
      v3_relationship: v3?.decision?.relationship,
      v3_buyerProb: buyerProb.toFixed(2),
      v3_score: v3?.score,
      v3_action: v3?.action,
      v3_messageEligible: msgEligible,
      v3_latentPotential: v3?.latentPotential || null,
      buyerCorrect,
      msgCorrect,
      spCorrect,
      latencyMs: latency,
    }
    results.push(resultObj)

    const status = `${buyerCorrect ? '✓' : '✗'}${msgCorrect ? '✓' : '✗'}${spCorrect ? '✓' : '✗'}`
    console.log(`${i + 1}. ${ex.id} (${ex.category.slice(0, 20)}): ${status} score=${v3?.score} action=${v3?.action} ${latency}ms`)
  } catch (err) {
    console.log(`${i + 1}. ${ex.id}: FAILED - ${err.message}`)
    results.push({ id: ex.id, category: ex.category, error: err.message })
  }
}

// Compute metrics
const valid = results.filter(r => !r.error)
const buyerAcc = valid.filter(r => r.buyerCorrect).length / valid.length
const msgAcc = valid.filter(r => r.msgCorrect).length / valid.length
const spSafe = valid.filter(r => r.spCorrect).length / valid.length
const avgLatency = Math.round(totalLatency / valid.length)

// Relationship accuracy
const relCorrect = valid.filter(r => {
  if (r.gt_relationship === 'MIXED') return ['BUYER', 'SERVICE_PROVIDER'].includes(r.v3_relationship)
  return r.v3_relationship === r.gt_relationship
}).length / valid.length

// Buyer F1
const tp = valid.filter(r => r.v3_buyerProb > 0.4 && (r.gt_buyerRequest === 'EXPLICIT' || r.gt_buyerRequest === 'STRONG')).length
const fp = valid.filter(r => r.v3_buyerProb > 0.4 && r.gt_buyerRequest === 'NONE').length
const fn = valid.filter(r => r.v3_buyerProb <= 0.4 && (r.gt_buyerRequest === 'EXPLICIT' || r.gt_buyerRequest === 'STRONG')).length
const buyerPrecision = tp / (tp + fp) || 0
const buyerRecall = tp / (tp + fn) || 0
const buyerF1 = (buyerPrecision + buyerRecall) > 0 ? 2 * buyerPrecision * buyerRecall / (buyerPrecision + buyerRecall) : 0

// Category breakdown
const cats = {}
for (const r of valid) {
  if (!cats[r.category]) cats[r.category] = { total: 0, buyerOk: 0, msgOk: 0, spOk: 0 }
  cats[r.category].total++
  if (r.buyerCorrect) cats[r.category].buyerOk++
  if (r.msgCorrect) cats[r.category].msgOk++
  if (r.spCorrect) cats[r.category].spOk++
}

console.log('')
console.log('========================================')
console.log('V3 GPT BENCHMARK RESULTS (50 leads)')
console.log('========================================')
console.log('')
console.log(`Buyer detection accuracy: ${(buyerAcc * 100).toFixed(0)}%`)
console.log(`Buyer precision: ${(buyerPrecision * 100).toFixed(0)}%`)
console.log(`Buyer recall: ${(buyerRecall * 100).toFixed(0)}%`)
console.log(`Buyer F1: ${buyerF1.toFixed(2)}`)
console.log(`Message eligibility accuracy: ${(msgAcc * 100).toFixed(0)}%`)
console.log(`Relationship accuracy: ${(relCorrect * 100).toFixed(0)}%`)
console.log(`SP safety: ${(spSafe * 100).toFixed(0)}%`)
console.log(`Avg latency: ${avgLatency}ms`)
console.log('')
console.log('Category breakdown:')
for (const [cat, data] of Object.entries(cats).sort((a, b) => b[1].total - a[1].total)) {
  console.log(`  ${cat}: ${data.total} leads, buyer=${(data.buyerOk / data.total * 100).toFixed(0)}%, msg=${(data.msgOk / data.total * 100).toFixed(0)}%`)
}

// Save CSV
const csv = [
  'id,category,gt_relationship,gt_buyerRequest,gt_messageEligible,v3_relationship,v3_buyerProb,v3_score,v3_action,v3_messageEligible,buyerCorrect,msgCorrect,spCorrect,latencyMs',
  ...valid.map(r => `${r.id},${r.category},${r.gt_relationship},${r.gt_buyerRequest},${r.gt_messageEligible},${r.v3_relationship},${r.v3_buyerProb},${r.v3_score},${r.v3_action},${r.v3_messageEligible},${r.buyerCorrect},${r.msgCorrect},${r.spCorrect},${r.latencyMs}`),
].join('\n')

writeFileSync('audit-reports/decision-v3/02_PROVIDER_BENCHMARK.csv', csv)
console.log('')
console.log('CSV saved: audit-reports/decision-v3/02_PROVIDER_BENCHMARK.csv')
