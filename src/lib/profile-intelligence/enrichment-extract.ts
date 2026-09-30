import { parseDocument } from './parse-document'
import { parseSpreadsheet, spreadsheetToText } from './parse-spreadsheet'
import { runExtractionPipeline, extractForSinglePerson } from './pipeline'
import type { SourceExtraction } from './enrichment'

export const SPREADSHEET_MIMES = new Set([
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
])

export interface ExtractorInput {
  buffer: ArrayBuffer
  mimeType: string
  filename: string
  sourceId: string
  fingerprint: string
  organizationId: string
  profileName: string | null
}

/** Pluggable so tests can run the full enrichment flow deterministically. */
export type SourceExtractor = (input: ExtractorInput) => Promise<{ extraction: SourceExtraction; parsedContent: string; pageCount: number | null }>

export const aiSourceExtractor: SourceExtractor = async (input) => {
  const extractedAt = new Date().toISOString()
  const base = { sourceId: input.sourceId, filename: input.filename, fingerprint: input.fingerprint, extractedAt }

  if (SPREADSHEET_MIMES.has(input.mimeType)) {
    const sheet = await parseSpreadsheet(input.buffer, input.mimeType, input.filename)
    const people: SourceExtraction['people'] = []
    const reviews: SourceExtraction['reviews'] = []
    const cellValues: string[] = []
    const groups = [...sheet.personGroups.entries()]
    const named = groups.filter(([n]) => !n.startsWith('__unassigned'))
    // A sheet with no person column (e.g. a project list) belongs to the chosen profile.
    const usable = named.length > 0 ? named : groups.map(([, rows]) => [input.profileName ?? '', rows] as const)
    for (const [personName, rows] of usable) {
      for (const row of rows) for (const v of Object.values(row.raw)) if (v != null && String(v).trim()) cellValues.push(String(v))
      const text = spreadsheetToText(personName || (input.profileName ?? 'Profile'), [...rows])
      const single = await extractForSinglePerson(text, input.organizationId)
      people.push({ name: personName || (single.facts.fullName ?? ''), facts: single.facts, projects: single.projects, proofs: single.proofs })
      reviews.push(...single.reviews.map((r) => ({ ...r, assignedPersonName: r.assignedPersonName ?? (personName || null) })))
    }
    return {
      extraction: { ...base, isSpreadsheet: true, cellValues, people, reviews },
      parsedContent: JSON.stringify({ headers: sheet.headers, row_count: sheet.rows.length, warnings: sheet.warnings }).slice(0, 50000),
      pageCount: sheet.rows.length,
    }
  }

  const parsed = await parseDocument(input.buffer, input.mimeType, input.filename)
  const pipeline = await runExtractionPipeline(parsed, parsed.content, input.organizationId)
  let people: SourceExtraction['people'] = [...pipeline.factsByPerson.entries()].map(([name, facts]) => ({
    name,
    facts,
    projects: pipeline.projectsByPerson.get(name) ?? [],
    proofs: pipeline.proofsByPerson.get(name) ?? [],
  }))
  let reviews = pipeline.reviews
  if (people.length === 0 && parsed.content.trim().length > 0) {
    // Unnamed single-owner source (portfolio, case study, testimonial page).
    const single = await extractForSinglePerson(parsed.content, input.organizationId)
    people = [{ name: '', facts: single.facts, projects: single.projects, proofs: single.proofs }]
    reviews = single.reviews
  }
  return {
    extraction: { ...base, isSpreadsheet: false, people, reviews },
    parsedContent: parsed.content.slice(0, 50000),
    pageCount: parsed.pageCount,
  }
}
