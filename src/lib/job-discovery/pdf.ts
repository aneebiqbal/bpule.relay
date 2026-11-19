/**
 * Minimal single-column ATS-safe PDF renderer.
 *
 * Base-14 Helvetica, standard encoding, real text layer (no images, no
 * multi-column layout). Deliberately dependency-free: the app already ships
 * pdf-parse for extraction, and a resume needs no decorative PDF engine.
 */

import { loadPdfParse } from '@/lib/pdf/load-pdf-parse'
import type { ResumeLayout } from './types'

function escapePdf(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function sanitize(text: string): string {
  // WinAnsi is close enough to Latin-1 for a resume; anything outside the
  // PDF's base encoding becomes a visible placeholder rather than a broken
  // glyph. Non-ASCII names are the only realistic case.
  return text
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

const LAYOUTS: Record<ResumeLayout, { font: string; size: number; leading: number; margin: number; width: number }> = {
  modern: { font: 'Helvetica', size: 10.5, leading: 15, margin: 54, width: 92 },
  technical: { font: 'Courier', size: 9.5, leading: 13, margin: 48, width: 92 },
  minimal: { font: 'Helvetica', size: 9.5, leading: 12, margin: 60, width: 88 },
}

export function renderResumePdf(sourceText: string, layout: ResumeLayout = 'modern'): Buffer {
  const style = LAYOUTS[layout] ?? LAYOUTS.modern
  const wrapped = sourceText
    .split(/\r?\n/)
    .flatMap((line) => wrapLine(line.replace(/\t/g, '    '), style.width))
  const perPage = Math.floor((792 - style.margin * 2) / style.leading)
  const pages: string[][] = []
  for (let i = 0; i < wrapped.length; i += perPage) pages.push(wrapped.slice(i, i + perPage))
  if (pages.length === 0) pages.push([''])

  const objects: string[] = []
  const pageIds: number[] = []
  let nextId = 4
  for (let i = 0; i < pages.length; i++) {
    pageIds.push(nextId)
    nextId += 2
  }
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /${style.font} >>`

  pages.forEach((lines, index) => {
    const pageId = pageIds[index]
    const contentId = pageId + 1
    const content = [
      'BT',
      `/F1 ${style.size} Tf`,
      `${style.margin} ${792 - style.margin} Td`,
      `${style.leading} TL`,
      ...lines.map((line) => `(${escapePdf(sanitize(line))}) Tj T*`),
      'ET',
    ].join('\n')
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`
    objects[contentId] = `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`
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
