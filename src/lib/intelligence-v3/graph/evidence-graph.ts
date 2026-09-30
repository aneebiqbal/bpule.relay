/**
 * Evidence Graph Builder — V3
 *
 * Transforms raw extracted intelligence into a structured graph of
 * Persons → Organizations → Evidence → Events.
 *
 * Key principle: every commercial fact is scoped to person + organization + time.
 * No global person-level classifications that erase event-level signals.
 */

import type {
  V3Person,
  V3Organization,
  V3Evidence,
  V3Event,
  V3Affiliation,
} from '../types'

// ── Graph State ─────────────────────────────────────────────────────────────

export interface V3EvidenceGraph {
  persons: Map<string, V3Person>
  organizations: Map<string, V3Organization>
  evidence: Map<string, V3Evidence>
  events: Map<string, V3Event>
  /** Index: organizationId → evidenceIds */
  orgEvidenceIndex: Map<string, string[]>
  /** Index: personId → evidenceIds */
  personEvidenceIndex: Map<string, string[]>
  /** Index: eventId → evidenceIds */
  eventEvidenceIndex: Map<string, string[]>
  /** Index: organizationId → eventIds */
  orgEventIndex: Map<string, string[]>
}

export function createEvidenceGraph(): V3EvidenceGraph {
  return {
    persons: new Map(),
    organizations: new Map(),
    evidence: new Map(),
    events: new Map(),
    orgEvidenceIndex: new Map(),
    personEvidenceIndex: new Map(),
    eventEvidenceIndex: new Map(),
    orgEventIndex: new Map(),
  }
}

// ── ID Generation ───────────────────────────────────────────────────────────

let _idCounter = 0

function generateId(prefix: string): string {
  _idCounter++
  return `${prefix}_${Date.now().toString(36)}_${_idCounter.toString(36)}`
}

export function resetIdCounter(): void {
  _idCounter = 0
}

// ── Person Management ────────────────────────────────────────────────────────

export function upsertPerson(
  graph: V3EvidenceGraph,
  fullName: string | null,
  linkedinUrl: string | null,
  location: string | null,
): V3Person {
  // Try to find existing person by name or URL
  for (const person of graph.persons.values()) {
    if (linkedinUrl && person.linkedinUrl === linkedinUrl) return person
    if (fullName && person.fullName && normalizeName(person.fullName) === normalizeName(fullName)) {
      return person
    }
  }

  const id = generateId('person')
  const person: V3Person = {
    id,
    fullName,
    firstName: fullName?.split(' ')[0] ?? null,
    linkedinUrl,
    location,
    affiliations: [],
  }
  graph.persons.set(id, person)
  return person
}

export function addAffiliation(
  graph: V3EvidenceGraph,
  personId: string,
  orgId: string,
  orgName: string,
  role: string | null,
  relationship: V3Affiliation['relationship'],
  isCurrent: boolean,
  startedAt: string | null = null,
  endedAt: string | null = null,
): void {
  const person = graph.persons.get(personId)
  if (!person) return

  // Check if affiliation already exists
  const existing = person.affiliations.find(
    (a) => a.organizationId === orgId && a.role === role
  )
  if (existing) {
    // Update current status if needed
    if (isCurrent) existing.isCurrent = true
    return
  }

  person.affiliations.push({
    organizationId: orgId,
    organizationName: orgName,
    role,
    relationship,
    isCurrent,
    startedAt,
    endedAt,
  })
}

// ── Organization Management ──────────────────────────────────────────────────

export function upsertOrganization(
  graph: V3EvidenceGraph,
  name: string | null,
  domain: string | null,
  linkedinUrl: string | null,
  industry: string | null = null,
  size: string | null = null,
): V3Organization {
  for (const org of graph.organizations.values()) {
    if (linkedinUrl && org.linkedinUrl === linkedinUrl) return org
    if (name && org.name && normalizeName(org.name) === normalizeName(name)) return org
  }

  const id = generateId('org')
  const org: V3Organization = {
    id,
    name,
    domain,
    linkedinUrl,
    industry,
    size,
    appearsToBeServiceProvider: false,
  }
  graph.organizations.set(id, org)
  return org
}

export function markOrganizationAsServiceProvider(
  graph: V3EvidenceGraph,
  orgId: string,
): void {
  const org = graph.organizations.get(orgId)
  if (org) org.appearsToBeServiceProvider = true
}

// ── Evidence Management ─────────────────────────────────────────────────────

