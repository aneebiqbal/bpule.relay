/**
 * Quick 3-run provider comparison — exact Pass A payload.
 * Focus: LongCat vs Groq vs GPT latency.
 */

const SYSTEM = `You are a precise factual extraction engine. Extract ONLY what is explicitly stated in the text. Return a single JSON object.

CRITICAL RULES:
- Never invent missing facts. Use null for unknown fields.
- Never replace a source URL with an inferred URL.
- Distinguish between FACT (explicitly stated) and INFERENCE (your conclusion).
- Every extracted fact must have evidence from the text.
- Keep all values concise and factual.
- COMPANY LOCATION ≠ WORKER LOCATION. A company based in San Francisco offering remote work is NOT "US-only". Only mark workplaceType as ONSITE or geography as restricted if the text EXPLICITLY states a worker location requirement.
- "Remote OK", "Remote-friendly", "work from anywhere" = REMOTE.
- COMPANY NAME: If the title contains "at CompanyName" or "of CompanyName", extract it as the company name.

Extract these entities:
1. PERSON: fullName, firstName, title, seniority, location, linkedinUrl, otherUrls
2. COMPANY: name, domain, linkedinUrl, industry, size (+ evidence), product, stage (+ evidence)
3. OPPORTUNITY: signals (hiring, freelance_project_need, technical_problem, growth_signal, funding, launch, migration, rebuild, hiring_pressure, explicit_ask), primarySignal, description, urgency (immediate, near_term, future, unknown)
4. JOB (if present): title, employmentType, workplaceType (REMOTE/HYBRID/ONSITE/UNKNOWN), allowedGeography, timezone, compensation, skills, seniority, source, postedDate
5. CONTENT: recentPosts (paraphrase, verbatimQuote, topics, signals), topics, explicitProblems, initiatives, launches, technicalSignals, hiringSignals`

const INPUTS = [
  {
    name: 'profile',
    text: `Sarah Chen
CEO & Co-Founder at NovaTech AI
San Francisco, California

Building AI-powered dev tools. Closed $12M Series A led by Sequoia. Hiring 5 more engineers. Remote-first.

Experience: NovaTech AI · Jan 2022 - Present · San Francisco
Skills: TypeScript, Python, React, Node.js, ML
https://www.linkedin.com/in/sarahchen
https://novatech.ai`,
  },
  {
    name: 'job',
    text: `Job: Full-Stack Developer for AI Dashboard
Budget: $5,000 - $8,000

Need experienced full-stack developer. React/Next.js frontend, Python FastAPI backend, PostgreSQL, OpenAI API. YC-backed startup. Remote, PST timezone.
Client: DataViz AI (dataviz.ai)`,
  },
  {
    name: 'brief',
    text: `Client: GreenLeaf Supplements
Contact: Jennifer Walsh, Founder & CEO
Austin, TX (remote-friendly)

Building e-commerce platform. Next.js frontend, Stripe subscriptions, HIPAA compliance.
Budget: $15,000 - $25,000. Timeline: 3 months.`,
  },
]

const PROVIDERS = [
  { id: 'longcat', base: 'https://api.longcat.chat/openai/v1', key: process.env.LONGCAT_API_KEY, model: 'LongCat-2.0' },
  { id: 'groq_20b', base: 'https://api.groq.com/openai/v1', key: process.env.GROQ_API_KEY, model: 'openai/gpt-oss-20b' },
  { id: 'groq_120b', base: 'https://api.groq.com/openai/v1', key: process.env.GROQ_API_KEY, model: 'openai/gpt-oss-120b' },
  { id: 'gpt', base: 'https://api.openai.com/v1', key: process.env.OPENAI_API_KEY, model: 'gpt-4o-mini' },
]

const RUNS = 3
const TIMEOUT = 120_000

async function call(provider, system, user) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT)
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
        max_tokens: 2048,
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
      try { parsed = JSON.parse(content) } catch (e) { parseErr = e.message.slice(0, 60) }
    }

    return {
      status: resp.status,
      ttfbMs: Math.round(ttfb),
      totalMs: Math.round(total),
      outputTokens: body?.usage?.completion_tokens || null,
      outputChars: content?.length || null,
      parsed,
      parseError: parseErr || (resp.ok ? null : `HTTP ${resp.status}`),
    }
  } catch (err) {
    clearTimeout(timer)
    return { status: err.name === 'AbortError' ? 'TIMEOUT' : 'ERROR', ttfbMs: null, totalMs: Math.round(performance.now() - t0), outputTokens: null, outputChars: null, parsed: null, parseError: err.message.slice(0, 60) }
  }
}

