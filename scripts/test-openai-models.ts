/**
 * OpenAI Model Availability Tester
 *
 * Tests which OpenAI models actually work with your key and measures latency.
 * Run with: npx tsx scripts/test-openai-models.ts
 *
 * Requires OPENAI_API_KEY in environment.
 */

const API_KEY = process.env.OPENAI_API_KEY
const BASE_URL = process.env.OPENAI_CHAT_BASE_URL || 'https://api.openai.com/v1'

if (!API_KEY) {
  console.error('ERROR: OPENAI_API_KEY is not set.')
  console.error('')
  console.error('To test, run with your key:')
  console.error('  OPENAI_API_KEY=sk-... npx tsx scripts/test-openai-models.ts')
  console.error('')
  console.error('Or add it to .env.local:')
  console.error('  OPENAI_API_KEY=sk-your-key-here')
  process.exit(1)
}

// Intelligence tier -> model mapping (must match model-router.ts)
const TIERS = {
  luna:  process.env.SCOUT_AI_LUNA_MODEL || 'gpt-4o-mini',
  terra: process.env.SCOUT_AI_TERRA_MODEL || 'gpt-4o',
  sol:   process.env.SCOUT_AI_SOL_MODEL || 'o1-preview',
}

async function testModel(tier: string, model: string): Promise<{
  tier: string
  model: string
  status: 'OK' | 'FAILED'
  latencyMs: number | null
  output: string | null
  error: string | null
}> {
  const t0 = Date.now()
  try {
    const response = await fetch(`${BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a precise classifier. Respond with JSON only.' },
          { role: 'user', content: 'Say hello in one word.' },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 50,
        temperature: 0.1,
      }),
    })

    const latencyMs = Date.now() - t0

    if (!response.ok) {
      const body = await response.text()
      return { tier, model, status: 'FAILED', latencyMs, output: null, error: `HTTP ${response.status}: ${body.slice(0, 200)}` }
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    return { tier, model, status: 'OK', latencyMs, output: content, error: null }
  } catch (err) {
    return { tier, model, status: 'FAILED', latencyMs: null, output: null, error: err instanceof Error ? err.message : String(err) }
  }
}

async function listAvailableModels(): Promise<string[]> {
  try {
    const response = await fetch(`${BASE_URL.replace(/\/$/, '')}/models`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    })
    if (!response.ok) return []
    const data = await response.json()
    return (data.data as Array<{ id: string }>).map((m) => m.id).sort()
  } catch {
    return []
  }
}

async function main() {
  console.log('OpenAI Model Tester')
  console.log('='.repeat(50))
  console.log(`Base URL: ${BASE_URL}`)
  console.log(`Key: ${API_KEY.slice(0, 8)}...${API_KEY.slice(-4)}`)
  console.log('')

  // List available models
  console.log('Fetching available models...')
  const available = await listAvailableModels()
  if (available.length > 0) {
    const relevant = available.filter((id) =>
      ['gpt-4o-mini', 'gpt-4o', 'gpt-4o-mini-2024-07-18', 'gpt-4', 'gpt-3.5', 'o1-preview', 'o1-mini', 'o1-'].some((prefix) => id.startsWith(prefix))
    )
    console.log(`Total models: ${available.length}`)
    console.log(`Relevant models:\n  ${relevant.join('\n  ')}`)
  } else {
    console.log('Could not list models (insufficient permissions or error)')
  }
  console.log('')

  // Test each tier
  console.log('Testing intelligence tiers:')
  console.log('-'.repeat(50))

  const results = []
  for (const [tier, model] of Object.entries(TIERS)) {
    process.stdout.write(`  ${tier} (${model}) ... `)
    const result = await testModel(tier, model)
    results.push(result)

    if (result.status === 'OK') {
      console.log(`OK  ${result.latencyMs}ms  output: ${JSON.stringify(result.output)?.slice(0, 60)}`)
    } else {
      console.log(`FAILED  ${result.error?.slice(0, 120)}`)
    }
  }

  console.log('')
  console.log('Summary:')
  console.log('-'.repeat(50))
  const working = results.filter((r) => r.status === 'OK')
  const failed = results.filter((r) => r.status === 'FAILED')

  console.log(`Working: ${working.length}/${results.length}`)
  for (const r of working) {
    console.log(`  ${r.tier} -> ${r.model} (${r.latencyMs}ms)`)
  }
  if (failed.length) {
    console.log(`Failed:`)
    for (const r of failed) {
      console.log(`  ${r.tier} -> ${r.model}: ${r.error}`)
    }
  }
  console.log('')
  console.log('Recommendation: Update SCOUT_AI_*_MODEL env vars to use working models.')
}

main().catch((err) => {
  console.error('Tester failed:', err)
  process.exit(1)
})
