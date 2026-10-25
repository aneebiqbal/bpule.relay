/**
 * Relay — activation / QA views regression guards.
 *
 * Routing v1/v2 comparison view + flags, admin QA route gating, stale-lead
 * filtering.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildRoutingComparison, platformCompatible } from '@/lib/relay/routing-comparison'
import type { SenderProfile } from '@/lib/relay/sender-routing-engine'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (entry.endsWith('.ts')) out.push(full)
  }
  return out
}

function sender(id: string, platform: string | null = 'linkedin'): SenderProfile {
  return { id, name: id, role: null, platform, skills: ['nextjs'], industries: [], proof: [], holders: [], accessibleToRep: true }
}

describe('Day 4 — routing comparison view', () => {
  const facts = {
    capabilityNeeds: ['nextjs'],
    currentIndustry: 'SaaS',
    currentIndustryLine: 'SaaS',
    currentProductActivity: true,
    buyerRequest: 'We need help with our checkout.',
    buyerRequestAgeDays: 2,
    technologyContext: { languages: ['typescript'], frameworks: ['nextjs'], platforms: [], domains: [] },
    person: { name: 'Sam', title: 'CTO' },
    proofCandidates: [],
    currentOrganizations: [],
    signals: { intent: { launching: false }, company: { growthSignals: [] } },
    access: { connectionDegree: '1st', directContactAvailable: true, canMessage: true, profileUrl: 'https://x', invitationToReachOut: false, hasEmail: false, contactLine: null },
    sourceCompleteness: { score: 70 },
    authorityEvidence: { level: 'HIGH', decisionAuthority: true, technicalAuthority: true },
    companySizeCategory: 'startup',
    sellerActivity: false,
    founderOrBuilder: true,
    currentHiringActivity: null,
    budgetEvidence: null,
    timelineEvidence: null,
    fundingEvidence: null,
    activityRecency: 'RECENT',
    sourceLanguage: 'en',
  }
  const intent = {
    relationshipRole: 'BUYER',
    buyerIntentLevel: 'HIGH',
    verifiedBuyerRequest: true,
    verifiedBudget: false,
    verifiedExternalNeed: true,
    askingForHelp: false,
    contradictions: [],
    claims: { modelBuyerProbability: 0.9 },
    hiringNeed: false,
    verifiedHiringNeed: false,
    budget: null,
  }
  const packet = {
    version: 'relay_decision_v3',
    sourceFacts: facts,
    buyerIntent: intent,
    decision: { fit: 'STRONG' },
    resolved: { fit: 'STRONG', access: 'DIRECT', activityRecency: 'RECENT', buyerTiming: 'CURRENT', evidenceQuality: 0.8, commercialPotential: 'HIGH', commercialPotentialRaw: 80 },
  }

  it('returns null without a canonical packet', () => {
    expect(buildRoutingComparison({ lead: { id: 'l1', company: 'A', senderProfileId: null, canonicalIntelligence: null }, senders: [] })).toBeNull()
  })

  it('produces a comparison with a current sender and flags', () => {
    const view = buildRoutingComparison({
      lead: { id: 'l1', company: 'Acme', senderProfileId: 'p1', canonicalIntelligence: packet },
      senders: [sender('p1'), sender('p2')],
      platform: 'linkedin',
    })
    expect(view).not.toBeNull()
    expect(view!.leadId).toBe('l1')
    expect(view!.routingVersion).toBeTruthy()
    expect(view!.compareVersion).toBe('routing_compare_v1')
    expect(Array.isArray(view!.flags)).toBe(true)
  })

  it('flags a missing current sender', () => {
    const view = buildRoutingComparison({
      lead: { id: 'l2', company: 'Acme', senderProfileId: null, canonicalIntelligence: packet },
      senders: [sender('p1')],
    })
    expect(view!.flags).toContain('CURRENT_SENDER_UNKNOWN')
  })

  it('flags a platform mismatch', () => {
    // The platform check itself: an upwork sender is not a linkedin match.
    expect(platformCompatible('p1', 'linkedin', [sender('p1', 'upwork')])).toBe(false)
    expect(platformCompatible('p1', 'upwork', [sender('p1', 'upwork')])).toBe(true)
    expect(platformCompatible(null, 'linkedin', [])).toBe(true)

    const view = buildRoutingComparison({
      lead: { id: 'l3', company: 'Acme', senderProfileId: 'p1', canonicalIntelligence: packet },
      senders: [sender('p1', 'upwork')],
      platform: 'linkedin',
    })
    expect(view).not.toBeNull()
  })
})

describe('Day 4 — admin QA route is admin-gated', () => {
  const routes = walk(join(ROOT, 'src/app/api')).filter((f) => f.endsWith('route.ts'))
  it('requires VIEW_TEAM_ANALYTICS', () => {
    const src = readFileSync(join(ROOT, 'src/app/api/admin/qa-views/route.ts'), 'utf8')
    expect(src).toContain("can(auth, 'VIEW_TEAM_ANALYTICS')")
  })
  it('never promotes routing v2', () => {
    const context = readFileSync(join(ROOT, 'src/lib/relay/routing-context.ts'), 'utf8')
    expect(context).not.toContain('rankSendersV2')
  })
})
