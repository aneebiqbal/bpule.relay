/**
 * Direct provider benchmark — exact Pass A payload.
 * Uses fetch with AbortController for precise timing.
 */

const PASS_A_SYSTEM = `You are a precise factual extraction engine. Extract ONLY what is explicitly stated in the text. Return a single JSON object.

CRITICAL RULES:
- Never invent missing facts. Use null for unknown fields.
- Never replace a source URL with an inferred URL.
- Distinguish between FACT (explicitly stated) and INFERENCE (your conclusion).
- Every extracted fact must have evidence from the text.
- Keep all values concise and factual.
- COMPANY LOCATION ≠ WORKER LOCATION. A company based in San Francisco offering remote work is NOT "US-only". Only mark workplaceType as ONSITE or geography as restricted if the text EXPLICITLY states a worker location requirement (e.g., "must be based in the US", "on-site in New York").
- "Remote OK", "Remote-friendly", "work from anywhere" = REMOTE. Do not downgrade to ONSITE or geography-restricted merely because the company has a headquarters city.
- COMPANY NAME: If the title contains "at CompanyName" or "of CompanyName" (e.g., "CEO of Starke Marketing"), extract "Starke Marketing" as the company name. Do NOT leave company.name null when the company is clearly mentioned in the title or text.

Extract these entities:
1. PERSON: fullName, firstName, title, seniority, location, linkedinUrl, otherUrls
2. COMPANY: name, domain, linkedinUrl, industry, size (+ evidence), product, stage (+ evidence)
3. OPPORTUNITY: signals (hiring, freelance_project_need, technical_problem, growth_signal, funding, launch, migration, rebuild, hiring_pressure, explicit_ask), primarySignal, description, urgency (immediate, near_term, future, unknown)
4. JOB (if present): title, employmentType, workplaceType (REMOTE/HYBRID/ONSITE/UNKNOWN), allowedGeography, timezone, compensation, skills, seniority, source, postedDate
5. CONTENT: recentPosts (paraphrase, verbatimQuote, topics, signals), topics, explicitProblems, initiatives, launches, technicalSignals, hiringSignals`

const TEST_INPUTS = [
  {
    name: 'profile_1',
    text: `Sarah Chen
CEO & Co-Founder at NovaTech AI
San Francisco, California

About
We're building AI-powered dev tools. NovaTech AI helps engineering teams ship faster with intelligent code review. Backed by Sequoia, closed $12M Series A. Hiring 5 more engineers. Remote-first.

Experience
NovaTech AI · Jan 2022 - Present · San Francisco
- Building AI code review tools
- Team of 15, scaling to 20

Skills: TypeScript, Python, React, Node.js, ML

https://www.linkedin.com/in/sarahchen
https://novatech.ai`,
  },
  {
    name: 'job_1',
    text: `Job: Full-Stack Developer for AI Dashboard
Budget: $5,000 - $8,000

Need experienced full-stack developer for AI analytics dashboard.
- React/Next.js frontend
- Python FastAPI backend
- PostgreSQL, OpenAI API integration
- Real-time data visualization

YC-backed startup. Remote, async. PST timezone for weekly calls.

Client: DataViz AI (dataviz.ai)
Tech: Next.js, Python, PostgreSQL, OpenAI, AWS`,
  },
  {
    name: 'brief_1',
    text: `Client: GreenLeaf Supplements
Contact: Jennifer Walsh, Founder & CEO
Location: Austin, TX (remote-friendly)

Building e-commerce platform. On Shopify but hitting limits with custom product configs and subscription logic.

Requirements:
- Headless commerce frontend (Next.js)
- Subscription billing (Stripe)
- Inventory management
- HIPAA compliance
- SEO optimization

Budget: $15,000 - $25,000
Timeline: 3 months to MVP`,
  },
]

const PROVIDERS = [
  {
    id: 'longcat',
    base: process.env.LONGCAT_BASE_URL || 'https://api.longcat.chat/openai/v1',
    apiKey: process.env.LONGCAT_API_KEY,
    model: process.env.LONGCAT_MODEL || 'LongCat-2.0',
  },
  {
    id: 'groq',
    base: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
    apiKey: process.env.GROQ_API_KEY,
    model: 'openai/gpt-oss-20b',
  },
  {
    id: 'groq_strong',
    base: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
    apiKey: process.env.GROQ_API_KEY,
    model: 'openai/gpt-oss-120b',
  },
  {
    id: 'gpt',
    base: process.env.OPENAI_CHAT_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o-mini',
  },
]

const RUNS_PER_CASE = 10
const REQUEST_TIMEOUT_MS = 90_000

