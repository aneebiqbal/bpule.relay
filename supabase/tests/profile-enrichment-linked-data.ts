/**
 * Profile Enrichment + Safe Merge — linked-data verification against a REAL
 * local Supabase stack (Postgres + PostgREST + Storage).
 *
 *   PROFILE IDENTITY IS PERMANENT. IMPORT ENRICHES THE PROFILE.
 *   IMPORT NEVER DESTROYS RELATIONSHIPS.
 *
 * Builds: Profile → Revenue Identity → Leads → Messages → Relay Runs →
 * Assignments → Proof → Reviews → Projects → Sources (+ contracts, voice,
 * conversation state, sales memory, claims), then imports additional data
 * and proves every relationship is unchanged.
 *
 * Only the AI extraction step is replaced by a deterministic extractor; the
 * merge engine, storage, RPC transactions and invariant checks are real.
 *
 * Refuses to run against anything but localhost.
 *
 * Usage:
 *   ENRICH_TEST_SUPABASE_WORKDIR=/path/to/local/stack npx tsx supabase/tests/profile-enrichment-linked-data.ts
 *   (or set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for a local stack)
 */

import { execFileSync, execSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  applyEnrichmentRun,
  createEnrichmentRun,
  EnrichmentError,
  executeProfileMerge,
  loadProfileState,
  previewProfileMerge,
  processNextEnrichmentSource,
  proposeRun,
  recordHumanEdits,
} from '../../src/lib/profile-intelligence/enrichment-service'
import type { SourceExtractor } from '../../src/lib/profile-intelligence/enrichment-extract'
import type { EnrichmentProposal, SourceExtraction } from '../../src/lib/profile-intelligence/enrichment'

// ── Connection (local only) ─────────────────────────────────────────────────

