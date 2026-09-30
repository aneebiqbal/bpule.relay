/**
 * Profile Enrichment — merge engine.
 *
 * INVARIANT: PROFILE IDENTITY IS PERMANENT. IMPORT ENRICHES THE PROFILE.
 * IMPORT NEVER DESTROYS RELATIONSHIPS.
 *
 * This module is pure (no I/O). It turns (existing profile state + extracted
 * facts from one or more sources) into a dry-run diff of classified changes,
 * and turns (diff + human decisions) into an additive plan that the
 * `apply_profile_enrichment` RPC executes in a single transaction.
 *
 * Nothing here can express a delete, an id change, or a relationship change.
 */

import { createHash } from 'node:crypto'
import type { ExtractedFacts, ExtractedProject, ExtractedProof, ExtractedReview } from '@/lib/domain/types'
import { normalizeSkill } from './skill-normalization'
import { resolveIdentity } from './identity-resolution'

// ── Authority ────────────────────────────────────────────────────────────────

export type Authority =
  | 'human_verified'
  | 'trusted_source_fact'
  | 'ai_extracted_fact'
  | 'strong_inference'
  | 'weak_inference'

const AUTHORITY_RANK: Record<Authority, number> = {
  human_verified: 5,
  trusted_source_fact: 4,
  ai_extracted_fact: 3,
  strong_inference: 2,
  weak_inference: 1,
}

export function authorityRank(a: Authority | null | undefined): number {
  return a ? AUTHORITY_RANK[a] ?? 0 : 0
}

/**
 * Authority of a value already on the profile that has no provenance record.
 * Legacy values may have been typed in by a human, so they are treated as
 * trusted: AI extraction can add around them but never replace them.
 */
export const LEGACY_VALUE_AUTHORITY: Authority = 'trusted_source_fact'

export function authorityFromEvidence(evidenceType: string | null | undefined): Authority {
  switch (evidenceType) {
    case 'fact':
    case 'explicit_claim':
      return 'ai_extracted_fact'
    case 'strong_inference':
      return 'strong_inference'
    default:
      return 'weak_inference'
  }
}

// ── Classification ──────────────────────────────────────────────────────────

export type ChangeClass = 'NEW_FACT' | 'UPDATE' | 'DUPLICATE' | 'CONFLICT' | 'UNKNOWN'
export type ChangeKind = 'scalar' | 'list_item' | 'project' | 'proof' | 'review' | 'experience'
export type Decision = 'apply' | 'skip'

export interface Provenance {
  sourceId: string
  filename: string
  fingerprint: string
  runId: string
  extractedAt: string
  confidence: number | null
}

export interface ProposedChange {
  id: string
  kind: ChangeKind
  classification: ChangeClass
  field: string
  label: string
  existingValue: unknown
  incomingValue: unknown
  existingAuthority: Authority | null
  incomingAuthority: Authority
  /** True when the incoming value was held back because existing data has higher authority. */
  preservedByAuthority: boolean
  defaultDecision: Decision
  /** Whether a human may flip the default. Duplicates are never actionable. */
  actionable: boolean
  reason: string
  provenance: Provenance[]
  /** Kind-specific payload used by buildPlan (never shown raw). */
  payload?: Record<string, unknown>
}

export interface DiffSummary {
  fieldsToAdd: number
  fieldsToEnrich: number
  duplicatesIgnored: number
  conflictsRequiringReview: number
  preservedByAuthority: number
  projectsToAppend: number
  proofsToAppend: number
  reviewsToAppend: number
  experienceToAppend: number
  unknown: number
  derivedToRecompute: string[]
}

export interface EnrichmentProposal {
  version: 1
  profileId: string
  runId: string
  generatedAt: string
  identity: {
    matchedPeople: string[]
    otherPeople: string[]
    warnings: string[]
    /** Person a human explicitly chose as this profile (multi-person sources). */
    selectedPerson: string | null
  }
  changes: ProposedChange[]
  summary: DiffSummary
}

// ── Inputs ──────────────────────────────────────────────────────────────────

export interface ExistingProfileState {
  profile: Record<string, any>
  projects: Array<{ id: string; project_title: string; my_role: string | null; description: string | null; technologies: string[] | null; client_company?: string | null; start_date?: string | null; end_date?: string | null; outcome?: string | null; content_fingerprint?: string | null }>
  proofs: Array<{ id: string; safe_claim: string; content_fingerprint?: string | null }>
  reviews: Array<{ id: string; review_text: string; content_fingerprint?: string | null }>
  claims: Array<{ claim_key: string; claim_value: string; authority: Authority | null; user_corrected: boolean; user_rejected: boolean; claim_status: string | null; merge_action?: string | null }>
  experience: Array<{ id: string; role: string | null; company: string | null; start_date: string | null; end_date: string | null; is_current: boolean; content_fingerprint: string | null }>
}

export interface EmploymentEntry {
  role: string | null
  company: string | null
  startDate: string | null
  endDate: string | null
  isCurrent: boolean | null
}

/** One person's extraction from one source. */
export interface SourceExtraction {
  sourceId: string
  filename: string
  fingerprint: string
  extractedAt: string
  isSpreadsheet: boolean
  /** Raw cell values for spreadsheet sources; a verbatim cell match is a trusted source fact. */
  cellValues?: string[]
  people: Array<{
    name: string
    facts: ExtractedFacts & { employmentHistory?: EmploymentEntry[] }
    projects: ExtractedProject[]
    proofs: ExtractedProof[]
  }>
  reviews: ExtractedReview[]
}

// ── Normalisation + fingerprints ────────────────────────────────────────────