async function callProvider(provider, system, user, caseLabel, runIdx) {
  const url = provider.base.replace(/\/$/, '') + '/chat/completions'
  const body = {
    model: provider.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 2048,
  }

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS)

  const tStart = performance.now()
  let tTtfb = null
  let tEnd = null
  let status = null
  let respBody = null
  let parsed = null
  let parseError = null

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    })

    tTtfb = performance.now() - tStart
    status = resp.status

    if (resp.ok) {
      respBody = await resp.json()
      const content = respBody.choices?.[0]?.message?.content
      if (content) {
        try { parsed = JSON.parse(content) }
        catch (e) { parseError = e.message }
      }
    } else {
      const text = await resp.text().catch(() => '')
      parseError = `HTTP ${status}: ${text.slice(0, 200)}`
    }
  } catch (err) {
    parseError = err.name === 'AbortError' ? 'TIMEOUT' : err.message
    if (!status) status = err.name === 'AbortError' ? 'TIMEOUT' : `ERROR`
  } finally {
    clearTimeout(timer)
    tEnd = performance.now() - tStart
  }

  const outputTokens = respBody?.usage?.completion_tokens || null
  const outputChars = respBody?.choices?.[0]?.message?.content?.length || null

  console.log(
    `  ${status === 200 && !parseError ? '✓' : '✗'} ${caseLabel} #${runIdx}: ` +
    `${Math.round(tEnd)}ms (TTFB: ${tTtfb ? Math.round(tTtfb) : '?'}ms` +
    `, out: ${outputTokens || '?'}t/${outputChars || '?'}c` +
    `${parseError ? ', ERR: ' + parseError.slice(0, 80) : ''}` +
    `${status !== 200 && status ? ', STATUS: ' + status : ''}`,
  )

  return { provider: provider.id, model: provider.model, status, ttfbMs: tTtfb, totalMs: tEnd, outputTokens, outputChars, parsed, parseError }
}

function grade(parsed, text) {
  if (!parsed) return { pct: 0, issues: ['no_parse'] }
  let score = 0, max = 0, issues = []

  max += 2; if (parsed.person?.fullName) score += 2
  max += 2; if (parsed.company?.name) score += 2
  max += 2; if (parsed.person?.title) score += 2
  max += 2; if (parsed.opportunity?.signals?.length > 0) score += 2
  max += 2
  const urls = text.match(/https?:\/\/[^\s]+/g) || []
  if (urls.length > 0) {
    const preserved = urls.some(u =>
      parsed.person?.linkedinUrl?.includes(u) ||
      parsed.person?.otherUrls?.some(ou => ou.includes(u)) ||
      parsed.company?.linkedinUrl?.includes(u)
    )
    if (preserved || parsed.person?.linkedinUrl) score += 2
    else issues.push('urls_lost')
  } else { score += 1 }

  return { pct: Math.round((score / max) * 100), issues }
}

async function main() {
  console.log('='.repeat(70))
  console.log('DIRECT PROVIDER BENCHMARK — Exact Pass A Payload')
  console.log('='.repeat(70))
  console.log(`System prompt: ${PASS_A_SYSTEM.length} chars`)
  console.log(`Test cases: ${TEST_INPUTS.length}, Runs each: ${RUNS_PER_CASE}`)
  console.log(`Timeout: ${REQUEST_TIMEOUT_MS}ms`)
  console.log('')

  const all = []

  for (const provider of PROVIDERS) {
    if (!provider.apiKey) { console.log(`\n⚠ Skip ${provider.id} — no key`); continue }
    console.log(`\n${'─'.repeat(50)}`)
    console.log(`${provider.id} (${provider.model}) @ ${provider.base}`)
    console.log('─'.repeat(50))

    for (const input of TEST_INPUTS) {
      const user = `Extract factual entities from this text:\n\n${input.text}`
      for (let i = 0; i < RUNS_PER_CASE; i++) {
        const r = await callProvider(provider, PASS_A_SYSTEM, user, input.name, i + 1)
        r.caseName = input.name
        r.inputText = input.text
        all.push(r)
        if (i < RUNS_PER_CASE - 1) await new Promise(r => setTimeout(r, 500))
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70))
  console.log('RESULTS')
  console.log('='.repeat(70))

  for (const provider of PROVIDERS) {
    if (!provider.apiKey) continue
    const rows = all.filter(r => r.provider === provider.id)
    const ok = rows.filter(r => r.status === 200 && !r.parseError)
    const lats = ok.map(r => r.totalMs).sort((a, b) => a - b)
    const ttbfs = ok.map(r => r.ttfbMs).filter(Boolean).sort((a, b) => a - b)
    const qualities = ok.filter(r => r.parsed).map(r => grade(r.parsed, r.inputText))
    const avgQ = qualities.length > 0 ? Math.round(qualities.reduce((s, q) => s + q.pct, 0) / qualities.length) : 0

    console.log(`\n${provider.id} (${provider.model}):`)
    console.log(`  Success: ${ok.length}/${rows.length}`)
    if (lats.length > 0) {
      console.log(`  Total:   p50=${Math.round(lats[Math.floor(lats.length/2)])}ms  p95=${Math.round(lats[Math.floor(lats.length*0.95)] || lats[lats.length-1])}ms  min=${Math.round(lats[0])}ms  max=${Math.round(lats[lats.length-1])}ms`)
    }
    if (ttbfs.length > 0) {
      console.log(`  TTFB:    p50=${Math.round(ttbfs[Math.floor(ttbfs.length/2)])}ms  p95=${Math.round(ttbfs[Math.floor(ttbfs.length*0.95)] || ttbfs[ttbfs.length-1])}ms`)
    }
    console.log(`  Quality: ${avgQ}%`)
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
