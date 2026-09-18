/**
 * Check actual extraction quality — show raw outputs from each provider.
 */

const SYSTEM = `You are a precise factual extraction engine. Extract ONLY what is explicitly stated in the text. Return a single JSON object.

CRITICAL RULES:
- Never invent missing facts. Use null for unknown fields.
- Never replace a source URL with an inferred URL.
- Distinguish between FACT (explicitly stated) and INFERENCE (your conclusion).
- Every extracted fact must have evidence from the text.
- Keep all values concise and factual.
- COMPANY LOCATION ≠ WORKER LOCATION.
- "Remote OK", "Remote-friendly", "work from anywhere" = REMOTE.

Extract these entities:
1. PERSON: fullName, firstName, title, seniority, location, linkedinUrl, otherUrls
2. COMPANY: name, domain, linkedinUrl, industry, size (+ evidence), product, stage (+ evidence)
3. OPPORTUNITY: signals (hiring, freelance_project_need, technical_problem, growth_signal, funding, launch, migration, rebuild, hiring_pressure, explicit_ask), primarySignal, description, urgency
4. JOB (if present): title, employmentType, workplaceType, allowedGeography, timezone, compensation, skills, seniority, source, postedDate
5. CONTENT: recentPosts (paraphrase, verbatimQuote, topics, signals), topics, explicitProblems, initiatives, launches, technicalSignals, hiringSignals`

const INPUT = {
  text: `Sarah Chen
CEO & Co-Founder at NovaTech AI
San Francisco, California

Building AI-powered dev tools. Closed $12M Series A led by Sequoia. Hiring 5 more engineers. Remote-first.

Experience: NovaTech AI · Jan 2022 - Present · San Francisco
Skills: TypeScript, Python, React, Node.js, ML
https://www.linkedin.com/in/sarahchen
https://novatech.ai`,
}

const PROVIDERS = [
  { id: 'longcat', base: 'https://api.longcat.chat/openai/v1', key: process.env.LONGCAT_API_KEY, model: 'LongCat-2.0', maxTokens: 2048 },
  { id: 'groq_20b', base: 'https://api.groq.com/openai/v1', key: process.env.GROQ_API_KEY, model: 'openai/gpt-oss-20b', maxTokens: 2048 },
  { id: 'groq_120b', base: 'https://api.groq.com/openai/v1', key: process.env.GROQ_API_KEY, model: 'openai/gpt-oss-120b', maxTokens: 2048 },
  { id: 'gpt', base: 'https://api.openai.com/v1', key: process.env.OPENAI_API_KEY, model: 'gpt-4o-mini', maxTokens: 2048 },
]

async function call(provider) {
  const resp = await fetch(provider.base.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${provider.key}` },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Extract factual entities from this text:\n\n${INPUT.text}` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: provider.maxTokens,
    }),
  })
  const body = await resp.json()
  return {
    provider: provider.id,
    model: provider.model,
    status: resp.status,
    usage: body.usage,
    content: body.choices?.[0]?.message?.content,
    error: body.error,
  }
}

async function main() {
  console.log('RAW OUTPUT QUALITY CHECK')
  console.log('='.repeat(70))
  console.log(`Input: Sarah Chen / NovaTech AI / $12M Series A / Hiring\n`)

  for (const p of PROVIDERS) {
    if (!p.key) continue
    console.log(`\n━━━ ${p.id} (${p.model}) ━━━`)
    const r = await call(p)
    if (r.error) {
      console.log(`  ERROR: ${r.error.message}`)
      continue
    }
    console.log(`  Tokens: ${r.usage?.prompt_tokens} prompt + ${r.usage?.completion_tokens} completion = ${r.usage?.total_tokens} total`)
    console.log(`  Output (${r.content?.length || 0} chars):`)
    console.log('  ' + '─'.repeat(50))
    if (r.content) {
      // Try to pretty-print if valid JSON
      try {
        const parsed = JSON.parse(r.content)
        console.log(JSON.stringify(parsed, null, 2).split('\n').map(l => '  ' + l).join('\n'))
      } catch {
        console.log('  [INVALID JSON]')
        console.log(r.content.slice(0, 500))
        if (r.content.length > 500) console.log(`  ... (${r.content.length - 500} more chars)`)
      }
    }
    console.log('  ' + '─'.repeat(50))
  }
}

main().catch(e => { console.error(e); process.exit(1) })