export function norm(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s.+#]/gu, ' ').replace(/\s+/g, ' ').trim()
}

function tokens(v: unknown): Set<string> {
  return new Set(norm(v).split(' ').filter((t) => t.length > 1))
}

export function jaccard(a: unknown, b: unknown): number {
  const A = tokens(a)
  const B = tokens(b)
  if (A.size === 0 && B.size === 0) return 1
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  return inter / (A.size + B.size - inter)
}

export function sha256(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex')
}

export function fingerprint(...parts: unknown[]): string {
  return sha256(parts.map(norm).join('|')).slice(0, 40)
}

// ── Field catalogue ─────────────────────────────────────────────────────────

const SCALAR_FIELDS: Array<{ field: string; key: keyof ExtractedFacts; label: string; type: 'text' | 'longtext' | 'number' | 'seniority' | 'identity' }> = [
  { field: 'full_name', key: 'fullName', label: 'Full name', type: 'identity' },
  { field: 'display_name', key: 'displayName', label: 'Display name', type: 'identity' },
  { field: 'headline', key: 'headline', label: 'Headline', type: 'text' },
  { field: 'current_role', key: 'currentRole', label: 'Current role', type: 'text' },
  { field: 'company', key: 'company', label: 'Company', type: 'text' },
  { field: 'location', key: 'location', label: 'Location', type: 'text' },
  { field: 'bio', key: 'bio', label: 'Bio', type: 'longtext' },
  { field: 'professional_summary', key: 'professionalSummary', label: 'Professional summary', type: 'longtext' },
  { field: 'seniority', key: 'seniority', label: 'Seniority', type: 'seniority' },
  { field: 'years_experience', key: 'yearsExperience', label: 'Years of experience', type: 'number' },
  { field: 'positioning', key: 'positioning', label: 'Positioning', type: 'longtext' },
]

const LIST_FIELDS: Array<{ field: string; key: keyof ExtractedFacts; label: string; skill: boolean }> = [
  { field: 'primary_skills', key: 'primarySkills', label: 'Primary skill', skill: true },
  { field: 'secondary_skills', key: 'secondarySkills', label: 'Secondary skill', skill: true },
  { field: 'technologies', key: 'technologies', label: 'Technology', skill: true },
  { field: 'industries', key: 'industries', label: 'Industry', skill: false },
  { field: 'service_capabilities', key: 'serviceCapabilities', label: 'Service capability', skill: false },
  { field: 'specialties', key: 'specialties', label: 'Specialty', skill: false },
  { field: 'differentiators', key: 'differentiators', label: 'Differentiator', skill: false },
  { field: 'languages', key: 'languages', label: 'Language', skill: false },
]

const SENIORITY_ORDER = ['junior', 'mid', 'senior', 'lead', 'principal', 'executive']
const VALID_SENIORITY = new Set(SENIORITY_ORDER)

/** Fields whose value (if changed) makes derived intelligence stale. */
const DERIVED_INPUTS = new Set(['current_role', 'company', 'seniority', 'primary_skills', 'technologies', 'industries', 'professional_summary', 'positioning', 'project', 'proof'])

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)
}

// ── Existing-value authority ────────────────────────────────────────────────

function existingAuthority(state: ExistingProfileState, field: string, value: unknown): Authority | null {
  if (isEmpty(value)) return null
  // Claims that SET this value define its authority. Corroborating claims
  // (duplicates, conflicts) can only raise it — never lower a legacy value.
  let origin: Authority | null = null
  let corroborated: Authority | null = null
  for (const c of state.claims) {
    if (c.claim_key !== field || c.user_rejected) continue
    if (norm(c.claim_value) !== norm(value)) continue
    if (c.user_corrected) return 'human_verified'
    const a = c.authority ?? LEGACY_VALUE_AUTHORITY
    if (c.merge_action === 'new_fact' || c.merge_action === 'update' || c.merge_action === 'human_edit') {
      if (authorityRank(a) > authorityRank(origin)) origin = a
    } else if (authorityRank(a) > authorityRank(corroborated)) {
      corroborated = a
    }
  }
  const base = origin ?? LEGACY_VALUE_AUTHORITY
  return authorityRank(corroborated) > authorityRank(base) ? corroborated : base
}

// ── Main: build proposal ────────────────────────────────────────────────────

