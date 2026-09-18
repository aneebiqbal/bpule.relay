/**
 * Production-path simulation benchmark.
 * Tests the actual routing chain: Groq 120b → GPT for extraction.
 * Uses the same chain building as production code.
 */

// Simulate the buildFastStructuredChain() routing
const PROVIDERS = [
  { id: 'groq_120b', base: 'https://api.groq.com/openai/v1', key: process.env.GROQ_API_KEY, model: 'openai/gpt-oss-120b', timeout: 8000 },
  { id: 'gpt', base: 'https://api.openai.com/v1', key: process.env.OPENAI_API_KEY, model: 'gpt-4o-mini', timeout: 12000 },
]

const SYSTEM = `You are a precise factual extraction engine. Extract ONLY what is explicitly stated in the text. Return a single JSON object.

CRITICAL RULES:
- Never invent missing facts. Use null for unknown fields.
- Never replace a source URL with an inferred URL.
- Distinguish between FACT (explicitly stated) and INFERENCE (your conclusion).
- Every extracted fact must have evidence from the text.
- Keep all values concise and factual.
- COMPANY LOCATION ≠ WORKER LOCATION.
- "Remote OK", "Remote-friendly", "work from anywhere" = REMOTE.
- COMPANY NAME: If the title contains "at CompanyName" or "of CompanyName", extract it as the company name.

Extract these entities:
1. PERSON: fullName, firstName, title, seniority, location, linkedinUrl, otherUrls
2. COMPANY: name, domain, linkedinUrl, industry, size (+ evidence), product, stage (+ evidence)
3. OPPORTUNITY: signals (hiring, freelance_project_need, technical_problem, growth_signal, funding, launch, migration, rebuild, hiring_pressure, explicit_ask), primarySignal, description, urgency
4. JOB (if present): title, employmentType, workplaceType, allowedGeography, timezone, compensation, skills, seniority, source, postedDate
5. CONTENT: recentPosts (paraphrase, verbatimQuote, topics, signals), topics, explicitProblems, initiatives, launches, technicalSignals, hiringSignals`

const INPUTS = [
  { name: 'profile_sarah', text: `Sarah Chen
CEO & Co-Founder at NovaTech AI
San Francisco, California

Building AI-powered dev tools. Closed $12M Series A led by Sequoia. Hiring 5 more engineers. Remote-first.
Skills: TypeScript, Python, React, Node.js, ML
https://www.linkedin.com/in/sarahchen
https://novatech.ai` },
  { name: 'job_upwork', text: `Job: Full-Stack Developer for AI Dashboard
Budget: $5,000 - $8,000
Need experienced full-stack developer. React/Next.js frontend, Python FastAPI backend, PostgreSQL, OpenAI API. YC-backed startup. Remote, PST timezone.
Client: DataViz AI (dataviz.ai)` },
  { name: 'brief_greenleaf', text: `Client: GreenLeaf Supplements
Contact: Jennifer Walsh, Founder & CEO
Austin, TX (remote-friendly)
Building e-commerce platform. Next.js frontend, Stripe subscriptions, HIPAA compliance.
Budget: $15,000 - $25,000. Timeline: 3 months.` },
  { name: 'linkedin_post', text: `David Kim, CTO at LaunchPad.io, Austin, TX
Just shipped our new multi-tenant SaaS platform after 8 months. Stack: Next.js, TypeScript, PostgreSQL, Supabase Auth, Stripe.
Looking for a senior frontend engineer. Must know React deeply. Remote OK but Austin-based preferred. DM me.
#hiring #react #saas` },
  { name: 'profile_marcus', text: `Marcus Rodriguez, VP of Engineering at CloudSync, New York, NY
CloudSync is a B2B SaaS platform for enterprise data integration. Rebuilding our real-time pipeline and looking for senior backend engineers who know Rust and Postgres.
Hiring: Senior Backend Engineer, Staff Engineer. Remote within US/EU timezones. $45M Series B closed Q2 2025.
https://www.linkedin.com/in/marcusrod` },
]

const RUNS = 5

