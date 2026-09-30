import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'

export interface ParsedDocument {
  content: string
  pages: string[]
  pageCount: number
  needsOcr: boolean
  warnings: string[]
}

const MAX_PAGES = 50
const MIN_TEXT_PER_PAGE = 20

export async function parseDocument(buffer: ArrayBuffer, mimeType: string, filename: string): Promise<ParsedDocument> {
  switch (mimeType) {
    case 'application/pdf':
      return parsePdf(buffer)
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/msword':
      return parseDocx(buffer)
    case 'text/plain':
    case 'text/markdown':
    case 'text/csv':
    case 'text/x-markdown':
      return parseText(buffer)
    default:
      throw new Error(`Unsupported file type: ${mimeType} (${filename})`)
  }
}

async function parsePdf(buffer: ArrayBuffer): Promise<ParsedDocument> {
  const warnings: string[] = []
  try {
    const uint8 = new Uint8Array(buffer)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parser = new PDFParse({ data: uint8 as any, withCredentials: false, verbosity: 0 })
    const textResult = await parser.getText()
    const result = { text: textResult.text, numpages: textResult.total }

    const pages = splitPdfPages(result.text, result.numpages)
    const needsOcr = detectOcrNeeded(pages)

    if (needsOcr) {
      warnings.push('Document appears to be scanned/image-based. Text extraction may be incomplete.')
    }

    if (result.numpages > MAX_PAGES) {
      warnings.push(`Document truncated to ${MAX_PAGES} pages.`)
    }

    return {
      content: normalizeText(result.text),
      pages: pages.map(normalizeText),
      pageCount: Math.min(result.numpages, MAX_PAGES),
      needsOcr,
      warnings,
    }
  } catch (err) {
    throw new Error(`Failed to parse PDF: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }
}

async function parseDocx(buffer: ArrayBuffer): Promise<ParsedDocument> {
  const warnings: string[] = []
  try {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) })

    if (result.messages.length > 0) {
      const errors = result.messages.filter((m) => m.type === 'error')
      if (errors.length > 0) {
        warnings.push(`DOCX parsing warnings: ${errors.map((e) => e.message).join('; ')}`)
      }
    }

    const content = normalizeText(result.value)
    return {
      content,
      pages: [content],
      pageCount: 1,
      needsOcr: false,
      warnings,
    }
  } catch (err) {
    throw new Error(`Failed to parse DOCX: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }
}

function parseText(buffer: ArrayBuffer): ParsedDocument {
  const decoder = new TextDecoder('utf-8', { fatal: false })
  const raw = decoder.decode(buffer)
  const content = normalizeText(raw)
  return {
    content,
    pages: [content],
    pageCount: 1,
    needsOcr: false,
    warnings: [],
  }
}

function splitPdfPages(fullText: string, pageCount: number): string[] {
  const separator = /\f|\n\s*\f\s*\n/
  const rawPages = fullText.split(separator).filter((p) => p.trim().length > 0)

  if (rawPages.length >= pageCount) {
    return rawPages.slice(0, pageCount)
  }

  return [fullText]
}

function detectOcrNeeded(pages: string[]): boolean {
  const textPages = pages.filter((p) => p.trim().length > MIN_TEXT_PER_PAGE)
  const ratio = textPages.length / Math.max(pages.length, 1)
  return ratio < 0.3 && pages.length > 1
}

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/^\s+|\s+$/g, '')
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_').slice(0, 200)
}

export function contentHash(content: string): string {
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}