export function buildProposal(
  runId: string,
  state: ExistingProfileState,
  extractions: SourceExtraction[],
  now: Date = new Date(),
  options: { selectedPerson?: string | null } = {},
): EnrichmentProposal {
  const profile = state.profile
  const selected = options.selectedPerson ? norm(options.selectedPerson) : null
  const profileNames = [profile.full_name, profile.display_name, profile.label].filter(Boolean) as string[]
  const changes: ProposedChange[] = []
  const warnings: string[] = []
  const matchedPeople = new Set<string>()
  const otherPeople = new Set<string>()
  let seq = 0
  const nextId = (prefix: string) => `${prefix}_${++seq}`

  // Merge key → change, so the same fact from several files yields ONE change
  // carrying every source as provenance.
  const byKey = new Map<string, ProposedChange>()
  const addOrCorroborate = (key: string, make: () => ProposedChange, prov: Provenance) => {
    const hit = byKey.get(key)
    if (hit) {
      if (!hit.provenance.some((p) => p.sourceId === prov.sourceId)) hit.provenance.push(prov)
      // A second source may carry higher authority (e.g. a spreadsheet cell).
      const again = make()
      if (authorityRank(again.incomingAuthority) > authorityRank(hit.incomingAuthority)) {
        const { id, provenance } = hit
        Object.assign(hit, again, { id, provenance })
      }
      return hit
    }
    const c = make()
    c.provenance = [prov]
    byKey.set(key, c)
    changes.push(c)
    return c
  }

  for (const ex of extractions) {
    const baseProv = (confidence: number | null): Provenance => ({
      sourceId: ex.sourceId, filename: ex.filename, fingerprint: ex.fingerprint,
      runId, extractedAt: ex.extractedAt, confidence,
    })
    const cells = new Set((ex.cellValues ?? []).map(norm).filter(Boolean))
    const incomingAuthority = (value: unknown, fallback: Authority): Authority =>
      ex.isSpreadsheet && cells.has(norm(value)) ? 'trusted_source_fact' : fallback

    // Which extracted people are this profile?
    const people = ex.people.filter((p) => {
      // A human choice overrides name matching: exactly that person, nobody else.
      const isTarget = selected !== null
        ? { match: norm(p.name) === selected, warning: undefined }
        : personMatchesProfile(p.name, p.facts, profile, ex.people.length)
      if (isTarget.match) {
        matchedPeople.add(p.name)
        if (isTarget.warning) warnings.push(`${ex.filename}: ${isTarget.warning}`)
      } else {
        otherPeople.add(p.name)
      }
      return isTarget.match
    })

    for (const other of ex.people.filter((p) => !people.includes(p))) {
      changes.push({
        id: nextId('unknown'), kind: 'scalar', classification: 'UNKNOWN', field: 'person',
        label: 'Other person in source', existingValue: profileNames[0] ?? null, incomingValue: other.name,
        existingAuthority: null, incomingAuthority: 'weak_inference', preservedByAuthority: false,
        defaultDecision: 'skip', actionable: false,
        reason: `"${other.name}" does not match this profile — their data is not imported here.`,
        provenance: [baseProv(null)],
      })
    }

    for (const person of people) {
      const facts = person.facts

      // Scalars
      for (const def of SCALAR_FIELDS) {
        let incoming = facts[def.key] as unknown
        if (isEmpty(incoming)) continue
        if (def.type === 'seniority') {
          incoming = norm(incoming)
          if (!VALID_SENIORITY.has(incoming as string)) continue
        }
        if (def.type === 'number') {
          const n = Number(incoming)
          if (!Number.isFinite(n) || n < 0 || n > 80) continue
          incoming = n
        }
        const existing = profile[def.field]
        const exAuth = existingAuthority(state, def.field, existing)
        const inAuth = incomingAuthority(incoming, def.type === 'seniority' || def.type === 'number' ? 'strong_inference' : 'ai_extracted_fact')
        const key = `scalar:${def.field}:${norm(incoming)}`
        addOrCorroborate(key, () => classifyScalar(nextId('f'), def, existing, incoming, exAuth, inAuth), baseProv(0.8))
      }

      // Lists
      for (const def of LIST_FIELDS) {
        const incomingList = (facts[def.key] as string[] | undefined) ?? []
        const existingList: string[] = Array.isArray(profile[def.field]) ? profile[def.field] : []
        const canon = (s: string) => norm(def.skill ? normalizeSkill(s) : s)
        const existingSet = new Set(existingList.map(canon))
        for (const raw of incomingList) {
          if (isEmpty(raw)) continue
          const value = def.skill ? normalizeSkill(raw) : String(raw).trim()
          const dup = existingSet.has(canon(value))
          const inAuth = incomingAuthority(value, 'ai_extracted_fact')
          addOrCorroborate(`list:${def.field}:${canon(value)}`, () => ({
            id: nextId('l'), kind: 'list_item', classification: dup ? 'DUPLICATE' : 'NEW_FACT',
            field: def.field, label: def.label, existingValue: dup ? value : null, incomingValue: value,
            existingAuthority: dup ? LEGACY_VALUE_AUTHORITY : null, incomingAuthority: inAuth,
            preservedByAuthority: false, defaultDecision: dup ? 'skip' : 'apply', actionable: !dup,
            reason: dup ? 'Already on profile.' : 'New item — appended, nothing removed.',
            provenance: [],
          }), baseProv(0.8))
        }
      }

      // Employment chronology
      const history = [...(facts.employmentHistory ?? [])]
      if (facts.currentRole && !history.some((h) => norm(h.role) === norm(facts.currentRole) && norm(h.company) === norm(facts.company))) {
        history.push({ role: facts.currentRole, company: facts.company ?? null, startDate: null, endDate: null, isCurrent: true })
      }
      for (const h of history) {
        if (isEmpty(h.role) && isEmpty(h.company)) continue
        const fp = fingerprint('exp', h.role, h.company, h.startDate)
        const dup = state.experience.some((e) => e.content_fingerprint === fp ||
          (norm(e.role) === norm(h.role) && norm(e.company) === norm(h.company) && (norm(e.start_date) === norm(h.startDate) || !e.start_date || !h.startDate)))
        addOrCorroborate(`exp:${fp}`, () => ({
          id: nextId('x'), kind: 'experience', classification: dup ? 'DUPLICATE' : 'NEW_FACT',
          field: 'experience', label: 'Role history',
          existingValue: null,
          incomingValue: formatExperience(h),
          existingAuthority: null, incomingAuthority: incomingAuthority(h.role, 'ai_extracted_fact'),
          preservedByAuthority: false, defaultDecision: dup ? 'skip' : 'apply', actionable: !dup,
          reason: dup ? 'Already in role history.' : 'Added to role history (chronology preserved; does not change current role by itself).',
          provenance: [],
          payload: { fingerprint: fp, role: h.role, company: h.company, start_date: h.startDate, end_date: h.endDate, is_current: !!h.isCurrent && !h.endDate },
        }), baseProv(0.75))
      }

      // Projects
      for (const p of person.projects) {
        if (isEmpty(p.name)) continue
        const fp = fingerprint('project', p.name)
        const match = state.projects.find((e) => e.content_fingerprint === fp || norm(e.project_title) === norm(p.name) || jaccard(e.project_title, p.name) >= 0.8)
        const inAuth = authorityFromEvidence(p.evidenceType)
        if (match) {
          const fill: Record<string, unknown> = {}
          if (isEmpty(match.my_role) && p.role) fill.my_role = p.role
          if (isEmpty(match.description) && p.summary) fill.description = p.summary
          if (isEmpty(match.client_company) && p.clientCompany) fill.client_company = p.clientCompany
          if (isEmpty(match.start_date) && p.startDate) fill.start_date = p.startDate
          if (isEmpty(match.end_date) && p.endDate) fill.end_date = p.endDate
          if (isEmpty(match.outcome) && p.outcome) fill.outcome = p.outcome
          const existingTech = new Set((match.technologies ?? []).map((t) => norm(normalizeSkill(t))))
          const newTech = (p.technologies ?? []).map(normalizeSkill).filter((t) => !existingTech.has(norm(t)))
          const enrich = Object.keys(fill).length > 0 || newTech.length > 0
          addOrCorroborate(`project:${match.id}`, () => ({
            id: nextId('p'), kind: 'project', classification: enrich ? 'UPDATE' : 'DUPLICATE',
            field: 'portfolio_projects', label: 'Project', existingValue: match.project_title, incomingValue: p.name,
            existingAuthority: LEGACY_VALUE_AUTHORITY, incomingAuthority: inAuth, preservedByAuthority: false,
            defaultDecision: enrich ? 'apply' : 'skip', actionable: enrich,
            reason: enrich
              ? `Existing project enriched: fills ${[...Object.keys(fill), ...(newTech.length ? ['technologies'] : [])].join(', ')} (existing values never replaced).`
              : 'Project already on profile.',
            provenance: [],
            payload: enrich ? { id: match.id, ...fill, technologies: newTech } : undefined,
          }), baseProv(p.confidence))
        } else {
          const lowConf = (p.confidence ?? 0) < 0.5
          addOrCorroborate(`project:new:${fp}`, () => ({
            id: nextId('p'), kind: 'project', classification: lowConf ? 'UNKNOWN' : 'NEW_FACT',
            field: 'portfolio_projects', label: 'Project', existingValue: null, incomingValue: p.name,
            existingAuthority: null, incomingAuthority: inAuth, preservedByAuthority: false,
            defaultDecision: lowConf ? 'skip' : 'apply', actionable: true,
            reason: lowConf ? `Low confidence (${p.confidence}) — review before adding.` : 'New project appended.',
            provenance: [],
            payload: {
              fingerprint: fp, project_title: p.name, my_role: p.role, description: p.summary,
              technologies: (p.technologies ?? []).map(normalizeSkill), client_company: p.clientCompany,
              start_date: p.startDate, end_date: p.endDate, outcome: p.outcome, authority: inAuth,
            },
          }), baseProv(p.confidence))
        }
      }

      // Proofs
      for (const pr of person.proofs) {
        if (isEmpty(pr.claim)) continue
        const fp = fingerprint('proof', pr.claim)
        const dup = state.proofs.some((e) => e.content_fingerprint === fp || norm(e.safe_claim) === norm(pr.claim) || jaccard(e.safe_claim, pr.claim) >= 0.85)
        const lowConf = (pr.confidence ?? 0) < 0.5
        const inAuth = authorityFromEvidence(pr.evidenceType)
        addOrCorroborate(`proof:${dup ? 'dup:' : ''}${fp}`, () => ({
          id: nextId('pr'), kind: 'proof', classification: dup ? 'DUPLICATE' : lowConf ? 'UNKNOWN' : 'NEW_FACT',
          field: 'proof_cards', label: 'Proof', existingValue: dup ? pr.claim : null, incomingValue: pr.claim,
          existingAuthority: dup ? LEGACY_VALUE_AUTHORITY : null, incomingAuthority: inAuth, preservedByAuthority: false,
          defaultDecision: dup || lowConf ? 'skip' : 'apply', actionable: !dup,
          reason: dup ? 'Equivalent proof already on profile.' : lowConf ? 'Low confidence — review before adding.' : 'New proof appended (unverified until a human verifies it).',
          provenance: [],
          payload: dup ? undefined : {
            fingerprint: fp, capability: pr.claim.slice(0, 100),
            strength: pr.confidence > 0.8 ? 'strong' : pr.confidence > 0.5 ? 'moderate' : 'weak',
            safe_claim: pr.claim, source_type: pr.evidenceType === 'fact' ? 'cv' : 'approved_fact',
            source_reference: pr.technologyDomain, tags: pr.technologyDomain ? [pr.technologyDomain] : [], authority: inAuth,
          },
        }), baseProv(pr.confidence))
      }
    }

    // Reviews (document-level; ownership must resolve to this profile)
    for (const r of ex.reviews) {
      if (isEmpty(r.reviewText)) continue
      const owner = r.assignedPersonName
      const ownedHere = owner ? matchedPeople.has(owner) || namesMatch(owner, profileNames) : ex.people.length <= 1 && people.length === ex.people.length
      const fp = fingerprint('review', r.reviewText)
      const dup = state.reviews.some((e) => e.content_fingerprint === fp || norm(e.review_text) === norm(r.reviewText) || jaccard(e.review_text, r.reviewText) >= 0.9)
      const cls: ChangeClass = !ownedHere ? 'UNKNOWN' : dup ? 'DUPLICATE' : r.ownershipStatus !== 'clear' ? 'UNKNOWN' : 'NEW_FACT'
      const inAuth = authorityFromEvidence(r.evidenceType)
      addOrCorroborate(`review:${fp}`, () => ({
        id: nextId('r'), kind: 'review', classification: cls, field: 'profile_reviews', label: 'Review',
        existingValue: dup ? r.reviewText : null, incomingValue: r.reviewText,
        existingAuthority: null, incomingAuthority: inAuth, preservedByAuthority: false,
        defaultDecision: cls === 'NEW_FACT' ? 'apply' : 'skip', actionable: cls !== 'DUPLICATE' && ownedHere,
        reason: !ownedHere ? `Attributed to "${owner ?? 'unknown'}", not this profile.` : dup ? 'Review already on profile.'
          : cls === 'UNKNOWN' ? `Ownership ${r.ownershipStatus} — review before adding.` : 'New review appended.',
        provenance: [],
        payload: cls === 'DUPLICATE' || !ownedHere ? undefined : {
          fingerprint: fp, review_text: r.reviewText, reviewer_name: r.reviewerName, reviewer_company: r.reviewerCompany,
          project_context: r.projectContext, relevant_skills: r.relevantSkills ?? [], evidence_type: r.evidenceType,
          confidence: r.confidence, safe_for_outreach: r.confidence > 0.7 && r.ownershipStatus === 'clear',
          ownership_status: r.ownershipStatus, authority: inAuth,
        },
      }), baseProv(r.confidence))
    }
  }

  // Scalar: several sources may propose different values for one empty field.
  // Only one can be the default; the rest become conflicts against it.
  const byField = new Map<string, ProposedChange[]>()
  for (const c of changes) if (c.kind === 'scalar' && c.field !== 'person') {
    byField.set(c.field, [...(byField.get(c.field) ?? []), c])
  }
  for (const [, list] of byField) {
    const applying = list.filter((c) => c.defaultDecision === 'apply')
    if (applying.length > 1) {
      applying.sort((a, b) => authorityRank(b.incomingAuthority) - authorityRank(a.incomingAuthority) || b.provenance.length - a.provenance.length)
      for (const c of applying.slice(1)) {
        c.classification = 'CONFLICT'
        c.defaultDecision = 'skip'
        c.reason = `Sources disagree: "${String(applying[0].incomingValue)}" vs "${String(c.incomingValue)}". Choose one.`
      }
    }
  }

  if (matchedPeople.size === 0 && extractions.some((e) => e.people.length > 0)) {
    warnings.push(selected
      ? `"${options.selectedPerson}" was not found in these sources.`
      : 'No person in the uploaded sources matched this profile. Choose which person this profile is to import their data.')
  }

  return {
    version: 1,
    profileId: profile.id,
    runId,
    generatedAt: now.toISOString(),
    identity: { matchedPeople: [...matchedPeople], otherPeople: [...otherPeople], warnings, selectedPerson: options.selectedPerson ?? null },
    changes,
    summary: summarize(changes),
  }
}

