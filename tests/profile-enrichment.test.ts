import { describe, expect, it } from 'vitest'
import {
  buildPlan,
  buildProposal,
  fingerprint,
  withChronology,
  type ExistingProfileState,
  type SourceExtraction,
} from '@/lib/profile-intelligence/enrichment'

const facts = (over: Record<string, unknown> = {}) => ({
  fullName: null, displayName: null, currentRole: null, company: null, location: null, headline: null, bio: null,
  professionalSummary: null, seniority: null, yearsExperience: null, primarySkills: [], secondarySkills: [], technologies: [],
  industries: [], serviceCapabilities: [], specialties: [], positioning: null, differentiators: [], languages: [],
  communicationStyle: {}, projects: [], proofs: [], reviews: [], people: [], ...over,
}) as any

function state(over: Partial<ExistingProfileState> = {}, profile: Record<string, unknown> = {}): ExistingProfileState {
  return {
    profile: { id: 'p1', full_name: 'Hassan Raza', current_role: 'Senior Backend Engineer', company: 'BPulse', professional_summary: 'Backend engineer.', primary_skills: ['Python'], ...profile },
    projects: [], proofs: [], reviews: [], claims: [], experience: [], ...over,
  }
}

function source(people: SourceExtraction['people'], extra: Partial<SourceExtraction> = {}): SourceExtraction {
  return { sourceId: 's1', filename: 'cv.pdf', fingerprint: 'fp1', extractedAt: '2026-10-01T00:00:00Z', isSpreadsheet: false, people, reviews: [], ...extra }
}

const hassan = (f: Record<string, unknown>, rest: Partial<SourceExtraction['people'][number]> = {}) =>
  ({ name: 'Hassan Raza', facts: facts({ fullName: 'Hassan Raza', ...f }), projects: [], proofs: [], ...rest })

