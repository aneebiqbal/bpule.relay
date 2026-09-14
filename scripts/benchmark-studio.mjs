/**
 * Studio Writing Benchmark — run against deployed environment.
 *
 * Usage:
 *   ENDPOINT=https://your-deployment.vercel.app API_KEY=... node scripts/benchmark-studio.mjs
 *
 * Outputs JSON results to stdout and a summary to stderr.
 */

const ENDPOINT = process.env.ENDPOINT || 'http://localhost:3000'
const PERSONAS = [
  { name: 'Sarah', role: 'Senior Full-Stack Engineer', expertise: ['Rails', 'React', 'System Architecture'], topics: ['Rails performance', 'Technical decisions', 'System design', 'Client delivery', 'AI development'] },
  { name: 'Marcus', role: 'DevOps Engineer', expertise: ['CI/CD', 'Kubernetes', 'Infrastructure'], topics: ['Build optimization', 'Deploy reliability', 'Infrastructure decisions', 'Cost reduction', 'Incident response'] },
  { name: 'Priya', role: 'ML Engineer', expertise: ['LLM Evaluation', 'RAG', 'Inference'], topics: ['Hallucination reduction', 'Retrieval quality', 'Eval framework', 'Model selection', 'Production ML'] },
  { name: 'Jake', role: 'Founder', expertise: ['Company Building', 'Product Strategy'], topics: ['Hiring lessons', 'Product decisions', 'Fundraising insights', 'Team building', 'Market timing'] },
  { name: 'Aisha', role: 'Product Designer', expertise: ['Design Systems', 'UX Strategy'], topics: ['Design system adoption', 'Accessibility', 'User research', 'Cross-functional collaboration', 'Design decisions'] },
  { name: 'David', role: 'Engineering Manager', expertise: ['Engineering Leadership', 'Hiring'], topics: ['IC to manager transition', 'Team performance', 'Hiring strategy', 'Technical culture', 'Delegation'] },
  { name: 'Elena', role: 'BD Professional', expertise: ['Sales Strategy', 'Outreach'], topics: ['Outbound strategy', 'Client relationships', 'Market positioning', 'Deal pipeline', 'Personal branding'] },
  { name: 'Frank', role: 'Consultant', expertise: ['Technical Advisory', 'Transformation'], topics: ['Client delivery', 'Technical assessment', 'Team enablement', 'Architecture review', 'Change management'] },
]

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  fabricated: 0,
  wouldPost: 0,
  needsLightEdit: 0,
  wouldNotPost: 0,
  retries: { longcat: 0, groq: 0, gpt: 0 },
  latency: [],
  posts: [],
}

function log(msg) {
  process.stderr.write(msg + '\n')
}

