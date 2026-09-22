import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { extractIdentityFromSource } from '@/lib/content/onboarding-extract'
import type { ExtractedCv } from '@/lib/jobs/types'

export const maxDuration = 30

const MAX_BYTES = 5 * 1024 * 1024
const MIN_TEXT_LENGTH = 40

type UploadedFile = {
  name: string
  size: number
  arrayBuffer: () => Promise<ArrayBuffer>
}

/**
 * Parses an uploaded CV (PDF with text or plain TXT) into the deterministic
 * identity signals the job engine already consumes. No model calls and no
 * persistence — the parsed profile rides along with a single search request.
 * Image-only uploads (jpg/png) are rejected: there is no OCR pipeline here.
 */
export async function POST(request: Request) {
  try {
    await createScoutStore()
  } catch {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 })
  }

  const file = form.get('file') as unknown as UploadedFile | null
  if (!file || typeof file !== 'object' || typeof file.arrayBuffer !== 'function') {
    return NextResponse.json({ error: 'Upload a CV file.' }, { status: 400 })
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'CV must be 5MB or smaller.' }, { status: 413 })
  }

  const name = (file.name ?? '').toLowerCase()
  const mime = (file as { type?: string }).type ?? ''
  const isPdf = /\.pdf$/i.test(name) || mime === 'application/pdf'
  const isTxt = /\.(txt|md|text)$/i.test(name) || /text\//.test(mime)

  if (!isPdf && !isTxt) {
    return NextResponse.json(
      {
        error:
          'Supported formats: PDF (with a text layer) or TXT. Image files (jpg/png) can’t be scanned yet — upload a text-based CV.',
      },
      { status: 422 },
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  let text: string
  if (isPdf) {
    type PdfParser = InstanceType<typeof import('pdf-parse')['PDFParse']>
    let parser: PdfParser | null = null
    try {
      const { PDFParse } = await import('pdf-parse')
      parser = new PDFParse({ data: new Uint8Array(buffer) })
      const result = await parser.getText()
      text = result.text
    } catch {
      return NextResponse.json({ error: 'Could not read the PDF. Is it password-protected or corrupted?' }, { status: 422 })
    } finally {
      await parser?.destroy?.().catch(() => {})
    }
    if (text.trim().length < MIN_TEXT_LENGTH) {
      return NextResponse.json(
        { error: 'The PDF contains no extractable text (it may be scan-only). Upload a text-based CV or a plain TXT file.' },
        { status: 422 },
      )
    }
  } else {
    text = buffer.toString('utf8')
    if (text.trim().length < MIN_TEXT_LENGTH) {
      return NextResponse.json({ error: 'The CV is too short to extract a profile from.' }, { status: 422 })
    }
  }

  const extracted = extractIdentityFromSource(text)
  const company = extracted.company.trim()
  const skills = Array.from(new Set(extracted.technologies.map((s) => s.trim()).filter(Boolean))).slice(0, 12)

  const cv: ExtractedCv = {
    role: extracted.role || 'Professional',
    seniority: extracted.seniority,
    skills,
    technologies: skills,
    company: company || undefined,
    summary: company ? `${extracted.role} at ${company}` : `${extracted.role} looking for a role`,
    sourceLabel: 'uploaded-cv',
  }

  return NextResponse.json(
    {
      cv,
      parsed: {
        label: `${cv.role}${company ? ` at ${company}` : ''}`,
        skills,
      },
    },
    { status: 200 },
  )
}