function grade(parsed, text) {
  if (!parsed) return 0
  let s = 0, m = 0
  m += 2; if (parsed.person?.fullName) s += 2
  m += 2; if (parsed.company?.name) s += 2
  m += 2; if (parsed.person?.title) s += 2
  m += 2; if (parsed.opportunity?.signals?.length > 0) s += 2
  m += 2
  const urls = text.match(/https?:\/\/[^\s]+/g) || []
  if (urls.length > 0) {
    const ok = urls.some(u => parsed.person?.linkedinUrl?.includes(u) || parsed.person?.otherUrls?.some(ou => ou.includes(u)) || parsed.company?.linkedinUrl?.includes(u))
    if (ok || parsed.person?.linkedinUrl) s += 2
  } else s += 1
  return Math.round((s / m) * 100)
}

async function main() {
  console.log('QUICK PROVIDER BENCHMARK — Exact Pass A Payload')
  console.log(`Providers: ${PROVIDERS.filter(p => p.key).map(p => `${p.id}(${p.model})`).join(', ')}`)
  console.log(`Inputs: ${INPUTS.length}, Runs each: ${RUNS}, Timeout: ${TIMEOUT}ms`)
  console.log('')

  const results = []

  for (const p of PROVIDERS) {
    if (!p.key) { console.log(`SKIP ${p.id} — no key`); continue }
    console.log(`\n━━━ ${p.id} (${p.model}) ━━━`)

    for (const input of INPUTS) {
      const user = `Extract factual entities from this text:\n\n${input.text}`
      for (let i = 0; i < RUNS; i++) {
        const r = await call(p, SYSTEM, user)
        r.provider = p.id
        r.model = p.model
        r.input = input.name
        results.push(r)

        const ok = r.status === 200 && !r.parseError
        console.log(`  ${ok ? '✓' : '✗'} ${input.name}#${i + 1}: ${r.totalMs}ms (TTFB: ${r.ttfbMs || '?'}ms, ${r.outputTokens || '?'}t/${r.outputChars || '?'}c)${r.parseError ? ' ERR:' + r.parseError : ''}`)

        if (i < RUNS - 1) await new Promise(r => setTimeout(r, 300))
      }
    }
  }

  // Summary table
  console.log('\n' + '═'.repeat(70))
  console.log('COMPARISON TABLE')
  console.log('═'.repeat(70))
  console.log(`${'Provider'.padEnd(15)} ${'p50'.padStart(8)} ${'p95'.padStart(8)} ${'max'.padStart(8)} ${'TTFB p50'.padStart(10)} ${'Success'.padStart(8)} ${'Quality'.padStart(8)} ${'Avg Tok'.padStart(8)}`)

  for (const p of PROVIDERS) {
    if (!p.key) continue
    const rows = results.filter(r => r.provider === p.id)
    const ok = rows.filter(r => r.status === 200 && !r.parseError)
    const lats = ok.map(r => r.totalMs).sort((a, b) => a - b)
    const ttbfs = ok.map(r => r.ttfbMs).filter(Boolean).sort((a, b) => a - b)
    const toks = ok.map(r => r.outputTokens).filter(Boolean)
    const avgTok = toks.length > 0 ? Math.round(toks.reduce((s, t) => s + t, 0) / toks.length) : 0
    const qualities = ok.filter(r => r.parsed).map(r => grade(r.parsed, INPUTS.find(i => i.name === r.input)?.text || ''))
    const avgQ = qualities.length > 0 ? Math.round(qualities.reduce((s, q) => s + q, 0) / qualities.length) : 0

    const p50 = lats.length > 0 ? `${Math.round(lats[Math.floor(lats.length / 2)])}ms` : 'N/A'
    const p95 = lats.length > 0 ? `${Math.round(lats[Math.floor(lats.length * 0.95)] || lats[lats.length - 1])}ms` : 'N/A'
    const max = lats.length > 0 ? `${Math.round(lats[lats.length - 1])}ms` : 'N/A'
    const ttfbP50 = ttbfs.length > 0 ? `${Math.round(ttbfs[Math.floor(ttbfs.length / 2)])}ms` : 'N/A'

    console.log(
      `${p.id.padEnd(15)} ${p50.padStart(8)} ${p95.padStart(8)} ${max.padStart(8)} ${ttfbP50.padStart(10)} ${`${ok.length}/${rows.length}`.padStart(8)} ${`${avgQ}%`.padStart(8)} ${String(avgTok).padStart(8)}`,
    )
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