async function callProvider(provider, system, user) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), provider.timeout)
  const t0 = performance.now()

  try {
    const resp = await fetch(provider.base.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${provider.key}` },
      body: JSON.stringify({
        model: provider.model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 1024,
      }),
      signal: ac.signal,
    })
    const ttfb = performance.now() - t0
    const body = await resp.json().catch(() => null)
    const total = performance.now() - t0
    clearTimeout(timer)

    const content = body?.choices?.[0]?.message?.content
    let parsed = null, parseErr = null
    if (content) {
      try { parsed = JSON.parse(content) } catch (e) { parseErr = e.message.slice(0, 40) }
    }

    return { status: resp.status, ttfbMs: Math.round(ttfb), totalMs: Math.round(total), outputTokens: body?.usage?.completion_tokens || null, parsed, parseError: parseErr || (resp.ok ? null : `HTTP ${resp.status}`) }
  } catch (err) {
    clearTimeout(timer)
    return { status: err.name === 'AbortError' ? 'TIMEOUT' : 'ERROR', ttfbMs: null, totalMs: Math.round(performance.now() - t0), outputTokens: null, parsed: null, parseError: err.message.slice(0, 40) }
  }
}

// Simulate chain walking: try groq_120b first, fallback to gpt
async function callChain(system, user) {
  for (const provider of PROVIDERS) {
    if (!provider.key) continue
    const r = await callProvider(provider, system, user)
    r.provider = provider.id
    if (r.status === 200 && !r.parseError) return r
    // If rate limited or error, try next
    if (r.status === 429 || r.status === 'TIMEOUT' || r.status === 'ERROR' || r.parseError) {
      continue
    }
  }
  return { provider: 'all_failed', status: 'FAILURE', totalMs: 0, parsed: null }
}

async function main() {
  console.log('PRODUCTION PATH BENCHMARK — Fast Structured Chain (Groq 120b → GPT)')
  console.log(`Inputs: ${INPUTS.length}, Runs each: ${RUNS}`)
  console.log('')

  const results = []

  for (const input of INPUTS) {
    const user = `Extract factual entities from this text:\n\n${input.text}`
    for (let i = 0; i < RUNS; i++) {
      const r = await callChain(SYSTEM, user)
      r.input = input.name
      results.push(r)

      const ok = r.status === 200 || r.parsed
      console.log(`  ${ok ? '✓' : '✗'} ${input.name}#${i + 1}: ${r.totalMs}ms (TTFB: ${r.ttfbMs || '?'}ms, ${r.outputTokens || '?'}t, via: ${r.provider})${r.parseError ? ' ERR:' + r.parseError : ''}`)

      if (i < RUNS - 1) await new Promise(r => setTimeout(r, 400))
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(60))
  console.log('RESULTS')
  console.log('═'.repeat(60))

  const ok = results.filter(r => r.parsed)
  const lats = ok.map(r => r.totalMs).sort((a, b) => a - b)
  const ttbfs = ok.map(r => r.ttfbMs).filter(Boolean).sort((a, b) => a - b)
  const toks = ok.map(r => r.outputTokens).filter(Boolean)

  console.log(`Total calls: ${results.length}, Success: ${ok.length}`)
  if (lats.length > 0) {
    console.log(`Latency: p50=${lats[Math.floor(lats.length/2)]}ms, p95=${lats[Math.floor(lats.length*0.95)] || lats[lats.length-1]}ms, min=${lats[0]}ms, max=${lats[lats.length-1]}ms`)
  }
  if (ttbfs.length > 0) {
    console.log(`TTFB:    p50=${ttbfs[Math.floor(ttbfs.length/2)]}ms, p95=${ttbfs[Math.floor(ttbfs.length*0.95)] || ttbfs[ttbfs.length-1]}ms`)
  }
  if (toks.length > 0) {
    console.log(`Avg tokens: ${Math.round(toks.reduce((s,t) => s+t, 0) / toks.length)}`)
  }

  // Provider breakdown
  const byProvider = {}
  for (const r of results.filter(r => r.parsed)) {
    byProvider[r.provider] = (byProvider[r.provider] || 0) + 1
  }
  console.log(`Provider split: ${Object.entries(byProvider).map(([k,v]) => `${k}=${v}`).join(', ')}`)
}

main().catch(e => { console.error(e); process.exit(1) })