export function addEvidence(
  graph: V3EvidenceGraph,
  params: {
    sourceType: V3Evidence['sourceType']
    sourceUrl?: string | null
    quote: string
    subjectPersonId?: string | null
    subjectOrganizationId?: string | null
    subjectOrganizationName?: string | null
    occurredAt?: string | null
    confidence?: number
    evidenceType?: V3Evidence['evidenceType']
    needOwner: V3Evidence['needOwner']
    eventId?: string | null
    polarity?: V3Evidence['polarity']
    temporalScope?: V3Evidence['temporalScope']
  },
): V3Evidence {
  const id = generateId('ev')
  const evidence: V3Evidence = {
    id,
    sourceRef: params.sourceUrl || params.sourceType,
    sourceType: params.sourceType,
    sourceUrl: params.sourceUrl ?? null,
    quote: params.quote,
    subjectPersonId: params.subjectPersonId ?? null,
    subjectOrganizationId: params.subjectOrganizationId ?? null,
    subjectOrganizationName: params.subjectOrganizationName ?? null,
    occurredAt: params.occurredAt ?? null,
    capturedAt: new Date().toISOString(),
    confidence: params.confidence ?? 0.7,
    evidenceType: params.evidenceType ?? 'STRONG_INFERENCE',
    needOwner: params.needOwner,
    eventId: params.eventId ?? null,
    polarity: params.polarity ?? 'ACTIVE',
    temporalScope: params.temporalScope ?? 'CURRENT',
  }

  graph.evidence.set(id, evidence)

  // Update indices
  if (evidence.subjectOrganizationId) {
    const orgIdx = graph.orgEvidenceIndex.get(evidence.subjectOrganizationId) || []
    orgIdx.push(id)
    graph.orgEvidenceIndex.set(evidence.subjectOrganizationId, orgIdx)
  }

  if (evidence.subjectPersonId) {
    const personIdx = graph.personEvidenceIndex.get(evidence.subjectPersonId) || []
    personIdx.push(id)
    graph.personEvidenceIndex.set(evidence.subjectPersonId, personIdx)
  }

  if (evidence.eventId) {
    const eventIdx = graph.eventEvidenceIndex.get(evidence.eventId) || []
    eventIdx.push(id)
    graph.eventEvidenceIndex.set(evidence.eventId, eventIdx)
  }

  return evidence
}

// ── Event Management ────────────────────────────────────────────────────────

export function addEvent(
  graph: V3EvidenceGraph,
  params: {
    eventType: V3Event['eventType']
    personId?: string | null
    organizationId?: string | null
    organizationName?: string | null
    occurredAt?: string | null
    channel?: string | null
    requestedCapability?: string[]
    targetAudience?: V3Event['targetAudience']
    explicitness?: V3Event['explicitness']
    applyInstructions?: string[]
    polarity?: V3Event['polarity']
  },
): V3Event {
  const id = generateId('evt')
  const event: V3Event = {
    id,
    eventType: params.eventType,
    personId: params.personId ?? null,
    organizationId: params.organizationId ?? null,
    organizationName: params.organizationName ?? null,
    occurredAt: params.occurredAt ?? null,
    channel: params.channel ?? null,
    requestedCapability: params.requestedCapability ?? [],
    targetAudience: params.targetAudience ?? 'UNKNOWN',
    explicitness: params.explicitness ?? 'IMPLIED',
    applyInstructions: params.applyInstructions ?? [],
    evidenceRefs: [],
    polarity: params.polarity ?? 'ACTIVE',
  }

  graph.events.set(id, event)

  // Link evidence to event
  if (event.organizationId) {
    const orgEvIdx = graph.orgEventIndex.get(event.organizationId) || []
    orgEvIdx.push(id)
    graph.orgEventIndex.set(event.organizationId, orgEvIdx)
  }

  return event
}

export function linkEvidenceToEvent(
  graph: V3EvidenceGraph,
  eventId: string,
  evidenceId: string,
): void {
  const event = graph.events.get(eventId)
  const evidence = graph.evidence.get(evidenceId)
  if (!event || !evidence) return

  if (!event.evidenceRefs.includes(evidenceId)) {
    event.evidenceRefs.push(evidenceId)
  }
  evidence.eventId = eventId

  // Update event evidence index
  const idx = graph.eventEvidenceIndex.get(eventId) || []
  if (!idx.includes(evidenceId)) {
    idx.push(evidenceId)
    graph.eventEvidenceIndex.set(eventId, idx)
  }
}

// ── Query Helpers ───────────────────────────────────────────────────────────

export function getEvidenceForOrganization(
  graph: V3EvidenceGraph,
  orgId: string,
): V3Evidence[] {
  const ids = graph.orgEvidenceIndex.get(orgId) || []
  return ids.map((id) => graph.evidence.get(id)).filter(Boolean) as V3Evidence[]
}

export function getEventsForOrganization(
  graph: V3EvidenceGraph,
  orgId: string,
): V3Event[] {
  const ids = graph.orgEventIndex.get(orgId) || []
  return ids.map((id) => graph.events.get(id)).filter(Boolean) as V3Event[]
}

export function getActiveEvidence(graph: V3EvidenceGraph): V3Evidence[] {
  return Array.from(graph.evidence.values()).filter(
    (e) => e.polarity === 'ACTIVE' || e.polarity === 'FUTURE'
  )
}

export function getActiveEvents(graph: V3EvidenceGraph): V3Event[] {
  return Array.from(graph.events.values()).filter(
    (e) => e.polarity === 'ACTIVE' || e.polarity === 'FUTURE'
  )
}

// ── Utility ──────────────────────────────────────────────────────────────────

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').trim()
}
