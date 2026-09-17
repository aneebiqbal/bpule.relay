/**
 * Relay Model Tournament — Benchmark harness for all providers/models.
 *
 * Tests extraction, writing, and classification across all configured providers.
 * Reports: p50, p95, max, success, schema validity, quality.
 *
 * Usage: node scripts/model-tournament.mjs [--task=all] [--runs=5] [--fixtures=real]
 */

/**
 * Relay Model Tournament — Benchmark harness for all providers/models.
 *
 * Tests extraction, writing, and classification across all configured providers.
 * Reports: p50, p95, max, success, schema validity, quality.
 *
 * Usage: node scripts/model-tournament.mjs [--task=all] [--runs=5]
 */

// ── Inlined from src/lib/ai/runtime/normalize.ts (avoids .mjs/.ts import issues) ──

function normalizeJson(raw) {
  let text = raw.trim()
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '')
  }
  try {
    const parsed = JSON.parse(text)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed
  } catch {}
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1)
    try {
      const parsed = JSON.parse(candidate)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed
    } catch {}
  }
  throw new Error('Unable to normalize JSON output')
}

function coerceNullStrings(obj) {
  const result = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value === 'null' || value === 'NULL' || value === 'None' || value === '') {
      result[key] = null
    } else if (Array.isArray(value)) {
      result[key] = value.map(v => (v === 'null' || v === 'NULL' || v === 'None' || v === '') ? null : v)
    } else if (typeof value === 'object' && value !== null) {
      result[key] = coerceNullStrings(value)
    } else {
      result[key] = value
    }
  }
  return result
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const EXTRACTION_FIXTURES = [
  { name: 'linkedin_profile_1', text: `Sarah Chen\nCEO & Co-Founder at NovaTech AI\nSan Francisco, California\n\nBuilding AI-powered dev tools. Closed $12M Series A led by Sequoia. Hiring 5 more engineers. Remote-first.\nSkills: TypeScript, Python, React, Node.js, ML\nhttps://www.linkedin.com/in/sarahchen\nhttps://novatech.ai` },
  { name: 'linkedin_profile_2', text: `Marcus Rodriguez\nVP of Engineering at CloudSync\nNew York, NY\n\nCloudSync is a B2B SaaS platform for enterprise data integration. Rebuilding our real-time pipeline and looking for senior backend engineers who know Rust and Postgres.\nHiring: Senior Backend Engineer, Staff Engineer. Remote within US/EU timezones. $45M Series B closed Q2 2025.\nhttps://www.linkedin.com/in/marcusrod` },
  { name: 'job_post_upwork', text: `Job: Full-Stack Developer for AI Dashboard (React + Python)\nBudget: $5,000 - $8,000\nProposals: 12\n\nDescription:\nWe need an experienced full-stack developer to build an AI analytics dashboard. Must have:\n- React/Next.js frontend experience\n- Python FastAPI backend\n- PostgreSQL database design\n- Experience with OpenAI API integration\n\nClient: DataViz AI (dataviz.ai)\nTech stack: Next.js, Python, PostgreSQL, OpenAI, AWS\nPosted: 2 days ago` },
  { name: 'linkedin_post_signal', text: `David Kim\nCTO at LaunchPad.io\nAustin, TX · 2,300+ connections\n\nJust shipped our new multi-tenant SaaS platform after 8 months of development. Stack: Next.js, TypeScript, PostgreSQL with RLS, Supabase Auth, Stripe payments.\n\nLooking for a senior frontend engineer who can help us scale. Must know React deeply. Remote OK but Austin-based preferred. DM me if interested.\n\n#hiring #react #saas #startup` },
  { name: 'pasted_client_brief', text: `Client: GreenLeaf Supplements\nContact: Jennifer Walsh, Founder & CEO\nCompany: GreenLeaf Supplements (greensupplements.com)\nLocation: Austin, TX (remote-friendly)\n\nWe need help building our e-commerce platform. Currently on Shopify but hitting limits.\n\nRequirements:\n- Custom headless commerce frontend (Next.js or Remix)\n- Subscription billing integration (Stripe)\n- Inventory management system\n- HIPAA compliance for supplement recommendations\n- SEO optimization\n\nBudget: $15,000 - $25,000\nTimeline: 3 months to MVP` },
]

