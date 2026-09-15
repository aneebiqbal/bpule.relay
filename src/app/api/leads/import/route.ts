import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { computeScore } from '@/lib/score/rubric'
import type { ExtractedLead, SignalId } from '@/lib/domain/types'

interface CsvRow {
  company: string
  contactName?: string
  contactTitle?: string
  url?: string
  signalType?: string
  signalEvidence?: string
  verbatimQuote?: string
  tags?: string
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return []

  const parseLine = (line: string): string[] => {
    const values: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    values.push(current.trim())
    return values
  }

  const headers = parseLine(lines[0]).map((h) => h.trim().toLowerCase())
  const rows: CsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i])
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? ''
    })
    rows.push({
      company: row.company ?? '',
      contactName: row.contactname || row['contact name'] || undefined,
      contactTitle: row.contacttitle || row['contact title'] || undefined,
      url: row.url || undefined,
      signalType: row.signaltype || row['signal type'] || undefined,
      signalEvidence: row.signalevidence || row['signal evidence'] || undefined,
      verbatimQuote: row.verbatimquote || row['verbatim quote'] || undefined,
      tags: row.tags || undefined,
    })
  }
  return rows
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const csvText = typeof body.csv === 'string' ? body.csv : ''
  const fileName = typeof body.fileName === 'string' ? body.fileName : null
  if (!csvText) {
    return NextResponse.json({ error: 'CSV text is required.' }, { status: 400 })
  }

  let store
  try {
    store = await createScoutStore()
  } catch (err) {
    return NextResponse.json(
      { error: 'Not signed in.' },
      { status: 401 },
    )
  }

  const rulebook = await store.getRulebook()

  const rows = parseCsv(csvText)
  const results: Array<{
    row: number
    status: 'imported' | 'duplicate' | 'invalid'
    reason?: string
    leadId?: string
  }> = []
  let imported = 0
  let duplicates = 0
  let invalid = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row.company.trim() || !row.signalEvidence?.trim()) {
      results.push({ row: i + 2, status: 'invalid', reason: 'Missing company or signal evidence.' })
      invalid++
      continue
    }

    const signalType = Number(row.signalType)
    if (!signalType || signalType < 1 || signalType > 7) {
      results.push({ row: i + 2, status: 'invalid', reason: 'signalType must be 1-7.' })
      invalid++
      continue
    }

    const extracted: ExtractedLead = {
      name: row.contactName?.trim() || null,
      title: row.contactTitle?.trim() || null,
      company: row.company.trim(),
      url: row.url?.trim() || null,
      signalType: signalType as SignalId,
      signalEvidence: row.signalEvidence.trim(),
      verbatimQuote: row.verbatimQuote?.trim() || null,
      tags: row.tags?.split(/[,;]/).map((t) => t.trim()).filter(Boolean) ?? [],
    }

    const score = computeScore(extracted, rulebook!)

    const createResult = await store.createLead({
      company: extracted.company,
      contactName: extracted.name,
      contactTitle: extracted.title,
      url: extracted.url,
      signalType: extracted.signalType,
      signalEvidence: extracted.signalEvidence,
      verbatimQuote: extracted.verbatimQuote,
      tags: extracted.tags,
    })

    if (createResult.blocked) {
      results.push({ row: i + 2, status: 'duplicate', reason: createResult.reason })
      duplicates++
      continue
    }

    if (createResult.lead) {
      await store.updateLeadScore(createResult.lead.id, score)
      results.push({ row: i + 2, status: 'imported', leadId: createResult.lead.id })
      imported++
    }
  }

  await store.logCsvImport({
    organizationId: store.organizationId,
    fileName,
    totalRows: rows.length,
    imported,
    duplicates,
    invalid,
    details: results,
  })

  return NextResponse.json({ imported, duplicates, invalid, total: rows.length, results })
}
