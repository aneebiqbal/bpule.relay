import { describe, expect, it } from 'vitest'
import { validatePackage, MIN_JOB_FIT } from '@/lib/job-discovery/preparation'
import { renderResumePdf } from '@/lib/job-discovery/pdf'
import { renderResumeDocx } from '@/lib/job-discovery/docx'

const base = {
  assessment: { documentQuality: { score: 95 }, readiness: 70, jobMatch: { score: 80 } },
  pdf: Buffer.from('%PDF-1.3\n'),
  docx: Buffer.from('PK'),
  links: [{ url: 'https://github.com/ada' }],
}

describe('validatePackage', () => {
  it('accepts a complete package', async () => {
    const result = validatePackage({
      assessment: { documentQuality: { score: 95 }, readiness: 70, jobMatch: { score: 80 } },
      pdf: await renderResumePdf('Ada Lovelace\nEngineer'),
      docx: renderResumeDocx('Ada Lovelace\nEngineer'),
      links: [{ url: 'https://github.com/ada' }],
      documents: [
        { kind: 'cv', text: 'Ada Lovelace' },
        { kind: 'cover_letter', text: 'Dear team' },
        { kind: 'upwork_proposal', text: 'I can help' },
      ],
    })
    expect(result.status).toBe('ready')
  })

  it('never treats an empty cover letter as success', () => {
    const result = validatePackage({
      ...base,
      documents: [
        { kind: 'cv', text: 'Ada Lovelace' },
        { kind: 'cover_letter', text: '' },
        { kind: 'upwork_proposal', text: 'I can help' },
      ],
    })
    expect(result.status).toBe('needs_review')
    expect(result.reason).toMatch(/cover letter/i)
  })

  it('flags an empty CV as needs_evidence', () => {
    const result = validatePackage({
      ...base,
      documents: [{ kind: 'cv', text: '' }],
    })
    expect(result.status).toBe('needs_evidence')
  })

  it('rejects unsupported claims, a broken PDF and a broken DOCX', () => {
    const unsupported = validatePackage({
      ...base,
      documents: [
        { kind: 'cv', text: 'Ada', unsupportedClaims: ['Managed a team of 50'] },
        { kind: 'cover_letter', text: 'Hi' },
      ],
    })
    expect(unsupported.status).toBe('needs_review')

    const badPdf = validatePackage({ ...base, pdf: Buffer.from('not a pdf'), documents: [{ kind: 'cv', text: 'Ada' }, { kind: 'cover_letter', text: 'Hi' }] })
    expect(badPdf.status).toBe('needs_review')

    const badDocx = validatePackage({ ...base, docx: Buffer.from('nope'), documents: [{ kind: 'cv', text: 'Ada' }, { kind: 'cover_letter', text: 'Hi' }] })
    expect(badDocx.status).toBe('needs_review')
  })

  it('applies a configurable minimum job-fit threshold', () => {
    expect(MIN_JOB_FIT).toBeGreaterThanOrEqual(50)
    expect(Number.isFinite(MIN_JOB_FIT)).toBe(true)
  })
})
