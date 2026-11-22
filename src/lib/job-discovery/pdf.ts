/**
 * Single-column ATS-safe PDF renderer with an embedded Unicode font.
 *
 * PDFKit embeds a subsetted Unicode TTF (assets/fonts/RelaySans.ttf) covering
 * Latin, Arabic and Urdu, so names and supported languages render with real
 * glyphs and shaping instead of "?". The app already ships pdf-parse for
 * extraction.
 */

import fs from 'node:fs'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import { loadPdfParse } from '@/lib/pdf/load-pdf-parse'
import type { ResumeLayout, ResumePaper } from './types'

const FONT_PATH = process.env.RESUME_FONT_PATH ?? path.join(process.cwd(), 'assets', 'fonts', 'RelaySans.ttf')

const LAYOUTS: Record<ResumeLayout, { size: number; margin: number; lineGap: number }> = {
  modern: { size: 10.5, margin: 54, lineGap: 2 },
  technical: { size: 9.5, margin: 48, lineGap: 2 },
  minimal: { size: 9.5, margin: 60, lineGap: 1.5 },
  ultra: { size: 10, margin: 50, lineGap: 2 },
}

const PAPERS: Record<ResumePaper, { width: number; height: number }> = {
  letter: { width: 612, height: 792 },
  a4: { width: 595, height: 842 },
}

type LineKind = 'heading' | 'bullet' | 'normal'

function kindFor(line: string): LineKind {
  const trimmed = line.trim()
  if (/^(experience|projects|skills|certifications|education|summary|links|contact|selected achievements)$/i.test(trimmed)) return 'heading'
  if (trimmed.length > 1 && trimmed === trimmed.toUpperCase() && trimmed.length < 42 && /[A-Z]/.test(trimmed)) return 'heading'
  if (/^[-•]\s+/.test(trimmed)) return 'bullet'
  return 'normal'
}

export async function renderResumePdf(
  sourceText: string,
  layout: ResumeLayout = 'modern',
  paper: ResumePaper = 'letter',
): Promise<Buffer> {
  const style = LAYOUTS[layout] ?? LAYOUTS.modern
  const sheet = PAPERS[paper] ?? PAPERS.letter
  const doc = new PDFDocument({ size: [sheet.width, sheet.height], margin: style.margin, bufferPages: true })
  const chunks: Buffer[] = []
  doc.on('data', (chunk: Buffer) => chunks.push(chunk))
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  if (fs.existsSync(/* turbopackIgnore: true */ FONT_PATH)) doc.font(FONT_PATH)
  doc.fontSize(style.size)
  for (const rawLine of sourceText.split(/\r?\n/)) {
    const line = rawLine.replace(/\t/g, '    ')
    const kind = kindFor(line)
    doc.fontSize(kind === 'heading' ? style.size + 1.5 : style.size)
    const text = kind === 'heading' ? line.trim() : line
    if (!text) {
      doc.moveDown(0.5)
      continue
    }
    const url = text.match(/https?:\/\/[^\s,)]+/)
    doc.text(text, {
      indent: kind === 'bullet' ? 12 : 0,
      lineGap: style.lineGap,
      link: url ? url[0] : undefined,
    })
    if (kind === 'heading') doc.moveDown(0.3)
  }

  doc.end()
  return finished
}

/** Count pages without a full parse (fast, bounded). */
export function countPdfPages(buffer: Buffer): number {
  const matches = buffer.toString('latin1').match(/\/Type\s*\/Page\b/g)
  return matches ? matches.length : 0
}

/** Extract the text layer back out of a generated PDF. */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse, CanvasFactory } = await loadPdfParse()
  const parser = new PDFParse({ data: new Uint8Array(buffer), CanvasFactory })
  try {
    const result = await parser.getText()
    return result.text ?? ''
  } finally {
    await parser.destroy?.().catch(() => {})
  }
}