const WRITING_FIXTURES = [
  { name: 'connection_sarah', prospect: { name: 'Sarah Chen', title: 'CEO & Co-Founder', company: 'NovaTech AI', signal: 'Hiring 5 engineers after $12M Series A', technicalSignals: ['TypeScript', 'Python', 'React', 'ML'] } },
  { name: 'connection_marcus', prospect: { name: 'Marcus Rodriguez', title: 'VP of Engineering', company: 'CloudSync', signal: 'Rebuilding real-time pipeline, hiring backend engineers', technicalSignals: ['Rust', 'Postgres'] } },
  { name: 'dm_david', prospect: { name: 'David Kim', title: 'CTO', company: 'LaunchPad.io', signal: 'Shipped multi-tenant SaaS, hiring frontend engineer', technicalSignals: ['Next.js', 'TypeScript', 'PostgreSQL'] } },
]

// ── Provider Configs ─────────────────────────────────────────────────────────

function getProviders() {
  const providers = []

  // Groq
  if (process.env.GROQ_API_KEY) {
    providers.push({ id: 'groq-120b', provider: 'groq', model: 'openai/gpt-oss-120b', baseUrl: 'https://api.groq.com/openai/v1', key: process.env.GROQ_API_KEY })
  }
  if (process.env.GROQ_API_KEY && process.env.GROQ_ENABLE_KEY_2 === '1') {
    providers.push({ id: 'groq-120b-2', provider: 'groq', model: 'openai/gpt-oss-120b', baseUrl: 'https://api.groq.com/openai/v1', key: process.env.GROQ_API_KEY_2 })
  }

  // OpenCode Go models
  if (process.env.OPENCODE_API_KEY) {
    const models = process.env.OPENCODE_TOURNAMENT_MODELS
      ? process.env.OPENCODE_TOURNAMENT_MODELS.split(',')
      : ['deepseek-flash', 'qwen-flash', 'minimax-flash', 'glm-flash']
    for (const modelId of models) {
      providers.push({
        id: `opencode-${modelId}`,
        provider: 'opencode',
        model: modelId,
        baseUrl: process.env.OPENCODE_BASE_URL || 'https://api.opencode.ai/v1',
        key: process.env.OPENCODE_API_KEY,
      })
    }
  }

  // OpenAI
  if (process.env.OPENAI_API_KEY) {
    providers.push({ id: 'gpt-4o-mini', provider: 'openai', model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1', key: process.env.OPENAI_API_KEY })
  }

  // LongCat (background only)
  if (process.env.LONGCAT_API_KEY) {
    providers.push({ id: 'longcat', provider: 'longcat', model: 'LongCat-2.0', baseUrl: 'https://api.longcat.chat/openai/v1', key: process.env.LONGCAT_API_KEY })
  }

  return providers
}

// ── Benchmark Functions ───────────────────────────────────────────────────────

async function benchmarkExtraction(provider, fixture, timeoutMs = 15000) {
  const system = `You are a precise factual extraction engine. Extract ONLY what is explicitly stated in the text. Return a single JSON object with: person {fullName, firstName, title, seniority, location, linkedinUrl, otherUrls}, company {name, domain, linkedinUrl, industry, size, stage}, opportunity {signals, primarySignal, description, urgency}, content {topics, technicalSignals, hiringSignals}`
  const user = `Extract factual entities from this text:\n\n${fixture.text}`

  return callProvider(provider, system, user, 'json_object', timeoutMs)
}

async function benchmarkWriting(provider, fixture, timeoutMs = 20000) {
  const system = `You write short, natural LinkedIn connection notes. Max 300 characters. No pitch. No praise. No em dashes. No emojis. Sound like one professional reaching out to another. Reference something specific from their profile.`
  const user = `Write a connection note for:\nName: ${fixture.prospect.name}\nTitle: ${fixture.prospect.title}\nCompany: ${fixture.prospect.company}\nSignal: ${fixture.prospect.signal}\nTech: ${fixture.prospect.technicalSignals.join(', ')}`

  return callProvider(provider, system, user, 'text', timeoutMs)
}

async function callProvider(provider, system, user, mode, timeoutMs) {
  const url = provider.baseUrl.replace(/\$/, '') + '/chat/completions'
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  const t0 = Date.now()
  let ttfb = null

  try {
    const body = {
      model: provider.model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: mode === 'json_object' ? 1024 : 512,
      temperature: mode === 'json_object' ? 0.1 : 0.7,
    }
    if (mode === 'json_object') {
      body.response_format = { type: 'json_object' }
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${provider.key}` },
      body: JSON.stringify(body),
      signal: ac.signal,
    })

    ttfb = Date.now() - t0
    const json = await resp.json().catch(() => null)
    const latency = Date.now() - t0
    clearTimeout(timer)

    if (!resp.ok) {
      // Add delay after rate limit
      if (resp.status === 429) {
        await new Promise(r => setTimeout(r, 2000))
      }
      return { provider: provider.id, model: provider.model, status: resp.status, ttfbMs: ttfb, latencyMs: latency, outputTokens: json?.usage?.completion_tokens || 0, success: false, error: `HTTP ${resp.status}`, schemaValid: false, quality: 'BAD', output: null }
    }

    const content = json?.choices?.[0]?.message?.content
    const outputTokens = json?.usage?.completion_tokens || 0

    if (!content) {
      return { provider: provider.id, model: provider.model, status: 200, ttfbMs: ttfb, latencyMs: latency, outputTokens, success: false, error: 'empty_content', schemaValid: false, quality: 'BAD', output: null }
    }

    if (mode === 'json_object') {
      try {
        const parsed = normalizeJson(content)
        const coerced = coerceNullStrings(parsed)
        const schemaValid = !!coerced.person || !!coerced.company
        const quality = assessExtractionQuality(coerced, fixture.text)
        return { provider: provider.id, model: provider.model, status: 200, ttfbMs: ttfb, latencyMs: latency, outputTokens, success: true, error: null, schemaValid, quality, output: coerced }
      } catch (e) {
        return { provider: provider.id, model: provider.model, status: 200, ttfbMs: ttfb, latencyMs: latency, outputTokens, success: true, error: 'parse_error', schemaValid: false, quality: 'BAD', output: content.slice(0, 200) }
      }
    } else {
      // Text mode
      const quality = assessWritingQuality(content, fixture.prospect)
      return { provider: provider.id, model: provider.model, status: 200, ttfbMs: ttfb, latencyMs: latency, outputTokens, success: true, error: null, schemaValid: true, quality, output: content }
    }
  } catch (err) {
    clearTimeout(timer)
    return { provider: provider.id, model: provider.model, status: 'ERROR', ttfbMs: null, latencyMs: Date.now() - t0, outputTokens: 0, success: false, error: err.message.slice(0, 60), schemaValid: false, quality: 'BAD', output: null }
  }
}

// ── Quality Assessment ────────────────────────────────────────────────────────

function assessExtractionQuality(parsed, inputText) {
  let score = 0
  let max = 0
  const issues = []

  max += 2; if (parsed.person?.fullName) score += 2
  max += 2; if (parsed.company?.name) score += 2
  max += 2; if (parsed.person?.title) score += 2
  max += 1; if (parsed.opportunity?.signals?.length > 0) score += 1

  const urls = inputText.match(/https?:\/\/[^\s]+/g) || []
  if (urls.length > 0) {
    max += 1
    const preserved = urls.some(u =>
      parsed.person?.linkedinUrl?.includes(u) ||
      parsed.person?.otherUrls?.some(ou => ou.includes(u))
    )
    if (preserved || parsed.person?.linkedinUrl) score += 1
    else issues.push('urls_lost')
  }

  const pct = max > 0 ? (score / max) * 100 : 0
  if (pct >= 80) return 'GOOD'
  if (pct >= 50) return 'LIGHT_EDIT'
  return 'BAD'
}

function assessWritingQuality(text, prospect) {
  if (!text || text.length < 20) return 'BAD'
  if (text.length > 400) return 'LIGHT_EDIT'

  const issues = []
  if (text.includes('—') || text.includes('–')) issues.push('em_dash')
  if (/!/.test(text)) issues.push('exclamation')
  if (/amazing|incredible|impressed by|congratulations/i.test(text)) issues.push('praise')
  if (/I can help|we can help|our team|let me know if/i.test(text)) issues.push('pitch')
  if (!text.toLowerCase().includes(prospect.company.toLowerCase()) && !text.toLowerCase().includes(prospect.name.toLowerCase())) {
    // Not necessarily bad, but less personalized
  }

  if (issues.length === 0) return 'GOOD'
  if (issues.length <= 2) return 'LIGHT_EDIT'
  return 'BAD'
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const taskFilter = args.find(a => a.startsWith('--task='))?.split('=')[1] || 'all'
  const runs = parseInt(args.find(a => a.startsWith('--runs='))?.split('=')[1] || '3')

  const providers = getProviders()
  if (providers.length === 0) {
    console.error('No providers configured. Set GROQ_API_KEY, OPENCODE_API_KEY, OPENAI_API_KEY, or LONGCAT_API_KEY.')
    process.exit(1)
  }

  console.log('═'.repeat(70))
  console.log('RELAY MODEL TOURNAMENT')
  console.log('═'.repeat(70))
  console.log(`Providers: ${providers.map(p => `${p.id}(${p.model})`).join(', ')}`)
  console.log(`Runs per fixture: ${runs}`)
  console.log('')

  const allResults = []

  // ── Extraction Benchmark ────────────────────────────────────────────────
  if (taskFilter === 'all' || taskFilter === 'extraction') {
    console.log('━'.repeat(50))
    console.log('EXTRACTION BENCHMARK')
    console.log('━'.repeat(50))

    for (const provider of providers.filter(p => p.id !== 'longcat')) {
      for (const fixture of EXTRACTION_FIXTURES) {
        for (let i = 0; i < runs; i++) {
          const result = await benchmarkExtraction(provider, fixture)
          result.task = 'extraction'
          result.fixture = fixture.name
          allResults.push(result)
          await new Promise(r => setTimeout(r, 500))
        }
      }
    }

    printResults(allResults.filter(r => r.task === 'extraction'))
  }

  // ── Writing Benchmark ───────────────────────────────────────────────────
  if (taskFilter === 'all' || taskFilter === 'writing') {
    console.log('\n' + '━'.repeat(50))
    console.log('WRITING BENCHMARK')
    console.log('━'.repeat(50))

    for (const provider of providers.filter(p => p.id !== 'longcat')) {
      for (const fixture of WRITING_FIXTURES) {
        for (let i = 0; i < runs; i++) {
          const result = await benchmarkWriting(provider, fixture)
          result.task = 'writing'
          result.fixture = fixture.name
          allResults.push(result)
          await new Promise(r => setTimeout(r, 500))
        }
      }
    }

    printResults(allResults.filter(r => r.task === 'writing'))
  }
}

function printResults(results) {
  // Group by provider (sorted alphabetically for consistent ordering)
  const byProvider = {}
  for (const r of results) {
    if (!byProvider[r.provider]) byProvider[r.provider] = []
    byProvider[r.provider].push(r)
  }
  const sortedProviders = Object.keys(byProvider).sort()

  console.log(`\n${'Provider'.padEnd(20)} ${'p50'.padStart(7)} ${'p95'.padStart(7)} ${'max'.padStart(7)} ${'Success'.padStart(8)} ${'Schema'.padStart(7)} ${'Quality'.padStart(10)}`)
  console.log('─'.repeat(70))

  for (const provider of sortedProviders) {
    const rows = byProvider[provider]
    const ok = rows.filter(r => r.success)
    const lats = ok.map(r => r.latencyMs).sort((a, b) => a - b)
    const schema = ok.filter(r => r.schemaValid).length
    const quality = ok.filter(r => r.quality === 'GOOD').length

    const p50 = lats.length > 0 ? `${Math.round(lats[Math.floor(lats.length / 2)] / 10) / 100}s` : 'N/A'
    const p95 = lats.length > 0 ? `${Math.round((lats[Math.floor(lats.length * 0.95)] || lats[lats.length - 1]) / 10) / 100}s` : 'N/A'
    const max = lats.length > 0 ? `${Math.round(lats[lats.length - 1] / 10) / 100}s` : 'N/A'

    console.log(
      `${provider.padEnd(20)} ${p50.padStart(7)} ${p95.padStart(7)} ${max.padStart(7)} ${`${ok.length}/${rows.length}`.padStart(8)} ${`${schema}/${ok.length}`.padStart(7)} ${`${quality}/${ok.length} GOOD`.padStart(10)}`,
    )
  }
}

main().catch(console.error)