describe('profile enrichment — classification', () => {
  it('classifies NEW_FACT / DUPLICATE / UPDATE / CONFLICT for scalars', () => {
    const p = buildProposal('run', state(), [source([hassan({ location: 'Lahore', currentRole: 'Staff Engineer', professionalSummary: 'Backend engineer. Payments at scale.' })])])
    const by = (f: string) => p.changes.find((c) => c.field === f)!
    expect(by('location').classification).toBe('NEW_FACT')
    expect(by('location').defaultDecision).toBe('apply')
    expect(by('full_name').classification).toBe('DUPLICATE')
    expect(by('full_name').actionable).toBe(false)
    expect(by('current_role').classification).toBe('CONFLICT')
    expect(by('current_role').defaultDecision).toBe('skip')
    expect(by('professional_summary').classification).toBe('UPDATE')
  })

  it('lower authority never overwrites higher authority by default', () => {
    // legacy value (no provenance) = trusted_source_fact > ai_extracted_fact
    const p = buildProposal('run', state(), [source([hassan({ professionalSummary: 'Backend engineer. Payments at scale.' })])])
    const c = p.changes.find((x) => x.field === 'professional_summary')!
    expect(c.preservedByAuthority).toBe(true)
    expect(c.defaultDecision).toBe('skip')
  })

  it('treats human-verified values as permanent', () => {
    const s = state({ claims: [{ claim_key: 'current_role', claim_value: 'Senior Backend Engineer', authority: 'human_verified', user_corrected: true, user_rejected: false, claim_status: 'active' }] })
    const p = buildProposal('run', s, [source([hassan({ currentRole: 'Senior Backend Engineer II' })])])
    const c = p.changes.find((x) => x.field === 'current_role')!
    expect(c.existingAuthority).toBe('human_verified')
    expect(c.defaultDecision).toBe('skip')
    expect(c.preservedByAuthority).toBe(true)
  })

  it('richer value enriches a lower-authority AI value by default', () => {
    const s = state({ claims: [{ claim_key: 'professional_summary', claim_value: 'Backend engineer.', authority: 'ai_extracted_fact', user_corrected: false, user_rejected: false, claim_status: 'active', merge_action: 'new_fact' }] })
    const p = buildProposal('run', s, [source([hassan({ professionalSummary: 'Backend engineer. Payments at scale.' })])])
    const c = p.changes.find((x) => x.field === 'professional_summary')!
    expect(c.classification).toBe('UPDATE')
    expect(c.defaultDecision).toBe('apply')
  })

  it('corroborating AI claims do not demote a legacy value', () => {
    const s = state({ claims: [{ claim_key: 'professional_summary', claim_value: 'Backend engineer.', authority: 'ai_extracted_fact', user_corrected: false, user_rejected: false, claim_status: 'active', merge_action: 'duplicate' }] })
    const p = buildProposal('run', s, [source([hassan({ professionalSummary: 'Backend engineer. Payments at scale.' })])])
    expect(p.changes.find((x) => x.field === 'professional_summary')!.existingAuthority).toBe('trusted_source_fact')
  })

  it('normalizes list items and never proposes removals', () => {
    const p = buildProposal('run', state({}, { primary_skills: ['Python', 'Django'] }), [source([hassan({ primarySkills: ['python', 'FastAPI'] })])])
    const skills = p.changes.filter((c) => c.field === 'primary_skills')
    expect(skills.find((c) => String(c.incomingValue).toLowerCase() === 'python')!.classification).toBe('DUPLICATE')
    expect(skills.find((c) => c.incomingValue === 'FastAPI')!.classification).toBe('NEW_FACT')
    expect(skills).toHaveLength(2) // Django is not mentioned → not touched
  })

  it('treats a verbatim spreadsheet cell as a trusted source fact', () => {
    const p = buildProposal('run', state(), [source([hassan({ location: 'Lahore' })], { isSpreadsheet: true, cellValues: ['Lahore'] })])
    expect(p.changes.find((c) => c.field === 'location')!.incomingAuthority).toBe('trusted_source_fact')
  })

  it('merges the same fact from several files into one change with all provenance', () => {
    const p = buildProposal('run', state(), [
      source([hassan({ location: 'Lahore' })]),
      source([hassan({ location: 'lahore' })], { sourceId: 's2', filename: 'b.csv', fingerprint: 'fp2' }),
    ])
    const loc = p.changes.filter((c) => c.field === 'location')
    expect(loc).toHaveLength(1)
    expect(loc[0].provenance.map((x) => x.filename)).toEqual(['cv.pdf', 'b.csv'])
  })

  it('flags disagreeing sources for an empty field instead of picking silently', () => {
    const p = buildProposal('run', state(), [
      source([hassan({ location: 'Lahore' })]),
      source([hassan({ location: 'Karachi' })], { sourceId: 's2', filename: 'b.pdf', fingerprint: 'fp2' }),
    ])
    const loc = p.changes.filter((c) => c.field === 'location')
    expect(loc.filter((c) => c.defaultDecision === 'apply')).toHaveLength(1)
    expect(loc.find((c) => c.classification === 'CONFLICT')).toBeTruthy()
  })

  it("never imports another person's data", () => {
    const p = buildProposal('run', state(), [source([
      hassan({ location: 'Lahore' }),
      { name: 'Fiza Khan', facts: facts({ fullName: 'Fiza Khan', location: 'Karachi', primarySkills: ['React'] }), projects: [], proofs: [] },
    ], { reviews: [{ reviewText: 'Fiza is great', assignedPersonName: 'Fiza Khan', reviewerName: null, reviewerCompany: null, relevantSkills: [], projectContext: null, confidence: 0.9, evidenceType: 'explicit_claim', ownershipStatus: 'clear' }] })])
    expect(p.changes.some((c) => c.incomingValue === 'React')).toBe(false)
    expect(p.changes.some((c) => c.incomingValue === 'Karachi')).toBe(false)
    expect(p.changes.find((c) => c.kind === 'review')!.classification).toBe('UNKNOWN')
    expect(p.identity.otherPeople).toEqual(['Fiza Khan'])
  })

  it('dedupes projects, proofs and reviews against existing rows', () => {
    const s = state({
      projects: [{ id: 'pr1', project_title: 'E-commerce API', my_role: null, description: 'Django API', technologies: ['Django'] }],
      proofs: [{ id: 'pf1', safe_claim: 'Built payment reconciliation handling 1M transactions/day' }],
      reviews: [{ id: 'rv1', review_text: 'Hassan is reliable.' }],
    })
    const p = buildProposal('run', s, [source([hassan({}, {
      projects: [{ name: 'e-commerce api', role: 'Lead', summary: 'x', technologies: ['Django'], clientCompany: null, responsibilities: [], problem: null, workPerformed: null, outcome: null, startDate: null, endDate: null, evidenceType: 'explicit_claim', confidence: 0.9, sourceReferences: [] }],
      proofs: [{ claim: 'Built payment reconciliation handling 1M transactions/day', whyItMatters: '', supportingEvidence: '', technologyDomain: null, confidence: 0.9, safeForOutreach: true, evidenceType: 'explicit_claim' }],
    })], { reviews: [{ reviewText: ' hassan is RELIABLE. ', assignedPersonName: 'Hassan Raza', reviewerName: null, reviewerCompany: null, relevantSkills: [], projectContext: null, confidence: 0.9, evidenceType: 'explicit_claim', ownershipStatus: 'clear' }] })])
    const project = p.changes.find((c) => c.kind === 'project')!
    expect(project.classification).toBe('UPDATE') // fills empty my_role only
    expect(project.payload).toMatchObject({ id: 'pr1', my_role: 'Lead' })
    expect(project.payload).not.toHaveProperty('description')
    expect(p.changes.find((c) => c.kind === 'proof')!.classification).toBe('DUPLICATE')
    expect(p.changes.find((c) => c.kind === 'review')!.classification).toBe('DUPLICATE')
  })

  it('is deterministic (same inputs → same diff)', () => {
    const make = () => buildProposal('run', state(), [source([hassan({ location: 'Lahore', primarySkills: ['Go'] })])], new Date(0))
    const a = make()
    const b = make()
    expect(a).toEqual(b)
  })
})