function classifyScalar(
  id: string,
  def: (typeof SCALAR_FIELDS)[number],
  existing: unknown,
  incoming: unknown,
  exAuth: Authority | null,
  inAuth: Authority,
): ProposedChange {
  const base = {
    id, kind: 'scalar' as const, field: def.field, label: def.label,
    existingValue: isEmpty(existing) ? null : existing, incomingValue: incoming,
    existingAuthority: exAuth, incomingAuthority: inAuth, provenance: [] as Provenance[],
  }
  if (isEmpty(existing)) {
    if (inAuth === 'weak_inference') {
      return { ...base, classification: 'UNKNOWN', preservedByAuthority: false, defaultDecision: 'skip', actionable: true, reason: 'Weak inference — confirm before adding.' }
    }
    return { ...base, classification: 'NEW_FACT', preservedByAuthority: false, defaultDecision: 'apply', actionable: true, reason: 'Field was empty.' }
  }
  if (sameValue(def.type, existing, incoming)) {
    return { ...base, classification: 'DUPLICATE', preservedByAuthority: false, defaultDecision: 'skip', actionable: false, reason: 'Identical to existing value.' }
  }
  const outranked = authorityRank(inAuth) < authorityRank(exAuth)
  if (def.type !== 'identity' && isRicherCompatible(def.type, existing, incoming)) {
    return {
      ...base, classification: 'UPDATE', preservedByAuthority: outranked,
      defaultDecision: outranked ? 'skip' : 'apply', actionable: true,
      reason: outranked
        ? `Richer compatible value, but existing value has higher authority (${exAuth}). Kept unless you approve.`
        : 'Richer compatible value — enriches the existing one.',
    }
  }
  const isRole = def.field === 'current_role' || def.field === 'company'
  return {
    ...base, classification: 'CONFLICT', preservedByAuthority: outranked,
    defaultDecision: 'skip', actionable: true,
    reason: isRole
      ? 'Different role/company. Existing kept as current; both preserved in role history. Approve to make the new one current.'
      : def.type === 'number' && Number(incoming) < Number(existing)
        ? 'Lower than existing — likely from an older source. Existing kept.'
        : `Conflicts with existing value${exAuth ? ` (${exAuth})` : ''}. Existing kept; new value recorded with provenance.`,
  }
}