function dbUrl(): string {
  const workdir = process.env.ENRICH_TEST_SUPABASE_WORKDIR
  const url = workdir
    ? JSON.parse(execSync(`supabase status --workdir ${JSON.stringify(workdir)} -o json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).DB_URL
    : process.env.ENRICH_TEST_DB_URL
  if (!url || !/@(127\.0\.0\.1|localhost):/.test(url)) throw new Error('REFUSING: DB url is not local.')
  return url
}

function connect(): SupabaseClient {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const workdir = process.env.ENRICH_TEST_SUPABASE_WORKDIR
  if (workdir) {
    const status = JSON.parse(execSync(`supabase status --workdir ${JSON.stringify(workdir)} -o json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
    url = status.API_URL
    key = status.SERVICE_ROLE_KEY
  }
  if (!url || !key) throw new Error('No local Supabase configured.')
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) {
    throw new Error(`REFUSING TO RUN: ${new URL(url).host} is not a local stack. This test writes fixture data.`)
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

const TAG = Date.now().toString(36)
let passes = 0
let failures = 0
function check(cond: unknown, msg: string) {
  if (cond) { passes++; console.log(`   ✅ ${msg}`) } else { failures++; console.log(`   ❌ FAIL: ${msg}`) }
}
function section(title: string) { console.log(`\n── ${title}`) }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function must(p: PromiseLike<{ data: any; error: { message: string } | null }>, what: string): Promise<any> {
  const { data, error } = await p
  if (error) throw new Error(`${what}: ${error.message}`)
  return data
}

// ── Deterministic extractor ─────────────────────────────────────────────────

const EXTRACTIONS = new Map<string, Omit<SourceExtraction, 'sourceId' | 'fingerprint' | 'extractedAt'>>()
const extractor: SourceExtractor = async (input) => {
  const text = new TextDecoder().decode(input.buffer)
  const key = text.split('\n')[0].trim() // first line = fixture key
  const ex = EXTRACTIONS.get(key)
  if (!ex) throw new Error(`fixture extractor: unknown source "${key}"`)
  if (key === 'EXPLODE') throw new Error('simulated parser crash')
  return {
    extraction: { ...ex, sourceId: input.sourceId, fingerprint: input.fingerprint, extractedAt: new Date().toISOString() },
    parsedContent: text,
    pageCount: 1,
  }
}

const facts = (over: Record<string, unknown>) => ({
  fullName: null, displayName: null, currentRole: null, company: null, location: null, headline: null, bio: null,
  professionalSummary: null, seniority: null, yearsExperience: null, primarySkills: [], secondarySkills: [], technologies: [],
  industries: [], serviceCapabilities: [], specialties: [], positioning: null, differentiators: [], languages: [],
  communicationStyle: {}, projects: [], proofs: [], reviews: [], people: [], ...over,
}) as any

EXTRACTIONS.set('HASSAN-CV-2026', {
  filename: 'hassan-cv-2026.pdf', isSpreadsheet: false,
  people: [
    {
      name: 'Hassan Raza',
      facts: facts({
        fullName: 'Hassan Raza', currentRole: 'Staff Engineer', company: 'NovaPay', location: 'Lahore, Pakistan',
        professionalSummary: 'Backend engineer. Eight years building payment systems and data pipelines at scale.',
        yearsExperience: 8, primarySkills: ['python', 'FastAPI', 'Kafka'], technologies: ['postgres', 'Redis'],
        industries: ['Fintech'],
        employmentHistory: [
          { role: 'Senior Backend Engineer', company: 'BPulse', startDate: '2020', endDate: '2024', isCurrent: false },
          { role: 'Staff Engineer', company: 'NovaPay', startDate: '2024', endDate: null, isCurrent: true },
        ],
      }),
      projects: [
        { name: 'E-commerce API', clientCompany: null, role: 'Lead', summary: 'Django REST API', technologies: ['Django'], responsibilities: [], problem: null, workPerformed: null, outcome: null, startDate: null, endDate: null, evidenceType: 'explicit_claim', confidence: 0.9, sourceReferences: [] },
        { name: 'Real-time Analytics Pipeline', clientCompany: 'BPulse', role: 'Architect', summary: 'Kafka + Flink pipeline processing 2M events/day', technologies: ['Kafka', 'Python'], responsibilities: [], problem: null, workPerformed: null, outcome: 'Cut reporting latency from hours to seconds', startDate: '2022', endDate: '2023', evidenceType: 'explicit_claim', confidence: 0.85, sourceReferences: [] },
      ],
      proofs: [
        { claim: 'Built payment reconciliation handling 1M transactions/day', whyItMatters: 'scale', supportingEvidence: 'cv', technologyDomain: 'payments', confidence: 0.85, safeForOutreach: true, evidenceType: 'explicit_claim' },
        { claim: 'Designed a Kafka pipeline cutting reporting latency to seconds', whyItMatters: 'speed', supportingEvidence: 'cv', technologyDomain: 'data', confidence: 0.8, safeForOutreach: true, evidenceType: 'explicit_claim' },
      ],
    },
    { name: 'Fiza Khan', facts: facts({ fullName: 'Fiza Khan', currentRole: 'Frontend Engineer', primarySkills: ['React'] }), projects: [], proofs: [] },
  ],
  reviews: [
    { reviewText: 'Hassan rebuilt our checkout API in three weeks. Outstanding.', assignedPersonName: 'Hassan Raza', reviewerName: 'Sara', reviewerCompany: 'ShopCo', relevantSkills: ['Django'], projectContext: 'E-commerce API', confidence: 0.9, evidenceType: 'explicit_claim', ownershipStatus: 'clear' },
    { reviewText: 'Fiza is a superb frontend engineer.', assignedPersonName: 'Fiza Khan', reviewerName: 'Omar', reviewerCompany: null, relevantSkills: [], projectContext: null, confidence: 0.9, evidenceType: 'explicit_claim', ownershipStatus: 'clear' },
  ],
})

EXTRACTIONS.set('HASSAN-PROJECTS-CSV', {
  filename: 'hassan-projects.csv', isSpreadsheet: true,
  cellValues: ['Hassan Raza', 'Lahore, Pakistan', 'Terraform', 'Payments Ledger', 'Python'],
  people: [{
    name: 'Hassan Raza',
    facts: facts({ fullName: 'Hassan Raza', location: 'Lahore, Pakistan', technologies: ['Terraform', 'Python'] }),
    projects: [
      { name: 'Payments Ledger', clientCompany: 'NovaPay', role: 'Tech lead', summary: 'Double-entry ledger service', technologies: ['Go', 'Postgres'], responsibilities: [], problem: null, workPerformed: null, outcome: null, startDate: '2024', endDate: null, evidenceType: 'fact', confidence: 0.9, sourceReferences: [] },
    ],
    proofs: [],
  }],
  reviews: [
    // duplicate of an existing review (different whitespace/case)
    { reviewText: '  hassan is the most reliable backend engineer we have worked with.  ', assignedPersonName: 'Hassan Raza', reviewerName: 'Ali', reviewerCompany: 'BPulse', relevantSkills: [], projectContext: null, confidence: 0.9, evidenceType: 'explicit_claim', ownershipStatus: 'clear' },
  ],
})

// Different bytes, same facts as the CV → everything must be DUPLICATE.
EXTRACTIONS.set('HASSAN-CV-2026-DOCX-COPY', { ...EXTRACTIONS.get('HASSAN-CV-2026')!, filename: 'hassan-cv-2026.docx' })
EXTRACTIONS.set('EXPLODE', { filename: 'broken.pdf', isSpreadsheet: false, people: [], reviews: [] })
EXTRACTIONS.set('HASSAN-LOCATION-ONLY', {
  filename: 'note.txt', isSpreadsheet: false,
  people: [{ name: 'Hassan Raza', facts: facts({ fullName: 'Hassan Raza', headline: 'Payments & data infrastructure engineer', languages: ['Urdu', 'English'] }), projects: [], proofs: [] }],
  reviews: [],
})

// Bytes depend only on key + variant, so a renamed copy is byte-identical.
const file = (key: string, name: string, type = 'text/plain', variant = '') => ({ name, type, bytes: new TextEncoder().encode(`${key}\nfixture body ${variant}\n`) })

async function runImport(client: SupabaseClient, ctx: Ctx, files: ReturnType<typeof file>[]) {
  const created = await createEnrichmentRun(client, { orgId: ctx.orgId, profileId: ctx.profileA, actorRepId: ctx.rep1, files })
  let step = await processNextEnrichmentSource(client, { orgId: ctx.orgId, runId: created.run.id, extractor })
  let guard = 0
  while (!step.done && guard++ < 20) step = await processNextEnrichmentSource(client, { orgId: ctx.orgId, runId: created.run.id, extractor })
  return { created, run: step.run }
}

// ── Fixture ─────────────────────────────────────────────────────────────────

interface Ctx { orgId: string; rep1: string; rep2: string; profileA: string; profileC: string; riA: string }

async function buildFixture(client: SupabaseClient): Promise<Ctx> {
  const tag = TAG
  const org = await must(client.from('organizations').insert({ name: `Enrich Fixture ${tag}` }).select('id').single(), 'org')
  const orgId = org.id
  const rep1 = (await must(client.from('reps').insert({ name: 'Aneeb (fixture)', role: 'admin', organization_id: orgId }).select('id').single(), 'rep1')).id
  const rep2 = (await must(client.from('reps').insert({ name: 'Mehak (fixture)', role: 'rep', organization_id: orgId }).select('id').single(), 'rep2')).id

  const profileA = (await must(client.from('profiles').insert({
    organization_id: orgId, rep_id: rep1, platform: 'linkedin', label: 'Hassan — LinkedIn',
    full_name: 'Hassan Raza', display_name: 'Hassan Raza', current_role: 'Senior Backend Engineer', company: 'BPulse',
    professional_summary: 'Backend engineer.', primary_skills: ['Python', 'Django'], technologies: ['PostgreSQL'],
    readiness: 'ready', source_count: 1, proof_count: 2, ai_context: { identitySummary: 'original' },
  }).select('id').single(), 'profileA')).id
  const profileC = (await must(client.from('profiles').insert({
    organization_id: orgId, rep_id: rep2, platform: 'linkedin', full_name: 'Fiza Khan', current_role: 'Frontend Engineer', primary_skills: ['React'],
  }).select('id').single(), 'profileC')).id

  // Human-verified truth: current role was confirmed by a human.
  await recordHumanEdits(client, { orgId, profileId: profileA, repId: rep1, before: { current_role: null }, after: { current_role: 'Senior Backend Engineer' } })

  const riA = (await must(client.from('revenue_identities').insert({ organization_id: orgId, slug: `hassan-${tag}`, identity_name: 'Hassan Raza', profile_id: profileA, channel: 'linkedin' }).select('id').single(), 'ri')).id
  await must(client.from('profile_assignments').insert([{ rep_id: rep1, profile_id: profileA }, { rep_id: rep2, profile_id: profileC }]), 'assign')
  await must(client.from('identity_assignments').insert({ organization_id: orgId, revenue_identity_id: riA, rep_id: rep1 }), 'identity_assign')

  const leads = await must(client.from('leads').insert([
    { organization_id: orgId, company: `Acme Health ${TAG}`, sender_profile_id: profileA, status: 'contacted' },
    { organization_id: orgId, company: `ShopCo ${TAG}`, sender_profile_id: profileA, status: 'replied' },
    { organization_id: orgId, company: `Ledgerly ${TAG}`, sender_profile_id: profileA, status: 'new' },
    { organization_id: orgId, company: `DesignHub ${TAG}`, sender_profile_id: profileC, status: 'new' },
  ]).select('id, sender_profile_id'), 'leads')
  const aLeads = leads.filter((l: any) => l.sender_profile_id === profileA)
  await must(client.from('messages').insert([
    ...aLeads.flatMap((l: any) => [
      { organization_id: orgId, lead_id: l.id, type: 'connection', sender_profile_id: profileA, direction: 'outbound' },
      { organization_id: orgId, lead_id: l.id, type: 'dm', sender_profile_id: profileA, direction: 'outbound' },
    ]),
    { organization_id: orgId, lead_id: leads.find((l: any) => l.sender_profile_id === profileC).id, type: 'dm', sender_profile_id: profileC, direction: 'outbound' },
  ]), 'messages')
  await must(client.from('conversation_states').insert({ organization_id: orgId, lead_id: aLeads[0].id, sender_profile_id: profileA }), 'conv')
  await must(client.from('relay_runs').insert([
    { organization_id: orgId, run_type: 'outbound', status: 'detected', revenue_identity_id: riA, primary_entity_type: 'lead', primary_entity_id: aLeads[0].id },
    { organization_id: orgId, run_type: 'outbound', status: 'detected', revenue_identity_id: riA, primary_entity_type: 'lead', primary_entity_id: aLeads[1].id },
  ]), 'relay_runs')
  await must(client.from('proof_cards').insert([
    { organization_id: orgId, profile_id: profileA, capability: 'Payments', safe_claim: 'Built payment reconciliation handling 1M transactions/day', source_type: 'cv', verified: true },
    { organization_id: orgId, profile_id: profileA, capability: 'APIs', safe_claim: 'Shipped Django REST APIs for e-commerce', source_type: 'project', verified: false },
  ]), 'proofs')
  await must(client.from('profile_reviews').insert({ organization_id: orgId, profile_id: profileA, review_text: 'Hassan is the most reliable backend engineer we have worked with.', reviewer_name: 'Ali' }), 'review')
  await must(client.from('portfolio_projects').insert([
    { organization_id: orgId, profile_id: profileA, project_title: 'E-commerce API', my_role: 'Lead', description: 'Django REST API', technologies: ['Django'] },
    { organization_id: orgId, profile_id: profileA, project_title: 'Real-time Analytics Pipeline', technologies: ['Kafka'] },
  ]), 'projects')
  await must(client.from('client_contracts').insert({ organization_id: orgId, profile_id: profileA, project_title: 'ShopCo checkout rebuild' }), 'contract')
  await must(client.from('voice_profiles').insert({ rep_id: rep1, profile_id: profileA, style_card: { tone: 'direct' }, sample_source: 'quiz' }), 'voice')
  await must(client.from('sales_memory').insert({ organization_id: orgId, profile_id: profileA, memory_type: 'objection_seen', content: 'Budget concerns' }), 'memory')
  const bytes = new TextEncoder().encode('ORIGINAL-CV\nold cv')
  await client.storage.from('profile-sources').upload(`${orgId}/${profileA}/orig.txt`, bytes, { contentType: 'text/plain' })
  await must(client.from('profile_sources').insert({
    organization_id: orgId, profile_id: profileA, storage_path: `${orgId}/${profileA}/orig.txt`, original_filename: 'original-cv.txt',
    mime_type: 'text/plain', file_size_bytes: bytes.byteLength, file_hash: 'legacy-weak-hash', parsing_status: 'parsed', extraction_status: 'extracted', uploaded_by: rep1,
  }), 'source')

  return { orgId, rep1, rep2, profileA, profileC, riA }
}

/** Every relationship that must survive enrichment, by id. */
async function relationshipSnapshot(client: SupabaseClient, ctx: Ctx) {
  const ids = async (table: string, col: string, val: string, extra = 'id') =>
    ((await must(client.from(table).select(extra).eq(col, val).order('id'), table)) as any[]).map((r) => JSON.stringify(r)).sort()
  return {
    profileA: (await must(client.from('profiles').select('id, organization_id, rep_id, archived_at').eq('id', ctx.profileA).single(), 'p')),
    leads: await ids('leads', 'organization_id', ctx.orgId, 'id, sender_profile_id, status'),
    messages: await ids('messages', 'organization_id', ctx.orgId, 'id, lead_id, sender_profile_id'),
    revenueIdentity: await ids('revenue_identities', 'organization_id', ctx.orgId, 'id, profile_id, slug'),
    relayRuns: await ids('relay_runs', 'organization_id', ctx.orgId, 'id, revenue_identity_id, status'),
    assignments: await ids('profile_assignments', 'profile_id', ctx.profileA, 'id, rep_id, profile_id'),
    identityAssignments: await ids('identity_assignments', 'organization_id', ctx.orgId, 'id, rep_id, revenue_identity_id'),
    conversation: await ids('conversation_states', 'organization_id', ctx.orgId, 'id, sender_profile_id'),
    contracts: await ids('client_contracts', 'profile_id', ctx.profileA, 'id, project_title'),
    voice: await ids('voice_profiles', 'profile_id', ctx.profileA, 'id, rep_id'),
    memory: await ids('sales_memory', 'profile_id', ctx.profileA, 'id'),
    profileC: await ids('profiles', 'id', ctx.profileC, 'id, full_name, current_role, primary_skills'),
    // evidence must never lose rows (may gain)
    proofIds: await ids('proof_cards', 'profile_id', ctx.profileA),
    reviewIds: await ids('profile_reviews', 'profile_id', ctx.profileA),
    projectIds: await ids('portfolio_projects', 'profile_id', ctx.profileA),
    sourceIds: await ids('profile_sources', 'profile_id', ctx.profileA),
  }
}

function sameRelationships(a: any, b: any, label: string) {
  for (const k of ['profileA', 'leads', 'messages', 'revenueIdentity', 'relayRuns', 'assignments', 'identityAssignments', 'conversation', 'contracts', 'voice', 'memory', 'profileC']) {
    check(JSON.stringify(a[k]) === JSON.stringify(b[k]), `${label}: ${k} unchanged`)
  }
  for (const k of ['proofIds', 'reviewIds', 'projectIds', 'sourceIds']) {
    check((a[k] as string[]).every((x) => (b[k] as string[]).includes(x)), `${label}: every existing ${k.replace('Ids', '')} row still present`)
  }
}

async function counts(client: SupabaseClient, profileId: string) {
  const c = async (t: string) => (await client.from(t).select('id', { count: 'exact', head: true }).eq('profile_id', profileId)).count ?? 0
  return {
    proofs: await c('proof_cards'), reviews: await c('profile_reviews'), projects: await c('portfolio_projects'),
    sources: await c('profile_sources'), claims: await c('profile_claims'), experience: await c('profile_experience'),
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const client = connect()
  const ctx = await buildFixture(client)
  console.log(`Fixture org ${ctx.orgId.slice(0, 8)}… profile A ${ctx.profileA}`)
  const before = await relationshipSnapshot(client, ctx)
  const countsBefore = await counts(client, ctx.profileA)
  const pBefore = (await loadProfileState(client, ctx.orgId, ctx.profileA))!.profile

  // 1 ─ Dry-run diff: multi-file import produces a proposal, zero mutation.
  section('1. Multi-file import → dry-run diff (no mutation)')
  const imp = await runImport(client, ctx, [file('HASSAN-CV-2026', 'hassan-cv-2026.pdf', 'application/pdf'), file('HASSAN-PROJECTS-CSV', 'hassan-projects.csv', 'text/csv')])
  check(imp.run.status === 'proposed', `run proposed (got ${imp.run.status})`)
  const proposal = imp.run.proposal as EnrichmentProposal
  const find = (pred: (c: EnrichmentProposal['changes'][number]) => boolean) => proposal.changes.find(pred)
  const pNow = (await loadProfileState(client, ctx.orgId, ctx.profileA))!.profile
  check(JSON.stringify(pNow) === JSON.stringify(pBefore), 'profile row byte-identical after extraction + diff (dry-run only)')
  check(JSON.stringify(await counts(client, ctx.profileA)) === JSON.stringify(countsBefore), 'no child rows written before apply')
  check(find((c) => c.field === 'location')?.classification === 'NEW_FACT', 'empty location → NEW_FACT')
  check(find((c) => c.field === 'location')?.incomingAuthority === 'trusted_source_fact', 'spreadsheet cell value → trusted_source_fact authority')
  check(find((c) => c.field === 'location')?.provenance.length === 2, 'same fact from 2 files → ONE change with 2 provenance entries')
  const role = find((c) => c.field === 'current_role')
  check(role?.classification === 'CONFLICT' && role.existingAuthority === 'human_verified' && role.preservedByAuthority && role.defaultDecision === 'skip',
    'current_role "Staff Engineer" vs human-verified → CONFLICT, preserved by authority, default keep')
  check(find((c) => c.field === 'company')?.classification === 'CONFLICT', 'company change → CONFLICT (chronology, not replacement)')
  const summary = find((c) => c.field === 'professional_summary')
  check(summary?.classification === 'UPDATE' && summary.preservedByAuthority && summary.defaultDecision === 'skip',
    'richer summary vs legacy trusted value → UPDATE held back by authority')
  check(find((c) => c.field === 'years_experience')?.classification === 'NEW_FACT', 'years_experience empty → NEW_FACT')
  check(find((c) => c.kind === 'list_item' && c.field === 'primary_skills' && c.incomingValue === 'Python')?.classification === 'DUPLICATE', '"python" vs "Python" → DUPLICATE (normalized)')
  check(find((c) => c.kind === 'list_item' && c.field === 'primary_skills' && c.incomingValue === 'FastAPI')?.classification === 'NEW_FACT', 'FastAPI → NEW_FACT')
  check(find((c) => c.kind === 'project' && c.incomingValue === 'E-commerce API')?.classification === 'DUPLICATE', 'identical project → DUPLICATE')
  check(find((c) => c.kind === 'project' && c.incomingValue === 'Real-time Analytics Pipeline')?.classification === 'UPDATE', 'existing project with empty fields → UPDATE (fill-empty)')
  check(find((c) => c.kind === 'project' && c.incomingValue === 'Payments Ledger')?.classification === 'NEW_FACT', 'new project → NEW_FACT')
  check(find((c) => c.kind === 'proof' && String(c.incomingValue).startsWith('Built payment'))?.classification === 'DUPLICATE', 'existing proof → DUPLICATE')
  check(find((c) => c.kind === 'proof' && String(c.incomingValue).startsWith('Designed a Kafka'))?.classification === 'NEW_FACT', 'new proof → NEW_FACT')
  check(find((c) => c.kind === 'review' && String(c.incomingValue).includes('most reliable'))?.classification === 'DUPLICATE', 'review differing only in case/whitespace → DUPLICATE')
  check(find((c) => c.kind === 'review' && String(c.incomingValue).startsWith('Fiza'))?.classification === 'UNKNOWN', "other person's review → UNKNOWN, not imported")
  check(find((c) => c.field === 'person' && c.incomingValue === 'Fiza Khan')?.classification === 'UNKNOWN', 'other person in source → UNKNOWN')
  check(proposal.summary.derivedToRecompute.includes('ai_context'), 'diff lists derived intelligence to recompute')

  // 2 ─ Transaction rollback: a failure late in the transaction leaves nothing behind.
  section('2. Forced failure inside the transaction → full rollback')
  const { error: rbErr } = await client.rpc('apply_profile_enrichment', {
    p_run_id: imp.run.id, p_organization_id: ctx.orgId, p_actor_rep_id: ctx.rep1,
    p_plan: {
      scalar_updates: [{ field: 'location', expected: null, value: 'SHOULD NOT PERSIST' }],
      array_appends: [{ field: 'primary_skills', items: ['ROLLBACK-SKILL'] }],
      projects_insert: [{ fingerprint: 'rb-1', project_title: 'ROLLBACK PROJECT', technologies: [] }],
      claims_insert: [{ claim_key: 'location', claim_value: 'x', fingerprint: 'rb-claim' }],
      // violates proof_cards.source_type check → aborts after the writes above
      proofs_insert: [{ fingerprint: 'rb-2', capability: 'x', strength: 'strong', safe_claim: 'x', source_type: 'NOT_A_VALID_TYPE' }],
    },
  })
  check(!!rbErr, `RPC failed as intended (${rbErr?.message.slice(0, 60)}…)`)
  const pAfterRb = (await loadProfileState(client, ctx.orgId, ctx.profileA))!.profile
  check(JSON.stringify(pAfterRb) === JSON.stringify(pBefore), 'profile unchanged after rollback')
  check(JSON.stringify(await counts(client, ctx.profileA)) === JSON.stringify(countsBefore), 'no partial child rows remain after rollback')
  check((await proposeRunStatus(client, imp.run.id)) === 'proposed', 'run still retryable (proposed)')
  sameRelationships(before, await relationshipSnapshot(client, ctx), 'after rollback')

  // 3 ─ Apply with default decisions.
  section('3. Apply (defaults) → merged into SAME profile.id')
  let synthCalls = 0
  const applied = await applyEnrichmentRun(client, {
    orgId: ctx.orgId, runId: imp.run.id, actorRepId: ctx.rep1, decisions: {},
    synthesize: async (p) => { synthCalls++; return { identitySummary: `recomputed for ${p.full_name}`, skills: p.primary_skills } },
  })
  check(applied.profileId === ctx.profileA, 'profile.id_before === profile.id_after')
  const after1 = await relationshipSnapshot(client, ctx)
  sameRelationships(before, after1, 'after apply')
  const s1 = (await loadProfileState(client, ctx.orgId, ctx.profileA))!
  const p1 = s1.profile
  check(p1.current_role === 'Senior Backend Engineer' && p1.company === 'BPulse', 'human-verified current role + company preserved')
  check(p1.professional_summary === 'Backend engineer.', 'higher-authority summary not overwritten')
  check(p1.location === 'Lahore, Pakistan', 'empty location filled')
  check(Number(p1.years_experience) === 8, 'years_experience filled')
  check(JSON.stringify(p1.primary_skills) === JSON.stringify(['Python', 'Django', 'FastAPI', 'Kafka']), `skills appended in order, no dupes (${p1.primary_skills.join(', ')})`)
  check(p1.technologies.includes('Terraform') && p1.technologies.filter((t: string) => t.toLowerCase().includes('postgres')).length === 1, 'technologies union without duplicate Postgres')
  check(s1.projects.length === 3, `projects 2 → 3 (${s1.projects.length})`)
  const rtp = s1.projects.find((p) => p.project_title === 'Real-time Analytics Pipeline')!
  check(rtp.my_role === 'Architect' && rtp.outcome && (rtp.technologies ?? []).includes('Kafka') && (rtp.technologies ?? []).includes('Python'), 'existing project enriched (empty fields filled, tech unioned)')
  const ecom = s1.projects.find((p) => p.project_title === 'E-commerce API')!
  check(ecom.description === 'Django REST API' && ecom.my_role === 'Lead', 'existing populated project untouched')
  check(s1.proofs.length === 3, `proofs 2 → 3 (${s1.proofs.length})`)
  check(s1.reviews.length === 2, `reviews 1 → 2; Fiza's review not attached (${s1.reviews.length})`)
  check(s1.experience.length === 2, `role history holds old + new roles (no twin rows) (${s1.experience.map((e) => `${e.role}${e.is_current ? '*' : ''}`).join(', ')})`)
  check(s1.experience.filter((e) => e.is_current).length === 1 && s1.experience.find((e) => e.is_current)?.role === 'Senior Backend Engineer', 'exactly one current role — the human-verified one')
  const roleClaims = s1.claims.filter((c) => c.claim_key === 'current_role')
  check(roleClaims.some((c) => c.claim_value === 'Staff Engineer' && c.claim_status === 'conflict'), 'conflicting role recorded as claim (status=conflict) with provenance')
  check(roleClaims.some((c) => c.claim_value === 'Senior Backend Engineer' && c.user_corrected && c.claim_status === 'active'), 'human-verified claim still active')
  const { data: locClaims } = await client.from('profile_claims').select('source_id, source_filename, enrichment_run_id, authority, corroborating_source_ids, created_at').eq('profile_id', ctx.profileA).eq('claim_key', 'location')
  check(locClaims?.length === 1 && locClaims[0].corroborating_source_ids.length === 2 && !!locClaims[0].enrichment_run_id && !!locClaims[0].source_filename,
    'location claim: 1 row, provenance = source, file, run, timestamp, 2 corroborating sources')
  check(p1.source_count === 3 && s1.proofs.length === p1.proof_count, `derived counters recomputed (sources=${p1.source_count}, proofs=${p1.proof_count})`)
  check(synthCalls === 1 && p1.ai_context?.identitySummary === 'recomputed for Hassan Raza', 'derived ai_context recomputed')
  const { data: runRow } = await client.from('profile_enrichment_runs').select('*').eq('id', imp.run.id).single()
  const audit = runRow.audit
  check(runRow.status === 'applied' && audit.profile_id === ctx.profileA && audit.import_batch_id && audit.source_ids.length === 2 && audit.actor_rep_id === ctx.rep1 && audit.timestamp,
    'audit: profile_id, import_batch_id, source_ids, actor, timestamp')
  check(audit.additions.length > 0 && audit.updates.length > 0 && audit.ignored_duplicates.length > 0 && audit.conflicts.length > 0 && audit.preserved_by_authority.length > 0,
    `audit: additions=${audit.additions.length} updates=${audit.updates.length} dupes=${audit.ignored_duplicates.length} conflicts=${audit.conflicts.length} preserved=${audit.preserved_by_authority.length}`)
  check(JSON.stringify(runRow.relationship_counts_before) !== '{}' && runRow.relationship_counts_before['leads.sender_profile_id'] === runRow.relationship_counts_after['leads.sender_profile_id'],
    'DB-side invariant: relationship counts recorded before/after and equal for leads')
  let reapplyErr: unknown = null
  try { await applyEnrichmentRun(client, { orgId: ctx.orgId, runId: imp.run.id, actorRepId: ctx.rep1, decisions: {} }) } catch (e) { reapplyErr = e }
  check(reapplyErr instanceof EnrichmentError && reapplyErr.status === 409, 'applying the same run twice is refused')

  // 4 ─ Idempotency: identical bytes, and identical facts in a different file.
  section('4. Re-import → no duplicate facts/skills/projects/reviews/proofs/claims/sources')
  const c1 = await counts(client, ctx.profileA)
  const re = await runImport(client, ctx, [file('HASSAN-CV-2026', 'renamed-cv.pdf', 'application/pdf'), file('HASSAN-PROJECTS-CSV', 'hassan-projects.csv', 'text/csv')])
  check(re.created.alreadyImported.length === 2 && re.created.sourceIds.length === 0, 'same bytes (even renamed) detected by SHA-256 fingerprint; no new source rows')
  const docx = await runImport(client, ctx, [file('HASSAN-CV-2026-DOCX-COPY', 'hassan-cv-2026.docx', 'text/plain')])
  const dp = docx.run.proposal as EnrichmentProposal
  const actionable = dp.changes.filter((c) => c.defaultDecision === 'apply')
  check(actionable.length === 0, `different file, same facts → nothing to apply (${actionable.map((c) => `${c.field}:${c.incomingValue}`).join('; ') || 'none'})`)
  await applyEnrichmentRun(client, { orgId: ctx.orgId, runId: docx.run.id, actorRepId: ctx.rep1, decisions: {} })
  const c2 = await counts(client, ctx.profileA)
  check(c2.proofs === c1.proofs && c2.reviews === c1.reviews && c2.projects === c1.projects && c2.claims === c1.claims && c2.experience === c1.experience,
    `no duplicate rows after re-import (claims ${c1.claims}→${c2.claims}, proofs ${c1.proofs}→${c2.proofs})`)
  check(c2.sources === c1.sources + 1, 'the genuinely new file is linked once as a source')
  const p2 = (await loadProfileState(client, ctx.orgId, ctx.profileA))!.profile
  check(JSON.stringify(p2.primary_skills) === JSON.stringify(p1.primary_skills), 'skills unchanged by re-import')
  const { data: corro } = await client.from('profile_claims').select('corroborating_source_ids').eq('profile_id', ctx.profileA).eq('claim_key', 'years_experience').single()
  check(corro?.corroborating_source_ids.length === 2, 'duplicate fact corroborates existing claim instead of duplicating it')

  // 5 ─ Stale diff protection.
  section('5. Profile edited after diff → apply refused, nothing written')
  const stale = await runImport(client, ctx, [file('HASSAN-LOCATION-ONLY', 'note.txt')])
  await client.from('profiles').update({ headline: 'Edited by a human meanwhile' }).eq('id', ctx.profileA)
  const cS = await counts(client, ctx.profileA)
  let staleErr: any = null
  try { await applyEnrichmentRun(client, { orgId: ctx.orgId, runId: stale.run.id, actorRepId: ctx.rep1, decisions: {} }) } catch (e) { staleErr = e }
  check(staleErr instanceof EnrichmentError && staleErr.status === 409, 'stale diff → 409')
  const pS = (await loadProfileState(client, ctx.orgId, ctx.profileA))!.profile
  check(pS.headline === 'Edited by a human meanwhile' && JSON.stringify(pS.languages ?? []) === JSON.stringify(p2.languages ?? []), 'human edit intact, nothing from stale diff written')
  check(JSON.stringify(await counts(client, ctx.profileA)) === JSON.stringify(cS), 'no rows written by refused apply')
  const refreshed = (await client.from('profile_enrichment_runs').select('status, proposal').eq('id', stale.run.id).single()).data!
  check(refreshed.status === 'proposed' && (refreshed.proposal as EnrichmentProposal).changes.find((c) => c.field === 'headline')?.classification === 'CONFLICT',
    'diff regenerated against fresh state (headline now a conflict)')

  // 6 ─ Failed extraction: one bad file does not poison the import.
  section('6. One broken file in a multi-file import')
  const partial = await runImport(client, ctx, [file('EXPLODE', 'broken.pdf', 'application/pdf'), file('HASSAN-LOCATION-ONLY', 'note-2.txt')])
  check(partial.run.status === 'proposed' && (partial.run.proposal as any).failedSources.length === 1, 'broken source reported, others proposed')
  check(partial.created.sourceIds.includes(stale.created.sourceIds[0]), 'retry: same file from an unapplied import reuses its source row (no duplicate source)')

  // 7 ─ Human override + chronology.
  section('7. Human approves new role → old role preserved in history')
  const hr = await runImport(client, ctx, [file('HASSAN-CV-2026-DOCX-COPY', 'cv-v3.txt', 'text/plain', 'v3')])
  const hp = hr.run.proposal as EnrichmentProposal
  const roleC = hp.changes.find((c) => c.field === 'current_role')!
  const compC = hp.changes.find((c) => c.field === 'company')!
  await applyEnrichmentRun(client, { orgId: ctx.orgId, runId: hr.run.id, actorRepId: ctx.rep1, decisions: { [roleC.id]: 'apply', [compC.id]: 'apply' } })
  const s7 = (await loadProfileState(client, ctx.orgId, ctx.profileA))!
  check(s7.profile.current_role === 'Staff Engineer' && s7.profile.company === 'NovaPay', 'explicit human decision moved current role')
  check(s7.experience.some((e) => e.role === 'Senior Backend Engineer' && !e.is_current) && s7.experience.filter((e) => e.is_current).length === 1 && s7.experience.find((e) => e.is_current)?.role === 'Staff Engineer',
    `old role kept as history, one current (${s7.experience.map((e) => `${e.role}${e.is_current ? '*' : ''}`).join(', ')})`)
  check(s7.claims.some((c) => c.claim_key === 'current_role' && c.claim_value === 'Senior Backend Engineer' && c.claim_status === 'historical'), 'previous value retained as historical claim')
  check(s7.claims.some((c) => c.claim_key === 'current_role' && c.claim_value === 'Staff Engineer' && c.authority === 'human_verified'), 'approved value now human_verified')
  sameRelationships(before, await relationshipSnapshot(client, ctx), 'after human override')

  // 8 ─ Refresh preserves everything.
  section('8. Reload (page refresh) preserves everything')
  const final = await relationshipSnapshot(client, ctx)
  sameRelationships(before, final, 'final reload')
  check(final.profileA.id === ctx.profileA && final.profileA.archived_at === null, 'profile A is the same, active row')

  // 9 ─ Safe merge tool: B → A.
  section('9. Safe profile merge B → A (explicit, dry-run first)')
  const profileB = (await must(client.from('profiles').insert({
    organization_id: ctx.orgId, rep_id: ctx.rep1, platform: 'upwork', full_name: 'Hassan Raza', display_name: 'Hassan R.',
    bio: 'Upwork bio for Hassan', primary_skills: ['Go', 'python'],
  }).select('id').single(), 'B')).id
  const bLead = (await must(client.from('leads').insert({ organization_id: ctx.orgId, company: `UpworkClient ${TAG}`, sender_profile_id: profileB, status: 'contacted' }).select('id').single(), 'bLead')).id
  const bMsg = (await must(client.from('messages').insert({ organization_id: ctx.orgId, lead_id: bLead, type: 'upwork', sender_profile_id: profileB, direction: 'outbound' }).select('id').single(), 'bMsg')).id
  await must(client.from('profile_assignments').insert({ rep_id: ctx.rep1, profile_id: profileB }), 'bAssign') // collides with A's
  await must(client.from('voice_profiles').insert({ rep_id: ctx.rep2, profile_id: profileB, style_card: {}, sample_source: 'quiz' }), 'bVoice')
  await must(client.from('proof_cards').insert([
    { organization_id: ctx.orgId, profile_id: profileB, capability: 'dup', safe_claim: 'Built payment reconciliation handling 1M transactions/day', source_type: 'cv' },
    { organization_id: ctx.orgId, profile_id: profileB, capability: 'Go', safe_claim: 'Wrote a Go ledger service', source_type: 'project' },
  ]), 'bProofs')
  const beforeMerge = await relationshipSnapshot(client, ctx)
  const bRowBefore = (await must(client.from('profiles').select('*').eq('id', profileB).single(), 'b'))

  const preview = await previewProfileMerge(client, { orgId: ctx.orgId, sourceId: profileB, targetId: ctx.profileA })
  check(preview.report.dry_run === true && preview.identity.likelySamePerson, `dry-run ok; identity score ${preview.identity.score} (${preview.identity.signals.join('; ')})`)
  check(preview.report.removed_duplicates.length === 2, `dry-run predicts 2 duplicates removed (assignment + proof): ${preview.report.removed_duplicates.map((d: any) => d.table).join(', ')}`)
  const bRowAfterPreview = (await must(client.from('profiles').select('*').eq('id', profileB).single(), 'b2'))
  check(JSON.stringify(bRowAfterPreview) === JSON.stringify(bRowBefore) && (await relationshipSnapshot(client, ctx)).leads.join() === beforeMerge.leads.join(), 'dry-run changed nothing')

  let tokErr: any = null
  try { await executeProfileMerge(client, { orgId: ctx.orgId, sourceId: profileB, targetId: ctx.profileA, actorRepId: ctx.rep1, previewToken: 'wrong' }) } catch (e) { tokErr = e }
  check(tokErr?.status === 409, 'execute without a matching dry-run token is refused')
  let unrelatedErr: any = null
  const pvC = await previewProfileMerge(client, { orgId: ctx.orgId, sourceId: ctx.profileC, targetId: ctx.profileA })
  try { await executeProfileMerge(client, { orgId: ctx.orgId, sourceId: ctx.profileC, targetId: ctx.profileA, actorRepId: ctx.rep1, previewToken: pvC.previewToken }) } catch (e) { unrelatedErr = e }
  check(!pvC.identity.likelySamePerson && unrelatedErr?.status === 409, 'different people (Fiza → Hassan) blocked without explicit acknowledgement')

  const merged = await executeProfileMerge(client, { orgId: ctx.orgId, sourceId: profileB, targetId: ctx.profileA, actorRepId: ctx.rep1, previewToken: preview.previewToken })
  const bAfter = (await must(client.from('profiles').select('*').eq('id', profileB).single(), 'bAfter'))
  check(bAfter.archived_at && bAfter.merged_into_profile_id === ctx.profileA, 'B archived (not deleted), merged_into = A')
  check((await must(client.from('leads').select('sender_profile_id').eq('id', bLead).single(), 'l')).sender_profile_id === ctx.profileA, "B's lead reassigned to A (same lead id)")
  check((await must(client.from('messages').select('sender_profile_id').eq('id', bMsg).single(), 'm')).sender_profile_id === ctx.profileA, "B's message reassigned to A (same message id)")
  check(merged.reassigned_refs['leads.sender_profile_id']?.includes(bLead), 'merge log preserves historical sender attribution (which rows were B)')
  const { data: refsToB } = await client.rpc('profile_relationship_counts', { p_profile_id: profileB })
  check(Object.entries(refsToB as Record<string, number>).every(([k, n]) => k === 'profiles.merged_into_profile_id' || n === 0), 'FK integrity: nothing references B')
  const aAfter = (await loadProfileState(client, ctx.orgId, ctx.profileA))!
  check(aAfter.profile.bio === 'Upwork bio for Hassan' && aAfter.profile.primary_skills.includes('Go') && aAfter.profile.primary_skills.filter((s: string) => s.toLowerCase() === 'python').length === 1,
    "A's empty bio filled from B; skills unioned without duplicate")
  check(aAfter.proofs.filter((p) => p.safe_claim.startsWith('Built payment')).length === 1 && aAfter.proofs.some((p) => p.safe_claim === 'Wrote a Go ledger service'), 'proofs deduplicated, unique B proof kept')
  const { data: log } = await client.from('profile_merge_log').select('*').eq('id', merged.merge_log_id).single()
  check(log && log.source_snapshot.id === profileB && log.removed_duplicates.length === 2, 'merge audit record with snapshots + removed duplicates')
  const { error: logUpdErr } = await client.from('profile_merge_log').update({ actor_rep_id: null }).eq('id', merged.merge_log_id)
  const { error: logDelErr } = await client.from('profile_merge_log').delete().eq('id', merged.merge_log_id)
  check(!!logUpdErr && !!logDelErr, 'merge audit record is immutable (update + delete rejected)')
  const afterMerge = await relationshipSnapshot(client, ctx)
  check(afterMerge.messages.length === beforeMerge.messages.length && afterMerge.leads.length === beforeMerge.leads.length, 'lead/message counts identical before/after merge')
  check(JSON.stringify(afterMerge.revenueIdentity) === JSON.stringify(beforeMerge.revenueIdentity) && JSON.stringify(afterMerge.relayRuns) === JSON.stringify(beforeMerge.relayRuns), "A's revenue identity + relay runs untouched by merge")
  // Merge that fails mid-way (after some rows were already moved) → full rollback.
  section('10. Merge failing mid-transaction → nothing moved')
  const profileD = (await must(client.from('profiles').insert({
    organization_id: ctx.orgId, rep_id: ctx.rep1, platform: 'linkedin', full_name: 'Hassan Raza', label: 'Hassan dup 2',
  }).select('id').single(), 'D')).id
  const dLead = (await must(client.from('leads').insert({ organization_id: ctx.orgId, company: `DupD ${TAG}`, sender_profile_id: profileD, status: 'new' }).select('id').single(), 'dLead')).id
  await must(client.from('sales_memory').insert({ organization_id: ctx.orgId, profile_id: profileD, memory_type: 'angle_used', content: 'FAIL_MERGE' }), 'dMem')
  // Test-only trigger: fails when the merge reaches sales_memory — i.e. AFTER
  // client_contracts/conversation_states/leads/messages were already moved.
  const sql = (q: string) => execFileSync(process.env.PSQL ?? 'psql', [dbUrl(), '-v', 'ON_ERROR_STOP=1', '-qAtc', q], { stdio: ['ignore', 'pipe', 'pipe'] })
  sql(`create or replace function enrich_test_fail() returns trigger language plpgsql as $f$ begin if new.content = 'FAIL_MERGE' then raise exception 'injected failure mid-merge'; end if; return new; end $f$;
       drop trigger if exists enrich_test_fail on sales_memory;
       create trigger enrich_test_fail before update on sales_memory for each row execute function enrich_test_fail();`)
  const { error: dErr } = await client.rpc('merge_profiles', { p_organization_id: ctx.orgId, p_source_profile_id: profileD, p_target_profile_id: ctx.profileA, p_actor_rep_id: ctx.rep1, p_dry_run: false, p_identity_check: {} })
  sql('drop trigger if exists enrich_test_fail on sales_memory; drop function if exists enrich_test_fail();')
  check(/injected failure/.test(dErr?.message ?? ''), `merge failed mid-way (${dErr?.message})`)
  check((await must(client.from('leads').select('sender_profile_id').eq('id', dLead).single(), 'dl')).sender_profile_id === profileD, "D's lead (moved before the failure) rolled back to D")
  const dRow = await must(client.from('profiles').select('archived_at, merged_into_profile_id').eq('id', profileD).single(), 'dRow')
  check(!dRow.archived_at && !dRow.merged_into_profile_id, 'D not archived')
  const { count: dLogs } = await client.from('profile_merge_log').select('id', { count: 'exact', head: true }).eq('source_profile_id', profileD)
  check(dLogs === 0, 'no merge log written for failed merge')

  let againErr: any = null
  try { await previewProfileMerge(client, { orgId: ctx.orgId, sourceId: profileB, targetId: ctx.profileA }) } catch (e) { againErr = e }
  check(againErr?.status === 400, 'archived B cannot be merged again')

  console.log(`\n${passes} passed, ${failures} failed`)
  process.exit(failures > 0 ? 1 : 0)
}

async function proposeRunStatus(client: SupabaseClient, runId: string) {
  return (await client.from('profile_enrichment_runs').select('status').eq('id', runId).single()).data?.status
}
void proposeRun

main().catch((err) => {
  console.error('\nFATAL:', err instanceof Error ? err.stack : err)
  process.exit(1)
})