describe('profile enrichment — plan', () => {
  it('refuses to apply duplicates or non-actionable items even if the client asks', () => {
    const p = buildProposal('run', state(), [source([hassan({ location: 'Lahore' })])])
    const dup = p.changes.find((c) => c.classification === 'DUPLICATE')!
    const plan = buildPlan(p, { [dup.id]: 'apply' }, { actorRepId: 'r', importBatchId: 'b', sourceIds: ['s1'] })
    expect(plan.decisions[dup.id]).toBe('skip')
    expect(plan.scalar_updates.map((u) => u.field)).toEqual(['location'])
  })

  it('carries the expected old value for optimistic concurrency', () => {
    const p = buildProposal('run', state(), [source([hassan({ currentRole: 'Staff Engineer' })])])
    const role = p.changes.find((c) => c.field === 'current_role')!
    const plan = buildPlan(p, { [role.id]: 'apply' }, { actorRepId: 'r', importBatchId: null, sourceIds: [] })
    expect(plan.scalar_updates).toEqual([{ field: 'current_role', expected: 'Senior Backend Engineer', value: 'Staff Engineer' }])
    // human override → human_verified provenance + old value kept as history
    expect(plan.claims_insert.find((c) => c.claim_value === 'Staff Engineer')).toMatchObject({ authority: 'human_verified', user_corrected: true })
    expect(plan.claims_insert.find((c) => c.claim_value === 'Senior Backend Engineer')).toMatchObject({ claim_status: 'historical' })
    expect(plan.audit.conflicts).toHaveLength(1)
  })

  it('records every skipped conflict and preserved value in the audit', () => {
    const p = buildProposal('run', state(), [source([hassan({ currentRole: 'Staff Engineer', professionalSummary: 'Backend engineer. More.' })])])
    const plan = buildPlan(p, {}, { actorRepId: 'r', importBatchId: 'b', sourceIds: ['s1'] })
    expect(plan.scalar_updates).toEqual([])
    expect(plan.audit.conflicts.map((e) => e.field)).toContain('current_role')
    expect(plan.audit.preserved_by_authority.map((e) => e.field)).toContain('professional_summary')
    expect(plan.audit.ignored_duplicates.map((e) => e.field)).toContain('full_name')
  })

  it('plans only additive operations', () => {
    const p = buildProposal('run', state(), [source([hassan({ location: 'Lahore', primarySkills: ['Go'] })])])
    const plan = buildPlan(p, {}, { actorRepId: 'r', importBatchId: 'b', sourceIds: ['s1'] })
    const keys = Object.keys(plan)
    expect(keys.some((k) => /delete|remove|replace|reassign/i.test(k))).toBe(false)
    expect(JSON.stringify(plan)).not.toMatch(/"id":\s*"p1"/) // never targets profile identity
  })

  it('keeps old and new roles; only a human decision moves "current"', () => {
    const history = [
      { role: 'Senior Backend Engineer', company: 'BPulse', startDate: '2020', endDate: '2024', isCurrent: false },
      { role: 'Staff Engineer', company: 'NovaPay', startDate: '2024', endDate: null, isCurrent: true },
    ]
    const s = state()
    const p = buildProposal('run', s, [source([hassan({ currentRole: 'Staff Engineer', company: 'NovaPay', employmentHistory: history })])])

    const keep = withChronology(buildPlan(p, {}, { actorRepId: 'r', importBatchId: null, sourceIds: [] }), s)
    expect(keep.experience_insert.map((e) => e.role)).toEqual(['Senior Backend Engineer', 'Staff Engineer'])
    expect(keep.experience_current_fingerprint).toBe(fingerprint('exp', 'Senior Backend Engineer', 'BPulse', '2020'))

    const role = p.changes.find((c) => c.field === 'current_role')!
    const company = p.changes.find((c) => c.field === 'company')!
    const moved = withChronology(buildPlan(p, { [role.id]: 'apply', [company.id]: 'apply' }, { actorRepId: 'r', importBatchId: null, sourceIds: [] }), s)
    expect(moved.experience_insert.map((e) => e.role)).toEqual(['Senior Backend Engineer', 'Staff Engineer'])
    expect(moved.experience_current_fingerprint).toBe(fingerprint('exp', 'Staff Engineer', 'NovaPay', '2024'))
  })
})