function sameValue(type: string, a: unknown, b: unknown): boolean {
  if (type === 'number') return Number(a) === Number(b)
  return norm(a) === norm(b)
}

function isRicherCompatible(type: string, existing: unknown, incoming: unknown): boolean {
  if (type === 'number') return Number(incoming) > Number(existing)
  if (type === 'seniority') return SENIORITY_ORDER.indexOf(norm(incoming)) > SENIORITY_ORDER.indexOf(norm(existing))
  const e = norm(existing)
  const i = norm(incoming)
  if (i.length <= e.length) return false
  if (i.includes(e)) return true
  const et = tokens(existing)
  const it = tokens(incoming)
  for (const t of et) if (!it.has(t)) return false
  return et.size > 0
}

function formatExperience(h: EmploymentEntry): string {
  const when = [h.startDate, h.endDate ?? (h.isCurrent ? 'present' : null)].filter(Boolean).join(' – ')
  return [h.role, h.company ? `@ ${h.company}` : null, when ? `(${when})` : null].filter(Boolean).join(' ')
}

function namesMatch(name: string, profileNames: string[]): boolean {
  const n = norm(name)
  return profileNames.some((p) => {
    const q = norm(p)
    return q === n || (n.length > 2 && (q.startsWith(n + ' ') || n.startsWith(q + ' ')))
  })
}

