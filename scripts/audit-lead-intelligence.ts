import { config as loadDotenv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

loadDotenv({ path: '.env.local' })

type LeadRow = {
  id: string
  company: string | null
  contact_name: string | null
  contact_title: string | null
  title_raw: string | null
  location_raw: string | null
  url: string | null
  raw_input: string | null
  signal_type: number | null
  signal_evidence: string | null
  score: number | null
  verdict: 'send' | 'research_more' | 'skip' | null
  canonical_score: number | null
  canonical_intelligence: Record<string, unknown> | null
  extraction_confidence: number | null
}

type CliOptions = {
  fixSafe: boolean
  extractReal: boolean
  archiveSynthetic: boolean
  limit: number | null
  all: boolean
}

function parseArgs(argv: string[]): CliOptions {
  const out: CliOptions = {
    fixSafe: false,
    extractReal: false,
    archiveSynthetic: false,
    limit: null,
    all: false,
  }

  for (const arg of argv) {
    if (arg === '--fix-safe') out.fixSafe = true
    else if (arg === '--extract-real') out.extractReal = true
    else if (arg === '--archive-synthetic') out.archiveSynthetic = true
    else if (arg === '--all') out.all = true
    else if (arg.startsWith('--limit=')) {
      const n = Number(arg.split('=')[1])
      if (Number.isFinite(n) && n > 0) out.limit = Math.floor(n)
    }
  }

  return out
}

function isPlaceholder(value: string | null | undefined): boolean {
  const t = String(value ?? '').trim().toLowerCase()
  return t.length > 0 && [
    'unknown',
    'unknown company',
    'unknown title',
    'n/a',
    'na',
    'none',
    'null',
    'undefined',
    '-',
  ].includes(t)
}

function expectedVerdict(score: number): 'send' | 'research_more' | 'skip' {
  if (score >= 10) return 'send'
  if (score >= 7) return 'research_more'
  return 'skip'
}

function clipText(value: string, max = 500): string {
  const oneLine = value.replace(/\s+/g, ' ').trim()
  if (oneLine.length <= max) return oneLine
  return oneLine.slice(0, max)
}

function mapQualificationToVerdict(
  qualification: string | null | undefined,
): 'send' | 'research_more' | 'skip' {
  if (qualification === 'strong' || qualification === 'worth_pursuing') return 'send'
  if (qualification === 'maybe') return 'research_more'
  return 'skip'
}

function mapSignalsToLegacyType(signals: string[]): number | null {
  if (signals.includes('hiring') || signals.includes('hiring_pressure')) return 1
  if (signals.includes('freelance_project_need')) return 2
  if (signals.includes('growth_signal') || signals.includes('launch')) return 3
  if (signals.includes('funding')) return 3
  if (signals.includes('technical_problem') || signals.includes('rebuild') || signals.includes('migration')) return 6
  if (signals.includes('explicit_ask')) return 7
  return null
}

function hasProviderCreds(): boolean {
  return Boolean(
    process.env.OPENCODE_API_KEY
    || process.env.GROQ_API_KEY
    || process.env.OPENAI_API_KEY
    || process.env.LONGCAT_API_KEY,
  )
}

function isSyntheticCompany(company: string | null | undefined): boolean {
  const name = String(company ?? '').trim()
  if (!name) return false
  return (
    /^Acme Email Co-/i.test(name)
    || /^Bulk Lead\s+\d+/i.test(name)
    || /^Orch Proof/i.test(name)
    || /^Orchestration Proof/i.test(name)
  )
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.')
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await supabase
    .from('leads')
    .select('id, company, contact_name, contact_title, title_raw, location_raw, url, raw_input, signal_type, signal_evidence, score, verdict, canonical_score, canonical_intelligence, extraction_confidence, created_at')
    .order('created_at', { ascending: false })

  if (error) throw error
  const leads = (data ?? []) as LeadRow[]

  const counters = {
    total: leads.length,
    missingRawInput: 0,
    missingSignalEvidence: 0,
    placeholderCompany: 0,
    placeholderContactName: 0,
    placeholderContactTitle: 0,
    invalidUrl: 0,
    missingExtractionConfidence: 0,
    missingCanonicalBlob: 0,
    verdictNull: 0,
    verdictMismatchLegacyScore: 0,
    syntheticLeads: 0,
  }

  const safePatches: Array<{ id: string; patch: Record<string, unknown> }> = []

  for (const lead of leads) {
    const patch: Record<string, unknown> = {}

    if (isSyntheticCompany(lead.company)) {
      counters.syntheticLeads += 1
      if (options.archiveSynthetic) {
        patch.status = 'dead'
        if (lead.verdict == null) patch.verdict = 'skip'
      }
    }

    if (!lead.raw_input || !lead.raw_input.trim()) counters.missingRawInput += 1

    if (!lead.signal_evidence || !lead.signal_evidence.trim()) {
      counters.missingSignalEvidence += 1
      if (lead.raw_input && lead.raw_input.trim()) {
        patch.signal_evidence = clipText(lead.raw_input)
      }
    }

    if (isPlaceholder(lead.company)) counters.placeholderCompany += 1
    if (isPlaceholder(lead.contact_name)) {
      counters.placeholderContactName += 1
      patch.contact_name = null
    }
    if (isPlaceholder(lead.contact_title)) {
      counters.placeholderContactTitle += 1
      patch.contact_title = null
    }
    if (isPlaceholder(lead.title_raw)) {
      patch.title_raw = null
    }
    if (isPlaceholder(lead.location_raw)) {
      patch.location_raw = null
    }

    if (lead.url) {
      try {
        // eslint-disable-next-line no-new
        new URL(lead.url)
      } catch {
        counters.invalidUrl += 1
        patch.url = null
      }
    }

    if (lead.extraction_confidence == null) {
      counters.missingExtractionConfidence += 1
      patch.extraction_confidence = 50
    }

    if (!lead.canonical_intelligence) counters.missingCanonicalBlob += 1

    if (lead.verdict == null) {
      counters.verdictNull += 1
      if (lead.score != null) patch.verdict = expectedVerdict(lead.score)
      else patch.verdict = 'skip'
    } else if (lead.score != null) {
      const expected = expectedVerdict(lead.score)
      if (lead.verdict !== expected) {
        counters.verdictMismatchLegacyScore += 1
        patch.verdict = expected
      }
    }

    if (Object.keys(patch).length > 0) {
      safePatches.push({ id: lead.id, patch })
    }
  }

  console.log('\nLead Intelligence Audit')
  console.log(JSON.stringify(counters, null, 2))
  console.log(`safePatchCandidates=${safePatches.length}`)

  let safeUpdated = 0
  if (options.fixSafe) {
    for (const item of safePatches) {
      const { error: updateError } = await supabase
        .from('leads')
        .update(item.patch)
        .eq('id', item.id)
      if (updateError) {
        console.error(`safe-fix failed lead=${item.id}: ${updateError.message}`)
        continue
      }
      safeUpdated += 1
    }
  }

  let extracted = 0
  let extractionFailures = 0
  if (options.extractReal) {
    if (!hasProviderCreds()) {
      throw new Error('No live AI provider credentials set (OPENCODE_API_KEY/GROQ_API_KEY/OPENAI_API_KEY/LONGCAT_API_KEY).')
    }

    const { produceCanonicalIntelligence } = await import('../src/lib/intelligence-v2/orchestrator')

    const candidates = leads.filter((lead) => {
      if (!lead.raw_input || !lead.raw_input.trim()) return false
      if (options.all) return true
      return lead.canonical_intelligence == null
    })

    const toProcess = options.limit ? candidates.slice(0, options.limit) : candidates
    console.log(`realExtractionCandidates=${toProcess.length}`)

    for (const lead of toProcess) {
      try {
        const run = await produceCanonicalIntelligence(lead.raw_input as string, {
          knownSourceUrl: lead.url,
          strictLiveMode: true,
        })
        const canonical = run.intelligence
        const signals = canonical.intelligence.opportunity.signals ?? []
        const mappedSignalType = mapSignalsToLegacyType(signals)

        const patch: Record<string, unknown> = {
          canonical_score: canonical.canonicalScore,
          score_version: canonical.scoreVersion,
          scored_at: canonical.scoredAt,
          canonical_intelligence: canonical,
          raw_source_data: canonical.rawSource,
          score_breakdown: canonical.scoreBreakdown,
          remote_eligibility: canonical.remoteEligibility,
          evidence_ledger: canonical.evidenceLedger,
          extraction_completeness: canonical.extractionCompleteness,
          verdict: mapQualificationToVerdict(canonical.qualification),
          extraction_confidence: Math.max(0, Math.min(100, Math.round(canonical.confidence ?? 50))),
        }

        if ((!lead.contact_name || isPlaceholder(lead.contact_name)) && canonical.intelligence.person.fullName) {
          patch.contact_name = canonical.intelligence.person.fullName
        }
        if ((!lead.contact_title || isPlaceholder(lead.contact_title)) && canonical.intelligence.person.title) {
          patch.contact_title = canonical.intelligence.person.title
        }
        if ((!lead.title_raw || isPlaceholder(lead.title_raw)) && canonical.intelligence.person.title) {
          patch.title_raw = canonical.intelligence.person.title
        }
        if ((!lead.location_raw || isPlaceholder(lead.location_raw)) && canonical.intelligence.person.location) {
          patch.location_raw = canonical.intelligence.person.location
        }

        if ((lead.signal_type == null) && mappedSignalType != null) {
          patch.signal_type = mappedSignalType
        }

        if ((!lead.signal_evidence || !lead.signal_evidence.trim()) && canonical.intelligence.opportunity?.description) {
          patch.signal_evidence = clipText(canonical.intelligence.opportunity.description)
        }

        const { error: updateError } = await supabase
          .from('leads')
          .update(patch)
          .eq('id', lead.id)

        if (updateError) {
          extractionFailures += 1
          console.error(`extract-update failed lead=${lead.id}: ${updateError.message}`)
          continue
        }

        extracted += 1
        const provider = canonical.extractionCallLog?.[0]?.provider ?? 'unknown'
        console.log(`re-extracted lead=${lead.id} score=${canonical.canonicalScore} provider=${provider}`)
      } catch (err) {
        extractionFailures += 1
        const message = err instanceof Error ? err.message : String(err)
        console.error(`extraction failed lead=${lead.id}: ${message}`)
      }
    }
  }

  console.log('\nApplied Changes')
  console.log(JSON.stringify({ safeUpdated, extracted, extractionFailures }, null, 2))
}

main().catch((err) => {
  console.error('FATAL:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
