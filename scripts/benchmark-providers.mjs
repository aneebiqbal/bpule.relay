/**
 * Direct provider benchmark — exact Pass A payload.
 *
 * Measures LongCat, Groq, and GPT on identical extraction requests.
 * No Next.js, no pipeline, no DB — just raw provider latency.
 *
 * Usage: node scripts/benchmark-providers.mjs
 * Requires: LONGCAT_API_KEY, GROQ_API_KEY, OPENAI_API_KEY in env
 */

import https from 'https'
import http from 'http'

// ── Exact production Pass A system prompt ──
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

// ── Realistic test inputs (LinkedIn dumps) ──
const TEST_INPUTS = [
  {
    name: 'linkedin_profile_1',
    text: `Sarah Chen
CEO & Co-Founder at NovaTech AI
San Francisco, California · 500+ connections

About
We're building the next generation of AI-powered dev tools. NovaTech AI helps engineering teams ship faster with intelligent code review and automated testing. Backed by Sequoia, we just closed our $12M Series A.

Experience
NovaTech AI · Full-time · Jan 2022 - Present · 3 yrs · San Francisco, CA
- Building AI-powered developer tools for code review
- Team of 15 engineers, hiring 5 more
- Just raised $12M Series A led by Sequoia
- Remote-first, but SF HQ

Previous: Senior Engineer at Google · 4 yrs
Previous: Software Engineer at Meta · 2 yrs

Education
Stanford University · M.S. Computer Science
UC Berkeley · B.S. Computer Science

Skills: TypeScript, Python, React, Node.js, Machine Learning, OpenAI, LangChain

https://www.linkedin.com/in/sarahchen
https://novatech.ai`,
  },
  {
    name: 'linkedin_profile_2',
    text: `Marcus Rodriguez
VP of Engineering at CloudSync
New York, NY

About
CloudSync is a B2B SaaS platform for enterprise data integration. We process 2TB+ daily for Fortune 500 clients. Currently rebuilding our real-time pipeline and looking for senior backend engineers who know Rust and Postgres.

Experience
CloudSync · Full-time · Mar 2020 - Present
- Lead engineering team of 40
- Rebuilding real-time data pipeline (migration from Python to Rust)
- Hiring: Senior Backend Engineer, Staff Engineer
- Remote within US/EU timezones
- $45M Series B closed Q2 2025

Previous: Engineering Manager at Stripe
Previous: Senior Developer at MongoDB

https://www.linkedin.com/in/marcusrod
https://cloudsync.io`,
  },
  {
    name: 'job_post_upwork',
    text: `Job: Full-Stack Developer for AI Dashboard (React + Python)
Budget: $5,000 - $8,000
Proposals: 12

Description:
We need an experienced full-stack developer to build an AI analytics dashboard. Must have:
- React/Next.js frontend experience
- Python FastAPI backend
- PostgreSQL database design
- Experience with OpenAI API integration
- Real-time data visualization (D3.js or similar)

Project is for a YC-backed startup. Looking to start immediately. Remote work, async communication. Must be available for weekly sync calls (PST timezone).

Client: DataViz AI (dataviz.ai)
Tech stack: Next.js, Python, PostgreSQL, OpenAI, AWS
Posted: 2 days ago`,
  },
  {
    name: 'linkedin_post_signal',
    text: `David Kim
CTO at LaunchPad.io
Austin, TX · 2,300+ connections

Just shipped our new multi-tenant SaaS platform after 8 months of development. Stack: Next.js, TypeScript, PostgreSQL with RLS, Supabase Auth, Stripe payments.

Looking for a senior frontend engineer who can help us scale. Must know React deeply and have experience with complex state management. Remote OK but Austin-based preferred. DM me if interested.

#hiring #react #saas #startup`,
  },
  {
    name: 'pasted_client_brief',
    text: `Client: GreenLeaf Supplements
Contact: Jennifer Walsh, Founder & CEO
Company: GreenLeaf Supplements (greensupplements.com)
Location: Austin, TX (remote-friendly)

We need help building our e-commerce platform. Currently on Shopify but hitting limits with custom product configurations and subscription logic.

Requirements:
- Custom headless commerce frontend (Next.js or Remix)
- Subscription billing integration (Stripe or Recharge)
- Inventory management system
- HIPAA compliance for supplement recommendations
- SEO optimization and content management

Budget: $15,000 - $25,000
Timeline: 3 months to MVP
Looking for: Full-stack developer or small team`,
  },
]

