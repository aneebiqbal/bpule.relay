/**
 * Minimal single-column ATS-safe PDF renderer.
 *
 * Base-14 Helvetica, standard encoding, real text layer (no images, no
 * multi-column layout). Deliberately dependency-free: the app already ships
 * pdf-parse for extraction, and a resume needs no decorative PDF engine.
 */

import { loadPdfParse } from '@/lib/pdf/load-pdf-parse'
import type { ResumeLayout, ResumePaper } from './types'

function escapePdf(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function sanitize(text: string): string {
  // WinAnsi is close enough to Latin-1 for a resume; anything outside the
  // PDF's base encoding becomes a visible placeholder rather than a broken
  // glyph. Non-ASCII names are the only realistic case.
  return text
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2192/g, '->')
    .replace(/\u2022/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '?')
    .replace(/[\u0080-\u009F]/g, '?')
}

function wrapLine(line: string, width: number): string[] {
  if (line.length <= width) return [line]
  const out: string[] = []
  let current = line
  while (current.length > width) {
    let cut = current.lastIndexOf(' ', width)
    if (cut <= 0) cut = width
    out.push(current.slice(0, cut).trimEnd())
    current = current.slice(cut).trimStart()
  }
  if (current) out.push(current)
  return out
}

const LAYOUTS: Record<ResumeLayout, { font: string; bold: string; size: number; leading: number; margin: number; width: number }> = {
  modern: { font: 'Helvetica', bold: 'Helvetica-Bold', size: 10.5, leading: 15, margin: 54, width: 92 },
  technical: { font: 'Courier', bold: 'Courier-Bold', size: 9.5, leading: 13, margin: 48, width: 92 },
  minimal: { font: 'Helvetica', bold: 'Helvetica-Bold', size: 9.5, leading: 12, margin: 60, width: 88 },
  ultra: { font: 'Helvetica', bold: 'Helvetica-Bold', size: 10, leading: 13, margin: 50, width: 96 },
}

const PAPERS: Record<ResumePaper, { width: number; height: number }> = {
  letter: { width: 612, height: 792 },
  a4: { width: 595, height: 842 },
}

type LineKind = 'heading' | 'bullet' | 'normal'

function kindFor(line: string): LineKind {
  const trimmed = line.trim()
  if (/^(experience|projects|skills|certifications|education|summary|links)$/i.test(trimmed)) return 'heading'
  if (trimmed.length > 1 && trimmed === trimmed.toUpperCase() && trimmed.length < 42 && /[A-Z]/.test(trimmed)) return 'heading'
  if (/^[-•]\s+/.test(trimmed)) return 'bullet'
  return 'normal'
}

export function renderResumePdf(sourceText: string, layout: ResumeLayout = 'modern', paper: ResumePaper = 'letter'): Buffer {
  const style = LAYOUTS[layout] ?? LAYOUTS.modern
  const sheet = PAPERS[paper] ?? PAPERS.letter
  const items = sourceText
    .split(/\r?\n/)
    .flatMap((line) => wrapLine(line.replace(/\t/g, '    '), style.width))
    .map((line) => ({ line, kind: kindFor(line) }))

  const pages: Array<Array<{ line: string; kind: LineKind }>> = [[]]
  let y = sheet.height - style.margin
  for (const item of items) {
    const leading = item.kind === 'heading' ? style.leading + 3 : style.leading
    if (y - leading < style.margin) {
      pages.push([])
      y = sheet.height - style.margin
    }
    pages[pages.length - 1].push(item)
    y -= leading
  }
  if (pages.length === 0) pages.push([{ line: '', kind: 'normal' }])

  const objects: string[] = []
  const pageIds: number[] = []
  let nextId = 5
  const plan = pages.map(() => {
    const pageId = nextId
    nextId += 2
    pageIds.push(pageId)
    return { pageId, contentId: pageId + 1 }
  })
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /${style.font} >>`
  objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /${style.bold} >>`

  pages.forEach((lines, index) => {
    const { pageId, contentId } = plan[index]
    const commands: string[] = []
    const annots: Array<{ id: number; rect: number[]; url: string }> = []
    let currentY = sheet.height - style.margin
    for (const item of lines) {
      const font = item.kind === 'heading' ? 'F2' : 'F1'
      const size = item.kind === 'heading' ? style.size + 1.5 : style.size
      const x = item.kind === 'bullet' ? style.margin + 12 : style.margin
      const text = item.kind === 'heading' ? item.line.trim() : item.line
      commands.push(`BT /${font} ${size} Tf ${x} ${currentY} Td (${escapePdf(sanitize(text))}) Tj ET`)
      const urlMatch = text.match(/https?:\/\/[^\s,)]+/)
      if (urlMatch && urlMatch.index !== undefined) {
        const charWidth = size * 0.5
        annots.push({
          id: nextId++,
          rect: [
            x + urlMatch.index * charWidth,
            currentY - 2,
            x + (urlMatch.index + urlMatch[0].length) * charWidth,
            currentY + size,
          ],
          url: urlMatch[0],
        })
      }
      currentY -= item.kind === 'heading' ? style.leading + 3 : style.leading
    }
    const content = commands.join('\n')
    const annotsRefs = annots.map((annot) => `${annot.id} 0 R`).join(' ')
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${sheet.width} ${sheet.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> ${annots.length > 0 ? `/Annots [${annotsRefs}] ` : ''}/Contents ${contentId} 0 R >>`
    objects[contentId] = `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`
    for (const annot of annots) {
      objects[annot.id] = `<< /Type /Annot /Subtype /Link /Rect [${annot.rect.join(' ')}] /Border [0 0 0] /A << /S /URI /URI (${escapePdf(annot.url)}) >> >>`
    }
  })

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = [0]
  for (let i = 1; i < objects.length; i++) {
    if (!objects[i]) continue
    offsets[i] = Buffer.byteLength(pdf, 'latin1')
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xrefStart = Buffer.byteLength(pdf, 'latin1')
  const maxId = objects.length - 1
  pdf += `xref\n0 ${maxId + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let i = 1; i <= maxId; i++) {
    pdf += `${String(offsets[i] ?? 0).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
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
