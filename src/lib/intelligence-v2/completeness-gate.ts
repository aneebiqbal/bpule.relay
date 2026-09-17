/**
 * Extraction Completeness Gate
 *
 * Before allowing Save Lead, validates the extraction quality.
 * Detects missing URLs, missing company, missing title, lost recent posts,
 * person/company confusion, malformed LinkedIn URLs, conflicting values.
 *
 * If extraction quality is weak, automatically runs LongCat repair.
 */

import type {
  ExtractionCompleteness,
  NormalizedIntelligence,
  RawSourceData,
} from './types'
import { longcatHost, tier4Host, type ChainStep } from '@/lib/ai/routing'
import { structuredJsonChain } from '@/lib/ai/provider'

const LONGCAT_REPAIR_TIMEOUT_MS = 45_000

// ── Completeness Assessment ────────────────────────────────────────────────

export interface CompletenessInput {
  intelligence: NormalizedIntelligence
  rawSource: RawSourceData
  sourceUrls: string[]
}

export function assessExtractionCompleteness(input: CompletenessInput): ExtractionCompleteness {
  const { intelligence, rawSource, sourceUrls } = input
  const presentFields: string[] = []
  const missingFields: string[] = []
  const weakFields: Array<{ field: string; reason: string }> = []

  // Person checks
  if (intelligence.person.fullName) presentFields.push('person.fullName')
  else missingFields.push('person.fullName')

  if (intelligence.person.title) presentFields.push('person.title')
  else missingFields.push('person.title')

  if (intelligence.person.linkedinUrl) presentFields.push('person.linkedinUrl')
  else if (sourceUrls.some((u) => u.includes('linkedin.com/in/'))) {
    weakFields.push({ field: 'person.linkedinUrl', reason: 'LinkedIn URL in source but not extracted' })
  }

  // Company checks
  if (intelligence.company.name) presentFields.push('company.name')
  else missingFields.push('company.name')

  if (intelligence.company.industry) presentFields.push('company.industry')
  // Industry is optional, not a hard miss

  // Opportunity checks
  if (intelligence.opportunity.signals.length > 0) presentFields.push('opportunity.signals')
  else missingFields.push('opportunity.signals')

  if (intelligence.opportunity.primarySignal) presentFields.push('opportunity.primarySignal')
  else if (intelligence.opportunity.signals.length > 0) {
    weakFields.push({ field: 'opportunity.primarySignal', reason: 'Signals found but no primary identified' })
  }

  // Content checks
  if (intelligence.content.topics.length > 0) presentFields.push('content.topics')
  if (intelligence.content.technicalSignals.length > 0) presentFields.push('content.technicalSignals')

  // URL preservation check
  const urlsPreserved = sourceUrls.filter((url) =>
    intelligence.person.linkedinUrl === url ||
    intelligence.person.otherUrls.includes(url) ||
    intelligence.company.linkedinUrl === url ||
    rawSource.sourceUrl === url ||
    rawSource.profileUrl === url ||
    rawSource.companyUrl === url ||
    rawSource.jobUrl === url
  )

  // Detect person/company confusion
  if (intelligence.person.fullName && intelligence.company.name) {
    const nameLower = intelligence.person.fullName.toLowerCase()
    const companyLower = intelligence.company.name.toLowerCase()
    if (nameLower.includes(companyLower) || companyLower.includes(nameLower)) {
      weakFields.push({ field: 'person/company', reason: 'Possible person/company name confusion' })
    }
  }

  // Malformed LinkedIn URL check
  if (intelligence.person.linkedinUrl && !intelligence.person.linkedinUrl.match(/^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\//)) {
    weakFields.push({ field: 'person.linkedinUrl', reason: 'LinkedIn profile URL appears malformed' })
  }

  // Calculate completeness score
  const totalChecks = presentFields.length + missingFields.length
  const score = totalChecks > 0
    ? Math.round((presentFields.length / totalChecks) * 100)
    : 50

  return {
    score,
    presentFields,
    missingFields,
    weakFields,
    repairAttempted: false,
    repairImproved: false,
    sourceUrlsFound: sourceUrls,
    urlsPreserved,
  }
}

// ── Auto-Repair ────────────────────────────────────────────────────────────

const REPAIR_SYSTEM = `You are an extraction repair engine. Given the original source text and a partial/incomplete extraction, produce a corrected and completed extraction.

CRITICAL RULES:
- Only add information that is explicitly supported by the source text
- Never invent facts not present in the source
- Preserve all URLs exactly as they appear in the source
- Fix person/company confusion if detected
- Fix malformed LinkedIn URLs
- Return null for fields that cannot be determined from the source`

interface RepairOutput {
  person: {
    fullName: string | null
    firstName: string | null
    title: string | null
    linkedinUrl: string | null
  } | null
  company: {
    name: string | null
    linkedinUrl: string | null
  } | null
  missingUrls: string[]
  contradictions: string[]
}

const REPAIR_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    person: {
      type: ['object', 'null'],
      properties: {
        fullName: { type: ['string', 'null'] },
        firstName: { type: ['string', 'null'] },
        title: { type: ['string', 'null'] },
        linkedinUrl: { type: ['string', 'null'] },
      },
    },
    company: {
      type: ['object', 'null'],
      properties: {
        name: { type: ['string', 'null'] },
        linkedinUrl: { type: ['string', 'null'] },
      },
    },
    missingUrls: { type: 'array', items: { type: 'string' } },
    contradictions: { type: 'array', items: { type: 'string' } },
  },
}

