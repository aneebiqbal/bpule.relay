/**
 * RELAY V6.1.1 — Prospect → Profile → Lead → Outreach truth (BUG-32 … BUG-37).
 *
 * These contracts pin the invariants the bug report was about:
 *  - the explicitly selected sender is authoritative (never the active workspace)
 *  - a person's knowledge is shared across their channel rows
 *  - the source display name survives extraction verbatim
 *  - leads are profile-scoped and every row names its origin
 *  - a detected duplicate is navigable, never a dead end
 *  - the connection note is opt-in and costs nothing until it is sent
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { produceCanonicalIntelligence } from '@/lib/intelligence-v2/orchestrator'
import { resolveSenderContext } from '@/lib/profiles/sender-context'
import { scopeLeadsToIdentities } from '@/lib/leads/board-rows'
import { applyCanonicalColumnFilters, parseLeadsQuery } from '@/lib/leads/leads-page'
import { contactKey } from '@/lib/leads/normalize'

const read = (...parts: string[]) => readFileSync(parts.join('/'), 'utf8')

const PASTE = (name: string) => `${name}
· 2nd
CEO at Acme
Berlin, Germany
We are hiring a Rails developer to rebuild our platform. Looking for someone with API integration experience.
About
Experienced executive leading product and engineering teams.
Experience
Acme — CEO (2019 - Present)
`

// ── BUG-35 ───────────────────────────────────────────────────────────────────

describe('DISPLAY_NAME_PRESERVED', () => {
  it('keeps titles, prefixes and middle names exactly as the source wrote them', async () => {
    const cases = [
      ['Dr Ahmad Israr', 'Dr Ahmad Israr'],
      ['Dr. Ahmad Israr', 'Dr. Ahmad Israr'],
      ['Muhammad Aneeb Iqbal', 'Muhammad Aneeb Iqbal'],
      ['Prof. Sarah Khan', 'Prof. Sarah Khan'],
    ] as const

    for (const [source, expected] of cases) {
      const result = await produceCanonicalIntelligence(PASTE(source), { deterministicOnly: true } as never)
      const name = (result.intelligence as unknown as { intelligence: { person: { fullName: string | null } } })
        .intelligence.person.fullName
      expect(name, `source "${source}"`).toBe(expected)
    }
  })

  it('strips a parenthetical nickname but keeps every real name token', async () => {
    const result = await produceCanonicalIntelligence(PASTE('Ephraim (Effy) Gittler'), { deterministicOnly: true } as never)
    const name = (result.intelligence as unknown as { intelligence: { person: { fullName: string | null } } })
      .intelligence.person.fullName
    expect(name).toBe('Ephraim Gittler')
  })
})

describe('NORMALIZED_NAME_NOT_USED_FOR_DISPLAY', () => {
  it('normalizes for matching only — it never rewrites the stored display value', () => {
    // Matching must still tell a titled name from an untitled one …
    expect(contactKey('Dr Ahmad Israr')).not.toBe(contactKey('Ahmad Israr'))
    // … but normalization is a derived key, not a persisted value.
    const store = read('src', 'lib', 'store', 'supabase-store.ts')
    const createLead = store.slice(store.indexOf('async createLead'))
    const insert = createLead.slice(0, createLead.indexOf('const inserted'))
    expect(insert).toMatch(/contact_name: input\.contactName\?\.trim\(\) \|\| null/)
    expect(insert).not.toMatch(/contact_name:\s*contactKey/)
  })
})

// ── BUG-32 ───────────────────────────────────────────────────────────────────

describe('PROSPECT_SELECTED_IDENTITY_AUTHORITATIVE', () => {
  const entries = [
    { profileId: 'p-linkedin', platform: 'linkedin', identities: [{ id: 'id-linkedin', channel: 'linkedin' as const }] },
    { profileId: 'p-upwork', platform: 'upwork', identities: [{ id: 'id-upwork', channel: 'upwork' as const }] },
  ]

  it('uses the selected profile’s identity, not the active workspace', () => {
    const context = resolveSenderContext(entries, 'p-upwork', 'id-linkedin')
    expect(context?.identity.id).toBe('id-upwork')
    expect(context?.channel).toBe('upwork')
  })

  it('falls back to the workspace only when nothing was selected', () => {
    expect(resolveSenderContext(entries, null, 'id-linkedin')?.identity.id).toBe('id-linkedin')
    expect(resolveSenderContext(entries, null, null)).toBeNull()
  })

  it('never lets a workspace default override an explicit selection', () => {
    const context = resolveSenderContext(entries, 'p-linkedin', 'id-upwork')
    expect(context?.identity.id).toBe('id-linkedin')
  })
})

describe('NO_DEFAULT_PROFILE_OVERRIDE', () => {
  it('the analyzer resolves the sender from the selected profile', () => {
    const source = read('src', 'app', 'api', 'prospect', 'analyze', 'route.ts')
    expect(source).toMatch(/const explicitProfile = explicitProfileId && profileById\.has\(explicitProfileId\)/)
    expect(source).toMatch(/const explicitAssigned = explicitProfile \? assignedById\.get\(explicitProfile\.id\)/)
    expect(source).toMatch(/const effectiveIdentityId = selectedIdentity\?\.id \?\? requestedWorkspaceId/)
    expect(source).toMatch(/revenueIdentityId: effectiveIdentityId/)
  })

  it('the client no longer asks for a workspace identity that ignores the sender', () => {
    const source = read('src', 'components', 'prospect', 'prospect-analyze.tsx')
    expect(source).not.toMatch(/workspaceIdentityForSender/)
    expect(source).toMatch(/identityForProfile\(effectiveProfileId\)/)
  })

  it('the LinkedIn analyzer offers LinkedIn senders only', () => {
    const route = read('src', 'app', 'api', 'prospect', 'analyze', 'route.ts')
    expect(route).toMatch(/filterAssignedProfilesByChannel\(assigned, 'linkedin'\)/)
    const client = read('src', 'components', 'prospect', 'prospect-analyze.tsx')
    expect(client).toMatch(/fetch\('\/api\/profiles\?assigned=1&channel=linkedin'\)/)
  })
})

describe('LINKEDIN_ANALYZER_NEVER_USES_UPWORK_IDENTITY', () => {
  it('propagates the selected channel into routing and the recommended action', () => {
    const source = read('src', 'app', 'api', 'prospect', 'analyze', 'route.ts')
    expect(source).toMatch(/senderChannel/)
    expect(source).toMatch(/routeLead\([\s\S]*senderChannel,/)
    expect(source).toMatch(/channel: senderChannel \?\? 'linkedin'/)
    // No hardcoded LinkedIn platform filter remains.
    expect(source).not.toMatch(/senders,\s*\n\s*null,/)
  })
})

// ── BUG-33 ───────────────────────────────────────────────────────────────────

describe('PROFILE_MATCH_USES_CANONICAL_PERSON_KNOWLEDGE', () => {
  it('scores a person from every channel row that belongs to them', () => {
    const source = read('src', 'lib', 'relay', 'sender-suggestion.ts')
    expect(source).toMatch(/personIdOf/)
    expect(source).toMatch(/skillsByPerson/)
    expect(source).toMatch(/proofByPerson/)
    expect(source).not.toMatch(/const skills = \[\s*\.\.\.asArray\(p\.primary_skills\)/)
  })

  it('shares industries per person, not per profile row', () => {
    const source = read('src', 'lib', 'relay', 'routing-context.ts')
    expect(source).toMatch(/industriesByPerson/)
  })

  it('the unlinked Aneeb Upwork row was provably merged into his LinkedIn person', () => {
    const migration = read('supabase', 'migrations', '20261111150000_profile_person_links_v611.sql')
    expect(migration).toMatch(/child\.person_id is null/)
    expect(migration).toMatch(/canonical\.person_id is null/)
    expect(migration).toMatch(/canonical\.platform <> child\.platform/)
  })
})

// ── BUG-34 ───────────────────────────────────────────────────────────────────

describe('LEADS_PROFILE_FILTER_COUNT_PARITY', () => {
  it('applies one profile predicate to the rows the count is taken from', () => {
    const leads = [
      { id: 'a', company: 'A', contactName: 'Dr Ahmad Israr', revenueIdentityId: 'id-li', senderProfileId: null, source: 'linkedin', status: 'new', ownerRepId: 'r1' },
      { id: 'b', company: 'B', contactName: 'Sarah Khan', revenueIdentityId: 'id-up', senderProfileId: null, source: 'upwork', status: 'new', ownerRepId: 'r1' },
      { id: 'c', company: 'C', contactName: 'Aneeb Iqbal', revenueIdentityId: null, senderProfileId: 'p-li', source: 'linkedin', status: 'new', ownerRepId: 'r1' },
    ]
    const query = parseLeadsQuery({ profile: 'id-li' })
    const filtered = applyCanonicalColumnFilters(leads as never, query)
    expect(filtered.map((row) => row.id)).toEqual(['a'])
    // The count is the length of the same filtered set, never a separate query.
    expect(filtered).toHaveLength(1)
  })

  it('matches a lead stamped with either its revenue identity or its sender profile', () => {
    const leads = [
      { id: 'a', revenueIdentityId: 'id-li', senderProfileId: null },
      { id: 'b', revenueIdentityId: null, senderProfileId: 'p-li' },
      { id: 'c', revenueIdentityId: 'id-up', senderProfileId: null },
    ]
    const filtered = applyCanonicalColumnFilters(leads as never, parseLeadsQuery({}))
    expect(filtered).toHaveLength(3)
    const scoped = scopeLeadsToIdentities(leads, [{ id: 'id-li', profileId: 'p-li' }])
    expect(scoped.map((row) => row.id)).toEqual(['a', 'b'])
  })
})

describe('LEAD_COUNT_DESTINATION_PARITY', () => {
  it('the SQL page count and the rows share one scope predicate', () => {
    const store = read('src', 'lib', 'store', 'supabase-store.ts')
    const page = store.slice(store.indexOf('async listLeadsPage'))
    const body = page.slice(0, page.indexOf('async getQueue'))
    expect(body).toMatch(/input\.identities/)
    expect(body).toMatch(/revenue_identity_id\.eq\.\$\{row\.id\}/)
  })

  it('a rep page passes its executable scope so the total is not the org total', () => {
    const source = read('src', 'lib', 'leads', 'leads-page.ts')
    expect(source).toMatch(/identities: orgView \|\| teamView \? undefined : executableIdentities/)
  })
})

describe('LEAD_ROW_SHOWS_ORIGIN', () => {
  it('the row carries the generating profile’s channel', () => {
    const rows = read('src', 'components', 'leads', 'pipeline-utils.ts')
    expect(rows).toMatch(/senderProfileChannel\?: RevenueIdentityChannel/)
    const board = read('src', 'lib', 'leads', 'board-rows.ts')
    expect(board).toMatch(/senderProfileChannel: lead\.senderProfileId/)
    const table = read('src', 'components', 'leads', 'leads-table.tsx')
    expect(table).toMatch(/<ChannelBadge channel=\{lead\.senderProfileChannel\} \/>/)
  })
})

// ── BUG-36 ───────────────────────────────────────────────────────────────────

describe('DUPLICATE_RETURNS_EXISTING_LEAD', () => {
  it('the duplicate response carries the lead id and its archived state', () => {
    for (const route of ['src/app/api/prospect/save/route.ts', 'src/app/api/leads/route.ts']) {
      const source = read(...route.split('/'))
      expect(source).toMatch(/existingLeadId/)
      expect(source).toMatch(/existingLeadArchived/)
    }
  })

  it('the client makes the existing lead the primary action', () => {
    const source = read('src', 'components', 'prospect', 'prospect-analyze.tsx')
    expect(source).toMatch(/Open existing lead/)
    expect(source).not.toMatch(/View existing/)
  })

  it('archived leads are detected, not skipped', () => {
    const source = read('src', 'lib', 'store', 'supabase-store.ts')
    const createLead = source.slice(source.indexOf('async createLead'))
    const dedupe = createLead.slice(0, createLead.indexOf('const canonicalIntelligence'))
    expect(dedupe).toMatch(/fetchLeadsAll\(false, true\)/)
    expect(dedupe).not.toMatch(/!l\.archived/)
    expect(dedupe).toMatch(/existingLeadArchived: Boolean\(hit\.archived\)/)
  })
})

describe('DOUBLE_CREATE_ONE_LEAD', () => {
  it('dedupe runs before any insert', () => {
    const source = read('src', 'lib', 'store', 'supabase-store.ts')
    const createLead = source.slice(source.indexOf('async createLead'))
    const dedupeEnd = createLead.indexOf('const canonicalIntelligence')
    const insertAt = createLead.indexOf('_insertLeadRow')
    expect(dedupeEnd).toBeGreaterThan(-1)
    expect(insertAt).toBeGreaterThan(dedupeEnd)
  })
})

// ── BUG-37 ───────────────────────────────────────────────────────────────────

describe('CONNECTION_NOTE_OPT_IN', () => {
  it('creating a lead lands on the lead page without an auto-generate intent', () => {
    const source = read('src', 'components', 'prospect', 'prospect-analyze.tsx')
    expect(source).not.toMatch(/router\.push\(`\/leads\/\$\{createdLead\.id\}\?next=/)
    expect(source).toMatch(/router\.push\(`\/leads\/\$\{createdLead\.id\}`\)/)
  })

  it('the analyzer generates a note only when the caller asked for one', () => {
    const source = read('src', 'app', 'api', 'prospect', 'analyze', 'route.ts')
    expect(source).toMatch(/if \(generateNote && isPitchingPolicy\(loop\.messagingPolicy\)\)/)
  })
})

describe('NO_NOTE_NO_AI_CALL', () => {
  it('send-without-note posts no text and never touches the draft generator', () => {
    const source = read('src', 'components', 'lead-workspace-simple.tsx')
    expect(source).toMatch(/sendWithoutNote: true/)
    expect(source).toMatch(/sentText: ''/)
    const withoutNote = source.slice(source.indexOf('const sendWithoutNote'))
    const body = withoutNote.slice(0, withoutNote.indexOf('const logSend'))
    expect(body).not.toMatch(/generateDraft|streamDraft/)
  })
})

describe('GENERATED_NOTE_NO_CONNECTION_CREDIT', () => {
  it('the connection is credited by the send path, once, keyed by lead and type', () => {
    const source = read('src', 'lib', 'store', 'supabase-store.ts')
    const markContacted = source.slice(source.indexOf('async markContacted'))
    const credit = markContacted.slice(0, markContacted.indexOf('record_canonical_progress'))
    expect(credit).toMatch(/if \(type !== 'reply'\)/)
    expect(credit).toMatch(/record_activity_event/)
    expect(credit).toMatch(/p_source_event_id: `activity:\$\{leadId\}:\$\{idempotencyKey \?\? 'none'\}:\$\{identityId\}`/)
  })
})

// ── Scope / authorization ─────────────────────────────────────────────────────

describe('REP_IDENTITY_SCOPE_CANONICAL', () => {
  it('the leads book is every executable identity, not the active workspace', () => {
    const source = read('src', 'lib', 'leads', 'leads-page.ts')
    expect(source).toMatch(/getAuthorizedIdentities\(\)/)
    expect(source).toMatch(/scopeLeadsToIdentities\(/)
    expect(source).not.toMatch(/scopeLeadsToWorkspace\(/)
  })

  it('backup-only eligibility is not execution', () => {
    const source = read('src', 'lib', 'profiles', 'assigned-profiles.ts')
    expect(source).toMatch(/listExecutableIdentitiesForRep/)
  })
})

describe('DASHBOARD_BOARD_MATCHES_LEADS_SCOPE', () => {
  it('a rep board scopes to every executable identity, not the active workspace', () => {
    const source = read('src', 'lib', 'leads', 'board-rows.ts')
    expect(source).toMatch(/scopeLeadsToIdentities\(allLeads, executableIdentities\)/)
    expect(source).toMatch(/getAuthorizedIdentities\(\)/)
    expect(source).not.toMatch(/const visibleLeads = scopeLeadsToWorkspace\(allLeads, workspace, orgView\)/)
  })
})

describe('EXPLICIT_INVALID_IDENTITY_NEVER_FALLS_BACK', () => {
  it('every prospect/lead write route denies an identity that does not resolve', () => {
    for (const route of [
      'src/app/api/prospect/analyze/route.ts',
      'src/app/api/prospect/save/route.ts',
      'src/app/api/leads/route.ts',
    ]) {
      const source = read(...route.split('/'))
      expect(source, route).toMatch(/IDENTITY_NOT_ACCESSIBLE/)
      expect(source, route).toMatch(/status: 403/)
    }
  })

  it('fallback is still allowed when the caller named no identity', () => {
    const source = read('src', 'app', 'api', 'prospect', 'analyze', 'route.ts')
    expect(source).toMatch(/if \(typeof body\.revenueIdentityId === 'string' && body\.revenueIdentityId\.trim\(\)\)/)
  })
})

describe('PROFILE_KNOWLEDGE_READINESS', () => {
  it('the analyzer reports knowledge readiness per candidate', () => {
    expect(read('src/lib/relay/sender-suggestion.ts')).toMatch(/knowledgeReady/)
    expect(read('src/lib/relay/sender-routing-engine.ts')).toMatch(/knowledgeReady/)
    const ui = read('src/components/prospect/prospect-result.tsx')
    expect(ui).toMatch(/Profile data incomplete/)
    expect(ui).toMatch(/Match confidence is limited/)
  })

  it('the profile Knowledge tab shows a readiness summary from canonical facts', () => {
    const source = read('src/components/team/team-profile-detail.tsx')
    expect(source).toMatch(/Match readiness/)
    expect(source).toMatch(/CV \/ source/)
    expect(source).toMatch(/Claims/)
  })

  it('incomplete knowledge is never presented as a bare percentage', () => {
    const source = read('src/components/prospect/prospect-result.tsx')
    expect(source).toMatch(/knowledgeReady === false/)
    expect(source).toMatch(/Review profile/)
  })
})

describe('CROSS_ORG_IDENTITY_DENIED', () => {
  it('a client-supplied identity must resolve inside the caller’s own scope', () => {
    const source = read('src', 'lib', 'workspace', 'resolve-active-identity.ts')
    expect(source).toMatch(/listMyWorkableIdentities\(\)/)
    expect(source).toMatch(/identities\.find\(\(item\) => item\.id === identityId && item\.status === 'active'\)/)
  })
})

// ── V6.1.2 §31 contract gate ─────────────────────────────────────────────────

describe('SELECTED_PROFILE_SURVIVES_ANALYZE_TO_SAVE', () => {
  it('the client sends the selected profile to both analyze and save', () => {
    const source = read('src', 'components', 'prospect', 'prospect-analyze.tsx')
    expect(source).toMatch(/profileId: effectiveProfileId/)
    expect(source).toMatch(/senderProfileId: selectedProfileId \?\? result\.bestSender\?\.id/)
    expect(source).not.toMatch(/profileId: workspace\.active\?\.profileId/)
  })
})

describe('SELECTED_CHANNEL_SURVIVES_ANALYZE_TO_SAVE', () => {
  it('the revenue identity is resolved from the selected profile, not the workspace', () => {
    const source = read('src', 'components', 'prospect', 'prospect-analyze.tsx')
    expect(source).toMatch(/const revenueIdentityId = identityForProfile\(effectiveProfileId\)/)
    expect(source).toMatch(/revenueIdentityId: identityForProfile\(/)
  })
})

describe('ACTIVE_WORKSPACE_CANNOT_OVERRIDE_SELECTION', () => {
  it('the workspace is only a fallback in the resolver', () => {
    const source = read('src', 'lib', 'profiles', 'sender-context.ts')
    expect(source).toMatch(/if \(selectedProfileId\)[\s\S]*?if \(fallbackIdentityId\)/)
    expect(source).not.toMatch(/fallbackIdentityId\s*\?\?/)
  })

  it('no surface still asks for a workspace identity that ignores the sender', () => {
    const removed = read('src', 'lib', 'workspace', 'active-identity.ts')
    expect(removed).not.toMatch(/export function workspaceIdentityForSender/)
  })
})

describe('PROFILE_KNOWLEDGE_SHARED_BY_PERSON', () => {
  it('skills, proof and industries aggregate per person', () => {
    const suggestion = read('src', 'lib', 'relay', 'sender-suggestion.ts')
    expect(suggestion).toMatch(/skillsByPerson/)
    expect(suggestion).toMatch(/proofByPerson/)
    const routing = read('src', 'lib', 'relay', 'routing-context.ts')
    expect(routing).toMatch(/industriesByPerson/)
  })
})

describe('PROFILE_EXECUTION_CHANNEL_SPECIFIC', () => {
  it('platform and accessibility stay per row even though knowledge is shared', () => {
    const source = read('src', 'lib', 'relay', 'sender-suggestion.ts')
    expect(source).toMatch(/platform: p\.platform \?\? null/)
    expect(source).toMatch(/accessibleToRep: p\.rep_id === repId \|\| holders\.has\(repId\)/)
  })
})

describe('LEADS_PROFILE_SEARCH_PARITY', () => {
  it('search and profile filter apply together', () => {
    const leads = [
      { id: 'a', company: 'Finlytic', contactName: 'Dr Ahmad Israr', contactTitle: 'Head of Engineering', revenueIdentityId: 'id-aneeb-li', senderProfileId: null, source: 'linkedin', status: 'new', ownerRepId: 'r1' },
      { id: 'b', company: 'Northstar', contactName: 'Ahmad Israr', contactTitle: 'Engineer', revenueIdentityId: 'id-mehak-li', senderProfileId: null, source: 'linkedin', status: 'new', ownerRepId: 'r1' },
      { id: 'c', company: 'Finlytic', contactName: 'Sarah Khan', contactTitle: 'CTO', revenueIdentityId: 'id-aneeb-li', senderProfileId: null, source: 'linkedin', status: 'new', ownerRepId: 'r1' },
    ] as never[]

    const both = applyCanonicalColumnFilters(
      leads,
      parseLeadsQuery({ profile: 'id-aneeb-li', q: 'Ahmad' }),
    )
    expect(both.map((row) => row.id)).toEqual(['a'])

    const profileOnly = applyCanonicalColumnFilters(leads, parseLeadsQuery({ profile: 'id-aneeb-li' }))
    expect(profileOnly.map((row) => row.id)).toEqual(['a', 'c'])

    const searchOnly = applyCanonicalColumnFilters(leads, parseLeadsQuery({ q: 'Ahmad' }))
    expect(searchOnly.map((row) => row.id)).toEqual(['a', 'b'])
  })
})

describe('LEADS_PROFILE_COUNT_PARITY', () => {
  it('the SQL scope and the row scope are the same predicate', () => {
    const store = read('src', 'lib', 'store', 'supabase-store.ts')
    const page = store.slice(store.indexOf('async listLeadsPage'))
    const body = page.slice(0, page.indexOf('async getQueue'))
    expect(body).toMatch(/input\.identities/)
    expect(body).toMatch(/revenue_identity_id\.eq\.\$\{row\.id\}/)
    expect(body).toMatch(/sender_profile_id\.eq\.\$\{row\.profileId\}/)
  })
})

describe('DUPLICATE_EXISTING_LEAD_NAVIGABLE', () => {
  it('the duplicate response carries the lead id and its origin profile', () => {
    const source = read('src', 'app', 'api', 'prospect', 'save', 'route.ts')
    expect(source).toMatch(/existingLeadId/)
    expect(source).toMatch(/existingLeadSenderProfileId/)
    const client = read('src', 'components', 'prospect', 'prospect-analyze.tsx')
    expect(client).toMatch(/Open existing lead/)
  })
})

describe('ARCHIVED_DUPLICATE_NAVIGABLE', () => {
  it('archived leads are detected and labelled, never silently re-created', () => {
    const store = read('src', 'lib', 'store', 'supabase-store.ts')
    const createLead = store.slice(store.indexOf('async createLead'))
    const dedupe = createLead.slice(0, createLead.indexOf('const canonicalIntelligence'))
    expect(dedupe).toMatch(/fetchLeadsAll\(false, true\)/)
    expect(dedupe).toMatch(/existingLeadArchived: Boolean\(hit\.archived\)/)
    const client = read('src', 'components', 'prospect', 'prospect-analyze.tsx')
    expect(client).toMatch(/Already in Relay\{duplicateConflict\.existingLeadArchived \? ' · Archived' : ''\}/)
  })
})

describe('DISPLAY_NAME_EXACT', () => {
  it('titles, prefixes and middle names survive extraction', async () => {
    const cases = [
      ['Dr Ahmad Israr', 'Dr Ahmad Israr'],
      ['Dr. Ahmad Israr', 'Dr. Ahmad Israr'],
      ['Muhammad Aneeb Iqbal', 'Muhammad Aneeb Iqbal'],
      ['Prof. Sarah Khan', 'Prof. Sarah Khan'],
    ] as const
    for (const [source, expected] of cases) {
      const result = await produceCanonicalIntelligence(PASTE(source), { deterministicOnly: true } as never)
      const name = (result.intelligence as unknown as { intelligence: { person: { fullName: string | null } } })
        .intelligence.person.fullName
      expect(name, source).toBe(expected)
    }
  })
})

describe('NO_NOTE_ZERO_AI', () => {
  it('send-without-note never calls the generator', () => {
    const source = read('src', 'components', 'lead-workspace-simple.tsx')
    const block = source.slice(source.indexOf('const sendWithoutNote'))
    const body = block.slice(0, block.indexOf('const logSend'))
    expect(body).not.toMatch(/generateDraft|streamDraft/)
    expect(body).toMatch(/sendWithoutNote: true/)
  })
})

describe('WITH_NOTE_ON_DEMAND', () => {
  it('the note is generated only from an explicit click', () => {
    const source = read('src', 'components', 'lead-workspace-simple.tsx')
    expect(source).toMatch(/onClick=\{\(\) => generateDraft\('connection'\)\}/)
    const analyze = read('src', 'app', 'api', 'prospect', 'analyze', 'route.ts')
    expect(analyze).toMatch(/if \(generateNote && isPitchingPolicy\(loop\.messagingPolicy\)\)/)
  })
})

describe('NOTE_GENERATION_ZERO_TARGET_CREDIT', () => {
  it('only the send path credits the connection target', () => {
    const store = read('src', 'lib', 'store', 'supabase-store.ts')
    const markContacted = store.slice(store.indexOf('async markContacted'))
    const credit = markContacted.slice(0, markContacted.indexOf('record_canonical_progress'))
    expect(credit).toMatch(/record_activity_event/)
    expect(credit).toMatch(/if \(type !== 'reply'\)/)
    const draftRoute = read('src', 'app', 'api', 'leads', '[id]', 'draft', 'route.ts')
    expect(draftRoute).not.toMatch(/record_activity_event/)
  })
})

describe('CONNECTION_ONE_CREDIT', () => {
  it('the connection is credited once per identity with a stable idempotency key', () => {
    const store = read('src', 'lib', 'store', 'supabase-store.ts')
    const markContacted = store.slice(store.indexOf('async markContacted'))
    const credit = markContacted.slice(0, markContacted.indexOf('record_canonical_progress'))
    expect(credit).toMatch(/record_activity_event/)
    expect(credit).toMatch(/p_source_event_id: `activity:\$\{leadId\}:\$\{idempotencyKey \?\? 'none'\}:\$\{identityId\}`/)
    // One credit per identity actually worked, not once per target row.
    expect(credit).toMatch(/p_identity_id: identityId/)
  })
})

describe('FORGED_IDENTITY_DENIED', () => {
  it('an identity outside the caller scope resolves to null', () => {
    const source = read('src', 'lib', 'workspace', 'resolve-active-identity.ts')
    expect(source).toMatch(/identities\.find\(\(item\) => item\.id === identityId && item\.status === 'active'\)/)
    expect(source).toMatch(/if \(!identity\) return null/)
  })
})

describe('BACKUP_IDENTITY_NOT_SELECTABLE', () => {
  it('the executable scope excludes backup-only eligibility', () => {
    const source = read('src', 'lib', 'coverage', 'access.ts')
    expect(source).toMatch(/if \(!isCovered && !isPrimary && !isOperator\) continue/)
    expect(source).toMatch(/'PRIMARY',\s*'OPERATOR'/)
  })
})
