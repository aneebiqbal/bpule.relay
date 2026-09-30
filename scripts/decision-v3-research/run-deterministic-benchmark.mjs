/**
 * Run Deterministic Fallback Benchmark
 * 
 * Executes the frozen eval set through the deterministic fallback
 * decision provider and outputs CSV results.
 * 
 * Run: node scripts/decision-v3-research/run-deterministic-benchmark.mjs
 */

import { FROZEN_EVAL_SET, evalSetStats } from './frozen-eval-set.ts'
import { 
  deterministicDecision, 
  checkCorrectness, 
  computeMetrics,
  type BenchmarkResult 
} from './benchmark-runner.ts'

// Run benchmark
const results = []
for (const example of FROZEN_EVAL_SET) {
  const decision = deterministicDecision(example)
  const correct = checkCorrectness(decision, example.labels)
  
  results.push({
    exampleId: example.id,
    category: example.category,
    providerId: decision.providerId,
    decision,
    labels: example.labels,
    correct,
  })
}

// Compute metrics
const metrics = computeMetrics(results, 'deterministic_fallback')

// Output stats
console.log('=== Frozen Eval Set Stats ===')
console.log(JSON.stringify(evalSetStats(), null, 2))

console.log('\n=== Deterministic Fallback Metrics ===')
console.log(JSON.stringify(metrics, null, 2))

// Output CSV header
console.log('\n=== Benchmark CSV ===')
console.log('example_id,category,provider,relationship_pred,relationship_actual,correct,buyer_prob,buyer_label,need_owner_pred,need_owner_actual,message_eligible_pred,message_eligible_actual,action_pred,action_actual')

for (const r of results) {
  const actionMap = (prob, access) => {
    if (prob >= 0.7) return 'CONTACT_NOW'
    if (prob >= 0.6) return 'CONNECT_WITH_NOTE'
    if (prob >= 0.4) return 'CONNECT_WITHOUT_NOTE'
    if (prob >= 0.2) return 'OBSERVE'
    return 'SKIP'
  }
  
  console.log([
    r.exampleId,
    r.category,
    r.providerId,
    r.decision.relationship,
    r.labels.relationship,
    r.correct.relationship ? 1 : 0,
    r.decision.buyerRequestProbability,
    r.labels.buyerRequest,
    r.decision.needOwner,
    r.labels.needOwnership,
    r.decision.messageEligible.toFixed(2),
    r.labels.messageEligible,
    actionMap(r.decision.buyerRequestProbability, r.decision.access),
    r.labels.action,
  ].join(','))
}
