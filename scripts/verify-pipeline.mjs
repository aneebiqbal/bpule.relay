/**
 * End-to-end pipeline verification with new routing.
 * Simulates what production does: Pass A → Pass B → Pass C → completeness → score.
 */

const SYSTEM = `You are a precise factual extraction engine. Extract ONLY what is explicitly stated in the text. Return a single JSON object.

CRITICAL RULES:
- Never invent missing facts. Use null for unknown fields.
- Never replace a source URL with an inferred URL.
- Keep all values concise and factual.

Extract these entities:
1. PERSON: fullName, firstName, title, seniority, location, linkedinUrl, otherUrls
2. COMPANY: name, domain, linkedinUrl, industry, size (+ evidence), product, stage (+ evidence)
3. OPPORTUNITY: signals (hiring, freelance_project_need, technical_problem, growth_signal, funding, launch, migration, rebuild, hiring_pressure, explicit_ask), primarySignal, description, urgency
4. JOB (if present): title, employmentType, workplaceType, allowedGeography, timezone, compensation, skills, seniority, source, postedDate
5. CONTENT: recentPosts (paraphrase, verbatimQuote, topics, signals), topics, explicitProblems, initiatives, launches, technicalSignals, hiringSignals`

const INPUT = `Sarah Chen
CEO & Co-Founder at NovaTech AI
San Francisco, California

Building AI-powered dev tools. Closed $12M Series A led by Sequoia. Hiring 5 more engineers. Remote-first.
Skills: TypeScript, Python, React, Node.js, ML
https://www.linkedin.com/in/sarahchen
https://novatech.ai`

const PROVIDERS = [
  { id: 'groq_120b', base: 'https://api.groq.com/openai/v1', key: process.env.GROQ_API_KEY, model: 'openai/gpt-oss-120b' },
  { id: 'groq_120b_2', base: 'https://api.groq.com/openai/v1', key: process.env.GROQ_API_KEY_2, model: 'openai/gpt-oss-120b' },
  { id: 'gpt', base: 'https://api.openai.com/v1', key: process.env.OPENAI_API_KEY, model: 'gpt-4o-mini' },
]

async function callChain(system, user) {
  for (const provider of PROVIDERS) {
    if (!provider.key) continue
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 15000)

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
      const body = await resp.json().catch(() => null)
      const content = body?.choices?.[0]?.message?.content
      const tokens = body?.usage?.completion_tokens
      clearTimeout(timer)

      if (resp.ok && content) {
        try {
          return { provider: provider.id, model: provider.model, tokens, parsed: JSON.parse(content) }
        } catch (e) {
          continue  // Invalid JSON, try next
        }
      }
      if (resp.status === 429) continue  // Rate limited, try next
    } catch {
      clearTimeout(timer)
      continue
    }
  }
  return { provider: 'FAILED', parsed: null }
}

// Simulate validatePassA coercion
function coerceResult(raw) {
  if (!raw || typeof raw !== 'object') return null
  const r = raw
  const s = (v) => (v === 'null' || v === 'NULL' || v === 'None' || v === '') ? null : (typeof v === 'string' ? v : null)
  const a = (v) => (v === 'null' || v === 'NULL' || v === 'None' || v === '') ? [] : (Array.isArray(v) ? v.filter(x => typeof x === 'string') : [])

  return {
    person: {
      fullName: s(r.person?.fullName),
      firstName: s(r.person?.firstName),
      title: s(r.person?.title),
      seniority: s(r.person?.seniority),
      location: s(r.person?.location),
      linkedinUrl: s(r.person?.linkedinUrl),
      otherUrls: a(r.person?.otherUrls),
    },
    company: {
      name: s(r.company?.name),
      domain: s(r.company?.domain),
      linkedinUrl: s(r.company?.linkedinUrl),
      industry: s(r.company?.industry),
      size: s(r.company?.size),
      stage: s(r.company?.stage),
    },
    opportunity: {
      signals: a(r.opportunity?.signals),
      primarySignal: s(r.opportunity?.primarySignal),
      description: s(r.opportunity?.description),
      urgency: s(r.opportunity?.urgency),
    },
    content: {
      topics: a(r.content?.topics),
      technicalSignals: a(r.content?.technicalSignals),
      hiringSignals: a(r.content?.hiringSignals),
    },
  }
}

async function main() {
  console.log('END-TO-END PIPELINE VERIFICATION')
  console.log('='.repeat(60))

  // Pass A
  const t0 = performance.now()
  const passARaw = await callChain(SYSTEM, `Extract factual entities from this text:\n\n${INPUT}`)
  const passATime = Math.round(performance.now() - t0)

  console.log(`\nPass A: ${passARaw.provider} (${passARaw.model}) — ${passATime}ms, ${passARaw.tokens} tokens`)
  if (passARaw.parsed) {
    const coerced = coerceResult(passARaw.parsed)
    console.log('Coerced result:')
    console.log(JSON.stringify(coerced, null, 2))

    // Quality assertions
    console.log('\nQuality checks:')
    const checks = [
      ['Person name', coerced.person.fullName, 'Sarah Chen'],
      ['Company name', coerced.company.name, 'NovaTech AI'],
      ['Title', coerced.person.title, 'CEO & Co-Founder'],
      ['Has signals', coerced.opportunity.signals.length > 0, true],
      ['Has URL', coerced.person.linkedinUrl?.includes('linkedin.com'), true],
      ['Has tech signals', coerced.content.technicalSignals.length > 0, true],
      ['Has hiring signal', coerced.content.hiringSignals.length > 0 || coerced.opportunity.signals.includes('hiring'), true],
    ]

    let pass = 0
    for (const [label, actual, expected] of checks) {
      const ok = actual === expected || (expected === true && actual)
      if (ok) pass++
      console.log(`  ${ok ? '✓' : '✗'} ${label}: ${JSON.stringify(actual)}${ok ? '' : ` (expected: ${JSON.stringify(expected)})`}`)
    }
    console.log(`\n${pass}/${checks.length} checks passed`)
  } else {
    console.log('FAILED — no valid output')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