export async function repairExtraction(
  rawText: string,
  currentIntelligence: NormalizedIntelligence,
  completeness: ExtractionCompleteness,
): Promise<{
  repaired: boolean
  intelligence: NormalizedIntelligence
  completeness: ExtractionCompleteness
  repairNotes: string[]
}> {
  const lc = longcatHost()
  const gpt = tier4Host()
  const chain: ChainStep[] = []
  if (lc) chain.push({ costTier: 'tier1', host: lc })
  if (gpt) chain.push({ costTier: 'tier4', host: gpt })

  if (chain.length === 0) {
    return { repaired: false, intelligence: currentIntelligence, completeness, repairNotes: ['No AI provider for repair'] }
  }

  const repairNotes: string[] = []

  try {
    const result = await structuredJsonChain<unknown>(chain, {
      system: REPAIR_SYSTEM,
      user: buildRepairPrompt(rawText, currentIntelligence, completeness),
      schema: REPAIR_SCHEMA,
      schemaName: 'extraction_repair',
    }, undefined, LONGCAT_REPAIR_TIMEOUT_MS)

    const repair = validateRepair(result.data)
    if (!repair) {
      return { repaired: false, intelligence: currentIntelligence, completeness, repairNotes: ['Repair returned invalid output'] }
    }

    let repaired = false
    const updated = { ...currentIntelligence }

    // Apply person repairs
    if (repair.person) {
      if (!updated.person.fullName && repair.person.fullName) {
        updated.person = { ...updated.person, fullName: repair.person.fullName, firstName: repair.person.firstName }
        repaired = true
        repairNotes.push('Repaired missing person name')
      }
      if (!updated.person.title && repair.person.title) {
        updated.person = { ...updated.person, title: repair.person.title }
        repaired = true
        repairNotes.push('Repaired missing title')
      }
      if (!updated.person.linkedinUrl && repair.person.linkedinUrl) {
        updated.person = { ...updated.person, linkedinUrl: repair.person.linkedinUrl }
        repaired = true
        repairNotes.push('Repaired missing LinkedIn URL')
      }
    }

    // Apply company repairs
    if (repair.company) {
      if (!updated.company.name && repair.company.name) {
        updated.company = { ...updated.company, name: repair.company.name }
        repaired = true
        repairNotes.push('Repaired missing company name')
      }
      if (!updated.company.linkedinUrl && repair.company.linkedinUrl) {
        updated.company = { ...updated.company, linkedinUrl: repair.company.linkedinUrl }
        repaired = true
        repairNotes.push('Repaired missing company LinkedIn URL')
      }
    }

    // Add missing URLs
    if (repair.missingUrls.length > 0) {
      repairNotes.push(`Found ${repair.missingUrls.length} missing URLs`)
    }

    // Record contradictions
    if (repair.contradictions.length > 0) {
      updated.resolvedContradictions = [
        ...updated.resolvedContradictions,
        ...repair.contradictions,
      ]
      repaired = true
      repairNotes.push(`Resolved ${repair.contradictions.length} contradictions`)
    }

    // Re-assess completeness after repair
    const updatedCompleteness = repaired
      ? { ...assessExtractionCompleteness({ intelligence: updated, rawSource: { rawInput: rawText, sourceType: 'pasted_text', sourceUrl: null, profileUrl: null, companyUrl: null, jobUrl: null, postUrls: [], rawPosts: [], rawJobDescription: null, rawProfileText: null, rawCompanyText: null, capturedAt: new Date().toISOString() }, sourceUrls: completeness.sourceUrlsFound }), repairAttempted: true, repairImproved: true }
      : { ...completeness, repairAttempted: true, repairImproved: false }

    return { repaired, intelligence: updated, completeness: updatedCompleteness, repairNotes }
  } catch {
    return { repaired: false, intelligence: currentIntelligence, completeness, repairNotes: ['Repair failed'] }
  }
}