async function generatePost(persona, topic) {
  const start = Date.now()
  try {
    const res = await fetch(`${ENDPOINT}/api/content/generate-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personaId: persona.id,
        idea: {
          title: `Your take on ${topic}`,
          angle: `Share a specific insight or lesson about ${topic} from your experience`,
          territory: 'authority',
          sourceKind: 'expertise',
          whyYou: `You have expertise in ${persona.expertise.join(', ')}`,
          whyAudience: 'Practical insight from direct experience',
        },
        platform: 'linkedin',
      }),
    })
    const data = await res.json()
    const latency = Date.now() - start
    return { ...data, latency }
  } catch (err) {
    return { error: err.message, latency: Date.now() - start }
  }
}

function classifyPost(caption, retryStats) {
  // Automated classification heuristics
  const classification = { category: 'NEEDS_REVIEW', fabricated: false, reasons: [] }

  // Check for fabrication signals
  const fabricationPatterns = [
    /\b(the devs handed me|a colleague told me|my team said|during a meeting)\b/i,
    /\b(yesterday|today|this morning)\b.{0,30}\b(i|we)\s+(spent|debugged|shipped)\b/i,
  ]
  if (fabricationPatterns.some((p) => p.test(caption))) {
    classification.fabricated = true
    classification.reasons.push('FABRICATED')
    results.fabricated++
  }

  // Check substance signals
  const substanceSignals = [
    /\b(because|cause|reason|happens when|results in)\b/i,
    /\b(but|however|actually|the difference|unlike)\b/i,
    /\b(for example|for instance|specifically|in practice)\b/i,
    /\b(rule|principle|heuristic|pattern|approach)\b/i,
    /\b(tradeoff|cost|benefit|versus|consequence)\b/i,
    /\b(i'?ve seen|i'?ve noticed|the data shows|experience suggests)\b/i,
  ]
  const substanceScore = substanceSignals.filter((p) => p.test(caption)).length

  if (substanceScore >= 2 && !classification.fabricated) {
    classification.category = 'WOULD_POST'
    results.wouldPost++
  } else if (substanceScore >= 1 && !classification.fabricated) {
    classification.category = 'NEEDS_LIGHT_EDIT'
    results.needsLightEdit++
  } else if (!classification.fabricated) {
    classification.category = 'WOULD_NOT_POST'
    results.wouldNotPost++
  }

  return classification
}

async function main() {
  log('=== Studio Writing Benchmark ===')
  log(`Endpoint: ${ENDPOINT}`)
  log(`Personas: ${PERSONAS.length}`)
  log('')

  // Note: In production, you'd first create personas and get their IDs
  // This assumes personas are already created via onboarding
  log('NOTE: This script requires pre-created personas with valid IDs.')
  log('Run the browser onboarding flow first to create test personas.')
  log('')
  log('For each persona, the script will:')
  log('1. Generate 5 posts via /api/content/generate-draft')
  log('2. Measure latency')
  log('3. Classify output quality')
  log('4. Track retry behavior (LongCat/Groq/GPT)')
  log('')

  // If persona IDs are provided via env, run the benchmark
  const personaIds = process.env.PERSONA_IDS?.split(',') || []

  if (personaIds.length === 0) {
    log('No PERSONA_IDS provided. Skipping live generation.')
    log('')
    log('To run the benchmark:')
    log('1. Create personas via browser onboarding')
    log('2. Get persona IDs from the database')
    log('3. Run: PERSONA_IDS=id1,id2,... ENDPOINT=... node scripts/benchmark-studio.mjs')
    log('')
    log(JSON.stringify({ status: 'skipped', reason: 'no_persona_ids', personas: PERSONAS }, null, 2))
    return
  }

  for (let i = 0; i < personaIds.length; i++) {
    const personaId = personaIds[i]
    const persona = PERSONAS[i] || { name: `Persona-${i}`, expertise: [], topics: [`topic-${i}`] }
    log(`\n--- ${persona.name} (${persona.role}) ---`)

    const topics = persona.topics.slice(0, 5)
    for (const topic of topics) {
      results.total++
      log(`  Generating: "${topic}"...`)

      const result = await generatePost({ ...persona, id: personaId }, topic)
      results.latency.push(result.latency)

      if (result.retryStats?.groqRetry) results.retries.groq++
      if (result.retryStats?.gptEscalation) results.retries.gpt++
      if (!result.retryStats?.longcatFirstPass) results.retries.longcat++

      if (result.error) {
        log(`    ERROR: ${result.error}`)
        results.failed++
        results.posts.push({ persona: persona.name, topic, error: result.error, latency: result.latency })
        continue
      }

      results.passed++
      const classification = classifyPost(result.caption, result.retryStats)
      results.posts.push({
        persona: persona.name,
        topic,
        category: classification.category,
        latency: result.latency,
        captionPreview: result.caption?.slice(0, 80),
        retryMethod: result.retryStats?.gptEscalation ? 'gpt' : result.retryStats?.groqRetry ? 'groq' : 'longcat',
      })

      log(`    ${classification.category} (${result.latency}ms) [${classification.fabricated ? 'FABRICATED' : 'OK'}]`)
    }
  }

  // Summary
  const avgLatency = results.latency.reduce((a, b) => a + b, 0) / Math.max(results.latency.length, 1)
  const wouldPostRate = results.wouldPost / Math.max(results.total, 1)
  const wouldPostPlusEdit = (results.wouldPost + results.needsLightEdit) / Math.max(results.total, 1)

  log('\n=== Benchmark Summary ===')
  log(`Total generations: ${results.total}`)
  log(`Successful: ${results.passed}`)
  log(`Failed: ${results.failed}`)
  log(`Fabricated: ${results.fabricated}`)
  log(`Would Post: ${results.wouldPost} (${(wouldPostRate * 100).toFixed(1)}%)`)
  log(`Needs Light Edit: ${results.needsLightEdit}`)
  log(`Would Not Post: ${results.wouldNotPost}`)
  log(`Would Post + Light Edit: ${(wouldPostPlusEdit * 100).toFixed(1)}%`)
  log(`Average latency: ${avgLatency.toFixed(0)}ms`)
  log(`Retries — LongCat: ${results.retries.longcat}, Groq: ${results.retries.groq}, GPT: ${results.retries.gpt}`)
  log('')
  log(`Release gate: wouldPostPlusEdit >= 0.85: ${wouldPostPlusEdit >= 0.85 ? 'PASS' : 'FAIL'}`)
  log(`Release gate: fabricated === 0: ${results.fabricated === 0 ? 'PASS' : 'FAIL'}`)

  // Output full results as JSON
  console.log(JSON.stringify({
    summary: {
      total: results.total,
      passed: results.passed,
      failed: results.failed,
      fabricated: results.fabricated,
      wouldPostRate,
      wouldPostPlusEditRate: wouldPostPlusEdit,
      avgLatency,
      retryBreakdown: results.retries,
    },
    gateResults: {
      wouldPostPlusEditAbove85: wouldPostPlusEdit >= 0.85,
      zeroFabrication: results.fabricated === 0,
    },
    posts: results.posts,
  }, null, 2))
}

main().catch((err) => {
  console.error('Benchmark failed:', err)
  process.exit(1)
})