export function personMatchesProfile(
  name: string,
  facts: Partial<ExtractedFacts>,
  profile: Record<string, any>,
  peopleInSource: number,
): { match: boolean; warning?: string } {
  // Unnamed single-person source (portfolio, case study) — accepted, since the
  // user uploaded it to this profile.
  if (isEmpty(name)) {
    return peopleInSource === 1
      ? { match: true, warning: 'Source does not name a person; attributed to this profile because you uploaded it here.' }
      : { match: false }
  }
  const res = resolveIdentity(
    { normalizedName: name, email: null, linkedinUrl: null, company: facts.company ?? null, role: facts.currentRole ?? null, aliases: [], sourceEvidence: [] },
    [{
      id: profile.id, fullName: profile.full_name ?? null, displayName: profile.display_name ?? null, label: profile.label ?? null,
      headline: profile.headline ?? null, currentRole: profile.current_role ?? null, company: profile.company ?? null, profileUrl: profile.profile_url ?? null,
    }],
  )
  if (res.resolution === 'match_existing') return { match: true }
  // The user explicitly chose this profile. A single-person source with a
  // plausible (partial) name match is accepted with a warning.
  if (peopleInSource === 1 && res.confidence >= 0.4) {
    return { match: true, warning: `"${name}" is only a partial name match for this profile (${Math.round(res.confidence * 100)}%).` }
  }
  return { match: false }
}

export function summarize(changes: ProposedChange[]): DiffSummary {
  const s: DiffSummary = {
    fieldsToAdd: 0, fieldsToEnrich: 0, duplicatesIgnored: 0, conflictsRequiringReview: 0,
    preservedByAuthority: 0, projectsToAppend: 0, proofsToAppend: 0, reviewsToAppend: 0,
    experienceToAppend: 0, unknown: 0, derivedToRecompute: [],
  }
  const derived = new Set<string>()
  for (const c of changes) {
    if (c.classification === 'DUPLICATE') { s.duplicatesIgnored++; continue }
    if (c.classification === 'UNKNOWN') { s.unknown++; continue }
    // Each item is counted in exactly one bucket, matching the diff sections.
    if (c.classification === 'CONFLICT') s.conflictsRequiringReview++
    else if (c.preservedByAuthority) s.preservedByAuthority++
    if (c.kind === 'scalar' || c.kind === 'list_item') {
      if (c.classification === 'NEW_FACT') s.fieldsToAdd++
      if (c.classification === 'UPDATE') s.fieldsToEnrich++
    }
    if (c.kind === 'project' && c.defaultDecision === 'apply') s.projectsToAppend++
    if (c.kind === 'proof' && c.defaultDecision === 'apply') s.proofsToAppend++
    if (c.kind === 'review' && c.defaultDecision === 'apply') s.reviewsToAppend++
    if (c.kind === 'experience' && c.defaultDecision === 'apply') s.experienceToAppend++
    const k = c.kind === 'project' ? 'project' : c.kind === 'proof' ? 'proof' : c.field
    if (c.defaultDecision === 'apply' && DERIVED_INPUTS.has(k)) {
      derived.add('ai_context')
      derived.add('readiness')
    }
  }
  derived.add('source_count')
  derived.add('proof_count')
  s.derivedToRecompute = [...derived]
  return s
}

// ── Plan: proposal + decisions → additive RPC payload ───────────────────────

export interface EnrichmentPlan {
  scalar_updates: Array<{ field: string; expected: string | null; value: string }>
  array_appends: Array<{ field: string; items: string[] }>
  projects_insert: Array<Record<string, unknown>>
  projects_enrich: Array<Record<string, unknown>>
  proofs_insert: Array<Record<string, unknown>>
  reviews_insert: Array<Record<string, unknown>>
  experience_insert: Array<Record<string, unknown>>
  experience_current_fingerprint: string | null
  /** Set when a human approved a new current role/company (resolved by withChronology). */
  new_current_role: { role: string | null; company: string | null } | null
  claims_insert: Array<Record<string, unknown>>
  claims_supersede: Array<{ claim_key: string; keep_value: string }>
  decisions: Record<string, Decision>
  audit: EnrichmentAudit
}

export interface EnrichmentAudit {
  profile_id: string
  run_id: string
  import_batch_id: string | null
  source_ids: string[]
  actor_rep_id: string
  timestamp: string
  additions: AuditEntry[]
  updates: AuditEntry[]
  ignored_duplicates: AuditEntry[]
  conflicts: AuditEntry[]
  preserved_by_authority: AuditEntry[]
  unknown_skipped: AuditEntry[]
  derived_to_recompute: string[]
}

