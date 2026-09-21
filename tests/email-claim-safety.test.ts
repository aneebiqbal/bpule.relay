import { describe, expect, it } from 'vitest'
import { validateEmailClaims } from '@/lib/email/claim-safety'

describe('email claim safety', () => {
  it('passes factual statements grounded in allowed evidence', () => {
    const result = validateEmailClaims({
      body: 'Your team is hiring backend engineers this quarter.',
      allowedEvidence: ['Team is hiring backend engineers this quarter'],
      thingsNotToClaim: [],
    })
    expect(result.safe).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('blocks explicitly forbidden claims', () => {
    const result = validateEmailClaims({
      body: 'I led your migration project last year.',
      allowedEvidence: ['Migration planning discussion'],
      thingsNotToClaim: ['led your migration project'],
    })
    expect(result.safe).toBe(false)
    expect(result.issues[0]?.reason).toContain('Mentions blocked claim')
  })

  it('repairs mixed copy by removing unsupported factual lines', () => {
    const result = validateEmailClaims({
      body: 'Your team is hiring engineers. I built your internal platform.',
      allowedEvidence: ['Team is hiring engineers'],
      thingsNotToClaim: [],
    })
    expect(result.safe).toBe(true)
    expect(result.repaired).toBe(true)
    expect(result.repairedBody).toBe('Your team is hiring engineers.')
  })
})