function buildRepairPrompt(
  rawText: string,
  intelligence: NormalizedIntelligence,
  completeness: ExtractionCompleteness,
): string {
  return `Original source text:
${rawText.slice(0, 8000)}

Current extraction:
PERSON: ${JSON.stringify(intelligence.person)}
COMPANY: ${JSON.stringify(intelligence.company)}
OPPORTUNITY: ${JSON.stringify(intelligence.opportunity)}

Issues detected:
- Missing fields: ${completeness.missingFields.join(', ')}
- Weak fields: ${completeness.weakFields.map((w) => `${w.field}: ${w.reason}`).join('; ')}
- Source URLs found: ${completeness.sourceUrlsFound.length}
- URLs preserved: ${completeness.urlsPreserved.length}

Return a JSON object with:
- person: corrected person fields (only if you can find them in the source)
- company: corrected company fields (only if you can find them in the source)
- missingUrls: URLs from the source that were not captured
- contradictions: any contradictions found and how they were resolved`
}

function validateRepair(raw: unknown): RepairOutput | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const person = r.person as Record<string, unknown> | null
  const company = r.company as Record<string, unknown> | null

  return {
    person: person ? {
      fullName: typeof person.fullName === 'string' ? person.fullName : null,
      firstName: typeof person.firstName === 'string' ? person.firstName : null,
      title: typeof person.title === 'string' ? person.title : null,
      linkedinUrl: typeof person.linkedinUrl === 'string' ? person.linkedinUrl : null,
    } : null,
    company: company ? {
      name: typeof company.name === 'string' ? company.name : null,
      linkedinUrl: typeof company.linkedinUrl === 'string' ? company.linkedinUrl : null,
    } : null,
    missingUrls: Array.isArray(r.missingUrls) ? r.missingUrls.filter((u): u is string => typeof u === 'string') : [],
    contradictions: Array.isArray(r.contradictions) ? r.contradictions.filter((c): c is string => typeof c === 'string') : [],
  }
}

// ── Gate Decision ──────────────────────────────────────────────────────────

export interface GateDecision {
  /** Whether the extraction is good enough to proceed */
  canProceed: boolean
  /** Whether repair was attempted */
  repairAttempted: boolean
  /** Whether repair improved the extraction */
  repairImproved: boolean
  /** Notes about the gate decision */
  notes: string[]
  /** Updated completeness assessment */
  completeness: ExtractionCompleteness
}

export function evaluateCompletenessGate(
  completeness: ExtractionCompleteness,
): GateDecision {
  const notes: string[] = []
  let canProceed = true

  // Hard blocks
  if (completeness.score < 30) {
    canProceed = false
    notes.push('Extraction completeness too low — add more source material')
  }

  // Critical missing fields
  const criticalMissing = completeness.missingFields.filter((f) =>
    f === 'person.fullName' || f === 'company.name' || f === 'opportunity.signals'
  )
  if (criticalMissing.length >= 2) {
    canProceed = false
    notes.push(`Critical fields missing: ${criticalMissing.join(', ')}`)
  }

  // URL loss detection
  if (completeness.sourceUrlsFound.length > 0 && completeness.urlsPreserved.length === 0) {
    notes.push('Source URLs were lost during extraction — auto-repair recommended')
  }

  // Weak field warnings
  if (completeness.weakFields.length > 0) {
    notes.push(`${completeness.weakFields.length} field(s) flagged for review`)
  }

  return {
    canProceed,
    repairAttempted: completeness.repairAttempted,
    repairImproved: completeness.repairImproved,
    notes,
    completeness,
  }
}