interface AuditEntry {
  change_id: string
  kind: ChangeKind
  field: string
  existing: unknown
  incoming: unknown
  decision: Decision
  existing_authority: Authority | null
  incoming_authority: Authority
  sources: string[]
}

function toText(v: unknown): string | null {
  if (v === null || v === undefined) return null
  return String(v)
}

export function buildPlan(
  proposal: EnrichmentProposal,
  decisionsIn: Record<string, Decision>,
  ctx: { actorRepId: string; importBatchId: string | null; sourceIds: string[]; now?: Date },
): EnrichmentPlan {
  const decisions: Record<string, Decision> = {}
  const plan: EnrichmentPlan = {
    scalar_updates: [], array_appends: [], projects_insert: [], projects_enrich: [], proofs_insert: [],
    reviews_insert: [], experience_insert: [], experience_current_fingerprint: null, new_current_role: null, claims_insert: [],
    claims_supersede: [], decisions,
    audit: {
      profile_id: proposal.profileId, run_id: proposal.runId, import_batch_id: ctx.importBatchId,
      source_ids: ctx.sourceIds, actor_rep_id: ctx.actorRepId, timestamp: (ctx.now ?? new Date()).toISOString(),
      additions: [], updates: [], ignored_duplicates: [], conflicts: [], preserved_by_authority: [], unknown_skipped: [],
      derived_to_recompute: [],
    },
  }
  const listAppends = new Map<string, string[]>()
  const scalarChosen = new Set<string>()
  const roleChanged: { role: ProposedChange | null; company: ProposedChange | null } = { role: null, company: null }
  const derived = new Set<string>(['source_count', 'proof_count'])

  for (const c of proposal.changes) {
    // Duplicates and non-actionable items can never be applied, whatever the client sends.
    const requested = decisionsIn[c.id]
    const decision: Decision = !c.actionable ? 'skip' : requested === 'apply' || requested === 'skip' ? requested : c.defaultDecision
    decisions[c.id] = decision
    // A human flipping a held-back value is an explicit human decision.
    const humanOverride = decision === 'apply' && c.defaultDecision === 'skip'
    const src = c.provenance[0]
    const entry: AuditEntry = {
      change_id: c.id, kind: c.kind, field: c.field, existing: c.existingValue, incoming: c.incomingValue, decision,
      existing_authority: c.existingAuthority, incoming_authority: humanOverride ? 'human_verified' : c.incomingAuthority,
      sources: c.provenance.map((p) => p.sourceId),
    }

    if (c.classification === 'DUPLICATE') plan.audit.ignored_duplicates.push(entry)
    else if (c.classification === 'UNKNOWN' && decision === 'skip') plan.audit.unknown_skipped.push(entry)
    else if (c.classification === 'CONFLICT' && decision === 'skip') plan.audit.conflicts.push(entry)
    else if (c.preservedByAuthority && decision === 'skip') plan.audit.preserved_by_authority.push(entry)
    else if (decision === 'apply') (c.classification === 'NEW_FACT' || c.kind === 'project' && c.classification !== 'UPDATE' ? plan.audit.additions : plan.audit.updates).push(entry)
    if (c.classification === 'CONFLICT' && decision === 'apply') plan.audit.conflicts.push(entry)

    // Provenance claim for every scalar/list fact about THIS person (incl.
    // duplicates → corroboration, conflicts → recorded but not applied).
    if ((c.kind === 'scalar' || c.kind === 'list_item') && c.field !== 'person' && src) {
      const status = decision === 'apply' ? 'active' : c.classification === 'CONFLICT' ? 'conflict'
        : c.classification === 'UNKNOWN' ? 'unknown' : c.classification === 'DUPLICATE' ? 'active' : 'conflict'
      const actionLower = c.classification.toLowerCase() as 'new_fact' | 'update' | 'duplicate' | 'conflict' | 'unknown'
      for (const p of c.provenance) {
        plan.claims_insert.push({
          claim_key: c.field, claim_value: toText(c.incomingValue), authority: entry.incoming_authority,
          merge_action: actionLower, claim_status: status,
          previous_value: decision === 'apply' && c.kind === 'scalar' ? toText(c.existingValue) : null,
          source_id: p.sourceId, source_filename: p.filename, confidence: p.confidence,
          evidence_type: c.incomingAuthority === 'strong_inference' ? 'strong_inference' : c.incomingAuthority === 'weak_inference' ? 'weak_inference' : 'explicit_claim',
          is_inferred: c.incomingAuthority === 'strong_inference' || c.incomingAuthority === 'weak_inference',
          user_corrected: humanOverride,
          fingerprint: fingerprint('claim', c.field, c.incomingValue),
        })
      }
    }

    if (decision !== 'apply') continue

    switch (c.kind) {
      case 'scalar': {
        if (c.field === 'person' || scalarChosen.has(c.field)) break
        scalarChosen.add(c.field)
        plan.scalar_updates.push({ field: c.field, expected: toText(c.existingValue), value: String(c.incomingValue) })
        if (!isEmpty(c.existingValue)) {
          // Old value is preserved as historical provenance, never lost.
          plan.claims_insert.push({
            claim_key: c.field, claim_value: toText(c.existingValue), authority: c.existingAuthority,
            merge_action: 'historical', claim_status: 'historical', previous_value: null,
            source_id: null, source_filename: null, confidence: null, evidence_type: 'explicit_claim',
            is_inferred: false, user_corrected: false, fingerprint: fingerprint('claim', c.field, c.existingValue),
          })
          plan.claims_supersede.push({ claim_key: c.field, keep_value: String(c.incomingValue) })
        }
        if (c.field === 'current_role') roleChanged.role = c
        if (c.field === 'company') roleChanged.company = c
        if (DERIVED_INPUTS.has(c.field)) { derived.add('ai_context'); derived.add('readiness') }
        break
      }
      case 'list_item': {
        listAppends.set(c.field, [...(listAppends.get(c.field) ?? []), String(c.incomingValue)])
        if (DERIVED_INPUTS.has(c.field)) { derived.add('ai_context'); derived.add('readiness') }
        break
      }
      case 'project':
        if (!c.payload) break
        if (c.classification === 'UPDATE') plan.projects_enrich.push({ ...c.payload })
        else plan.projects_insert.push({ ...c.payload, source_id: src?.sourceId ?? null })
        derived.add('ai_context')
        break
      case 'proof':
        if (c.payload) plan.proofs_insert.push({ ...c.payload, source_id: src?.sourceId ?? null })
        derived.add('ai_context')
        break
      case 'review':
        if (c.payload) plan.reviews_insert.push({ ...c.payload, source_id: src?.sourceId ?? null })
        break
      case 'experience':
        if (c.payload) plan.experience_insert.push({ ...c.payload, is_current: false, authority: c.incomingAuthority, source_id: src?.sourceId ?? null })
        break
    }
  }

  for (const [field, items] of listAppends) plan.array_appends.push({ field, items })

  // Which role is current after this merge? Only an approved current_role /
  // company change moves it; otherwise the existing current role stays current.
  if (roleChanged.role || roleChanged.company) {
    const newRole = roleChanged.role ? String(roleChanged.role.incomingValue) : null
    const newCompany = roleChanged.company ? String(roleChanged.company.incomingValue) : null
    plan.new_current_role = { role: newRole, company: newCompany }
  }

  plan.audit.derived_to_recompute = [...derived]
  return plan
}