// ── Provider configs ──
const PROVIDERS = [
  {
    id: 'longcat',
    host: process.env.LONGCAT_BASE_URL || 'https://api.longcat.chat/openai/v1',
    apiKey: process.env.LONGCAT_API_KEY,
    model: process.env.LONGCAT_MODEL || 'LongCat-2.0',
  },
  {
    id: 'groq',
    host: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
    apiKey: process.env.GROQ_API_KEY,
    model: 'openai/gpt-oss-20b',
  },
  {
    id: 'gpt',
    host: process.env.OPENAI_CHAT_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o-mini',
  },
]

const RUNS_PER_CASE = 10
const TIMEOUT_MS = 60_000

// ── HTTP request with timing ──
async function timedRequest(provider, systemPrompt, userPrompt) {
  const url = new URL(provider.host)
  const isHttps = url.protocol === 'https:'
  const lib = isHttps ? https : http
  // Append /chat/completions to base URL path
  const basePath = url.pathname.replace(/\/$/, '')
  const chatPath = `${basePath}/chat/completions`

  const body = JSON.stringify({
    model: provider.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 2048,
  })

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${provider.apiKey}`,
    'Content-Length': Buffer.byteLength(body),
  }

  const result = {
    provider: provider.id,
    model: provider.model,
    status: null,
    ttfbMs: null,
    totalMs: null,
    outputTokens: null,
    outputChars: null,
    parseError: null,
    parsed: null,
  }

  const start = Date.now()

  await new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: chatPath + url.search,
        method: 'POST',
        headers,
        timeout: TIMEOUT_MS,
      },
      (res) => {
        let data = ''
        const ttfbSet = false
        const ttfbTime = null

        res.on('data', (chunk) => {
          data += chunk
          if (!result.ttfbMs) {
            result.ttfbMs = Date.now() - start
          }
        })

        res.on('end', () => {
          result.totalMs = Date.now() - start
          result.status = res.statusCode

          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const json = JSON.parse(data)
              const content = json.choices?.[0]?.message?.content
              result.outputChars = content?.length || 0
              result.outputTokens = json.usage?.completion_tokens || null
              result.parsed = JSON.parse(content)
            } catch (e) {
              result.parseError = e.message
            }
          }
          resolve()
        })
      },
    )

    req.on('timeout', () => {
      result.totalMs = Date.now() - start
      result.status = 'TIMEOUT'
      req.destroy()
      resolve()
    })

    req.on('error', (err) => {
      result.totalMs = Date.now() - start
      result.status = `ERROR: ${err.message}`
      resolve()
    })

    req.write(body)
    req.end()
  })

  return result
}

// ── Grade extraction quality ──
function gradeExtraction(parsed, inputText) {
  if (!parsed) return { score: 0, issues: ['no_parse'] }
  const issues = []
  let score = 0
  let maxScore = 0

  // Person name (if present in text)
  maxScore += 2
  if (parsed.person?.fullName) score += 2
  else if (parsed.person?.fullName === null && !inputText.match(/^[A-Z][a-z]+\s+[A-Z][a-z]+/m)) score += 1

  // Company name (if present in text)
  maxScore += 2
  if (parsed.company?.name) score += 2
  else if (parsed.company?.name === null && !inputText.match(/at\s+[A-Z]|company|Company/i)) score += 1

  // Title
  maxScore += 2
  if (parsed.person?.title) score += 2

  // Opportunity signals
  maxScore += 2
  if (parsed.opportunity?.signals?.length > 0) score += 2

  // URLs preserved
  maxScore += 2
  const urls = inputText.match(/https?:\/\/[^\s]+/g) || []
  if (urls.length > 0) {
    const hasAnyUrl = urls.some(u =>
      parsed.person?.linkedinUrl?.includes(u) ||
      parsed.person?.otherUrls?.some(ou => ou.includes(u)) ||
      parsed.company?.linkedinUrl?.includes(u)
    )
    if (hasAnyUrl || parsed.person?.linkedinUrl) score += 2
    else issues.push('urls_lost')
  } else {
    score += 1
  }

  return { score, maxScore, issues, pct: Math.round((score / maxScore) * 100) }
}

// ── Main benchmark ──
async function main() {
  console.log('='.repeat(80))
  console.log('PROVIDER BENCHMARK — Exact Pass A Payload')
  console.log(`Providers: ${PROVIDERS.filter(p => p.apiKey).map(p => p.id).join(', ')}`)
  console.log(`Test cases: ${TEST_INPUTS.length}`)
  console.log(`Runs per case: ${RUNS_PER_CASE}`)
  console.log('='.repeat(80))

  // Context size analysis
  const sysLen = PASS_A_SYSTEM.length
  console.log(`\nSystem prompt: ${sysLen} chars (${Buffer.byteLength(PASS_A_SYSTEM)} bytes)`)
  for (const input of TEST_INPUTS) {
    const userPrompt = `Extract factual entities from this text:\n\n${input.text}`
    console.log(`  ${input.name}: ${input.text.length} chars input → ${sysLen + userPrompt.length} chars total context`)
  }

  const allResults = []

  for (const provider of PROVIDERS) {
    if (!provider.apiKey) {
      console.log(`\n⚠️  Skipping ${provider.id} — no API key`)
      continue
    }

    console.log(`\n${'─'.repeat(60)}`)
    console.log(`Testing: ${provider.id} (${provider.model})`)
    console.log('─'.repeat(60))

    for (const input of TEST_INPUTS) {
      const userPrompt = `Extract factual entities from this text:\n\n${input.text}`
      const runResults = []

      for (let i = 0; i < RUNS_PER_CASE; i++) {
        const r = await timedRequest(provider, PASS_A_SYSTEM, userPrompt)
        r.inputName = input.name
        r.run = i + 1
        runResults.push(r)
        allResults.push(r)

        const status = r.status === 200 ? '✓' : '✗'
        console.log(
          `  ${status} ${input.name} #${i + 1}: ` +
          `${r.totalMs}ms ` +
          `(TTFB: ${r.ttfbMs}ms, ` +
          `out: ${r.outputTokens || '?'}t/${r.outputChars || '?'}c` +
          `${r.parseError ? ', PARSE_ERR: ' + r.parseError : ''}` +
          `${r.status !== 200 ? ', STATUS: ' + r.status : ''}`,
        )

        // Small delay to avoid rate limits
        if (i < RUNS_PER_CASE - 1) await new Promise(r => setTimeout(r, 200))
      }

      // Summary for this provider+input
      const success = runResults.filter(r => r.status === 200 && !r.parseError)
      const latencies = success.map(r => r.totalMs).sort((a, b) => a - b)
      const quality = success.filter(r => r.parsed).map(r => gradeExtraction(r.parsed, input.text))
      const avgQuality = quality.length > 0 ? Math.round(quality.reduce((s, q) => s + q.pct, 0) / quality.length) : 0

      console.log(
        `  └─ ${input.name}: p50=${latencies[Math.floor(latencies.length / 2)] || 'N/A'}ms, ` +
        `p95=${latencies[Math.floor(latencies.length * 0.95)] || 'N/A'}ms, ` +
        `max=${latencies[latencies.length - 1] || 'N/A'}ms, ` +
        `success=${success.length}/${RUNS_PER_CASE}, ` +
        `quality=${avgQuality}%`,
      )
    }
  }

  // ── Cross-provider comparison ──
  console.log('\n' + '='.repeat(80))
  console.log('CROSS-PROVIDER COMPARISON')
  console.log('='.repeat(80))

  for (const provider of PROVIDERS) {
    if (!provider.apiKey) continue
    const providerResults = allResults.filter(r => r.provider === provider.id)
    const success = providerResults.filter(r => r.status === 200 && !r.parseError)
    const latencies = success.map(r => r.totalMs).sort((a, b) => a - b)
    const ttbfs = success.map(r => r.ttfbMs).filter(Boolean).sort((a, b) => a - b)
    const quality = success.filter(r => r.parsed).map(r => gradeExtraction(r.parsed, TEST_INPUTS.find(t => t.name === r.inputName)?.text || ''))
    const avgQuality = quality.length > 0 ? Math.round(quality.reduce((s, q) => s + q.pct, 0) / quality.length) : 0
    const malformed = providerResults.filter(r => r.status === 200 && r.parseError).length

    console.log(`\n${provider.id} (${provider.model}):`)
    console.log(`  Success: ${success.length}/${providerResults.length} (${Math.round((success.length / providerResults.length) * 100)}%)`)
    console.log(`  Malformed JSON: ${malformed}`)
    if (latencies.length > 0) {
      console.log(`  Total latency: p50=${latencies[Math.floor(latencies.length / 2)]}ms, p95=${latencies[Math.floor(latencies.length * 0.95)] || latencies[latencies.length - 1]}ms, max=${latencies[latencies.length - 1]}ms, min=${latencies[0]}ms`)
    }
    if (ttbfs.length > 0) {
      console.log(`  TTFB: p50=${ttbfs[Math.floor(ttbfs.length / 2)]}ms, p95=${ttbfs[Math.floor(ttbfs.length * 0.95)] || ttbfs[ttbfs.length - 1]}ms`)
    }
    console.log(`  Quality: ${avgQuality}%`)
  }
}

main().catch(console.error)