/**
 * Chronology. Called with live state right before apply:
 *  - the profile's existing current role is preserved as a history row, so a
 *    new role never erases the old one;
 *  - if a human approved a new current role, it gets its own history row and
 *    becomes the single current entry; everything else stays in history.
 */
export function withChronology(plan: EnrichmentPlan, state: ExistingProfileState): EnrichmentPlan {
  const out: EnrichmentPlan = { ...plan, experience_insert: [...plan.experience_insert] }
  const newCurrent = plan.new_current_role
  const touchesRoles = out.experience_insert.length > 0 || !!newCurrent
  if (!touchesRoles) return out

  const role = state.profile.current_role ?? null
  const company = state.profile.company ?? null
  const existingCurrent = state.experience.find((e) => e.is_current)
  let existingFp = existingCurrent?.content_fingerprint ?? null
  if (!isEmpty(role) || !isEmpty(company)) {
    const already = state.experience.find((e) => norm(e.role) === norm(role) && norm(e.company) === norm(company))
    const importedSame = out.experience_insert.find((e) => norm(e.role) === norm(role) && norm(e.company) === norm(company))
    if (already) {
      existingFp = already.content_fingerprint ?? existingFp
    } else if (importedSame) {
      // The import already describes the existing current role (with dates) — use it, don't add a twin.
      existingFp = importedSame.fingerprint as string
    } else {
      existingFp = fingerprint('exp', role, company, null)
      out.experience_insert.unshift({
        fingerprint: existingFp, role, company, start_date: null, end_date: null, is_current: true,
        authority: existingAuthority(state, 'current_role', role) ?? LEGACY_VALUE_AUTHORITY, source_id: null,
      })
    }
  }

  if (newCurrent) {
    const role2 = newCurrent.role ?? role
    const company2 = newCurrent.company ?? company
    const fp = fingerprint('exp', role2, company2, null)
    const inserted = out.experience_insert.find((e) => norm(e.role) === norm(role2) && norm(e.company) === norm(company2))
    const stored = state.experience.find((e) => norm(e.role) === norm(role2) && norm(e.company) === norm(company2))
    if (inserted) out.experience_current_fingerprint = inserted.fingerprint as string
    else if (stored?.content_fingerprint) out.experience_current_fingerprint = stored.content_fingerprint
    else {
      out.experience_insert.push({ fingerprint: fp, role: role2, company: company2, start_date: null, end_date: null, is_current: false, authority: 'human_verified', source_id: null })
      out.experience_current_fingerprint = fp
    }
  } else {
    out.experience_current_fingerprint = existingFp
  }
  return out
}

// ── Derived intelligence ────────────────────────────────────────────────────

export function computeReadiness(profile: Record<string, any>, sourceCount: number): 'ready' | 'needs_review' | 'incomplete' | 'needs_source' {
  const hasIdentity = !isEmpty(profile.full_name) || !isEmpty(profile.display_name) || !isEmpty(profile.label)
  const hasRole = !isEmpty(profile.current_role) || !isEmpty(profile.headline)
  const hasCapability = (profile.primary_skills?.length ?? 0) > 0 || (profile.technologies?.length ?? 0) > 0
  if (sourceCount === 0) return hasIdentity && hasRole && hasCapability ? (profile.readiness ?? 'needs_source') : 'needs_source'
  if (hasIdentity && hasRole && hasCapability) return 'ready'
  if (hasIdentity) return 'needs_review'
  return 'incomplete'
}

/** Maps/extraction results → JSON-safe structure stored on profile_sources.extraction_result. */
export function serializeExtraction(e: SourceExtraction): Record<string, unknown> {
  return JSON.parse(JSON.stringify(e))
}
