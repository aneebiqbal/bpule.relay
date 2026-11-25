/**
 * Canonical activity catalog — the one resolver contract.
 *
 * Pins: stable keys, legacy aliases, per-channel scope, custom channels,
 * unknown-key denial (never "other"), disabled handling and effective dating.
 */
import { describe, expect, it } from 'vitest'
import {
  CanonicalActivityResolver,
  type ActivityCatalog,
  type ExecutionActivityDefinition,
} from '@/lib/execution/activity-catalog'

function definition(overrides: Partial<ExecutionActivityDefinition> & Pick<ExecutionActivityDefinition, 'id' | 'channelId' | 'key'>): ExecutionActivityDefinition {
  return {
    organizationId: null,
    label: overrides.key,
    description: null,
    countingMode: 'unique_verified_event',
    evidencePolicy: 'internal_record',
    targetable: true,
    enabled: true,
    effortMinutes: 1,
    recordingModes: ['manual'],
    duplicatePolicy: 'idempotent_source_event',
    outcomeClass: null,
    version: 1,
    effectiveFrom: '2026-01-01',
    effectiveUntil: null,
    ...overrides,
  }
}

const catalog: ActivityCatalog = {
  channels: [
    { id: 'ch-linkedin', organizationId: null, slug: 'linkedin', name: 'LinkedIn', description: null, template: 'linkedin', operationMode: 'manual_evidence', enabled: true, identityRequirements: {}, revision: 1 },
    { id: 'ch-upwork', organizationId: null, slug: 'upwork', name: 'Upwork', description: null, template: 'upwork', operationMode: 'manual_evidence', enabled: true, identityRequirements: {}, revision: 1 },
    { id: 'ch-custom', organizationId: 'org-a', slug: 'partner-outreach', name: 'Partner Outreach', description: null, template: 'custom', operationMode: 'manual_evidence', enabled: true, identityRequirements: {}, revision: 1 },
    { id: 'ch-disabled', organizationId: 'org-a', slug: 'legacy-partners', name: 'Legacy Partners', description: null, template: 'custom', operationMode: 'manual_evidence', enabled: false, identityRequirements: {}, revision: 1 },
  ],
  definitions: [
    definition({ id: 'ad-connection', channelId: 'ch-linkedin', key: 'connection_request', label: 'Connection invitations', effortMinutes: 1 }),
    definition({ id: 'ad-dm', channelId: 'ch-linkedin', key: 'dm', label: 'Direct messages', effortMinutes: 2 }),
    definition({ id: 'ad-followup-linkedin', channelId: 'ch-linkedin', key: 'followup', label: 'Follow-ups' }),
    definition({ id: 'ad-application', channelId: 'ch-upwork', key: 'application', label: 'Applications submitted', effortMinutes: 20 }),
    definition({ id: 'ad-proposal', channelId: 'ch-upwork', key: 'proposal', label: 'Proposals prepared', targetable: false, effortMinutes: 30 }),
    // Same legacy word, different channel: distinct meaning, both valid.
    definition({ id: 'ad-followup-email', channelId: 'ch-custom', key: 'followup', label: 'Email follow-ups' }),
    definition({ id: 'ad-intro', channelId: 'ch-custom', key: 'intro_sent', label: 'Introductions sent', effortMinutes: 4 }),
    definition({ id: 'ad-off', channelId: 'ch-disabled', key: 'old_step', label: 'Old step', enabled: false }),
    definition({ id: 'ad-future', channelId: 'ch-custom', key: 'future_step', label: 'Future step', effectiveFrom: '2027-01-01' }),
  ],
  aliases: [
    { channelId: 'ch-linkedin', activityDefinitionId: 'ad-connection', aliasKey: 'connection_sent' },
    { channelId: 'ch-linkedin', activityDefinitionId: 'ad-dm', aliasKey: 'dm_sent' },
    { channelId: 'ch-linkedin', activityDefinitionId: 'ad-followup-linkedin', aliasKey: 'followup_sent' },
    { channelId: 'ch-upwork', activityDefinitionId: 'ad-application', aliasKey: 'application_submitted' },
    { channelId: 'ch-upwork', activityDefinitionId: 'ad-proposal', aliasKey: 'proposal_generated' },
    { channelId: 'ch-custom', activityDefinitionId: 'ad-followup-email', aliasKey: 'email_followup_sent' },
  ],
}

const resolver = new CanonicalActivityResolver(catalog)

describe('CanonicalActivityResolver', () => {
  it('resolves built-in canonical keys with labels and effort', () => {
    const resolution = resolver.resolveActivityDefinition('connection_request', 'ch-linkedin')
    expect(resolution.status).toBe('resolved')
    expect(resolution.label).toBe('Connection invitations')
    expect(resolver.resolveActivityEffort('application', 'ch-upwork')).toBe(20)
  })

  it('maps legacy aliases without creating a second vocabulary', () => {
    expect(resolver.resolveLegacyActivityKey('connection_sent', 'ch-linkedin')).toMatchObject({ status: 'resolved', key: 'connection_request' })
    expect(resolver.resolveLegacyActivityKey('application_submitted', 'ch-upwork')).toMatchObject({ status: 'resolved', key: 'application' })
    expect(resolver.resolve('proposal_generated', 'ch-upwork')).toMatchObject({ status: 'resolved', key: 'proposal' })
  })

  it('keeps the same alias word scoped to its channel', () => {
    expect(resolver.resolveLegacyActivityKey('followup_sent', 'ch-linkedin').definition?.id).toBe('ad-followup-linkedin')
    expect(resolver.resolveLegacyActivityKey('email_followup_sent', 'ch-custom').definition?.id).toBe('ad-followup-email')
  })

  it('supports org-scoped custom channels end to end', () => {
    const resolution = resolver.resolveActivityDefinition('intro_sent', 'ch-custom')
    expect(resolution.status).toBe('resolved')
    expect(resolution.channel?.slug).toBe('partner-outreach')
    expect(resolver.listChannelActivities('ch-custom').map((row) => row.key).sort()).toEqual(['followup', 'intro_sent'])
  })

  it('denies unknown keys instead of folding them into "other"', () => {
    expect(resolver.resolveActivityDefinition('totally_made_up').status).toBe('unknown')
    expect(resolver.validateActivityEvent({ key: 'totally_made_up', channelId: 'ch-custom' }).ok).toBe(false)
  })

  it('denies unmapped legacy keys rather than guessing', () => {
    expect(resolver.resolveLegacyActivityKey('email_sent', 'ch-linkedin').status).toBe('unmapped_legacy')
    expect(resolver.resolve('email_sent', 'ch-linkedin').status).toBe('unmapped_legacy')
  })

  it('treats a disabled definition or channel as disabled', () => {
    expect(resolver.resolveActivityDefinition('old_step', 'ch-disabled').status).toBe('disabled')
    expect(resolver.validateActivityEvent({ key: 'old_step', channelId: 'ch-disabled' }).ok).toBe(false)
  })

  it('honours effective dating so a changed definition is not retroactive', () => {
    expect(resolver.resolveActivityDefinition('future_step', 'ch-custom', { date: '2026-12-01' }).status).toBe('unknown')
    expect(resolver.resolveActivityDefinition('future_step', 'ch-custom', { date: '2027-02-01' }).status).toBe('resolved')
  })

  it('requires provider evidence for provider-event policies', () => {
    const emailDefinition = definition({ id: 'ad-email', channelId: 'ch-custom', key: 'email', evidencePolicy: 'provider_event_id' })
    const policyCatalog: ActivityCatalog = { channels: catalog.channels, definitions: catalog.definitions.concat(emailDefinition), aliases: catalog.aliases }
    const r = new CanonicalActivityResolver(policyCatalog)
    expect(r.validateActivityEvent({ key: 'email', channelId: 'ch-custom' }).ok).toBe(false)
    expect(r.validateActivityEvent({ key: 'email', channelId: 'ch-custom', sourceEventId: 'prov_1' }).ok).toBe(true)
  })

  it('resolves an identity channel by explicit reference or legacy enum', () => {
    expect(resolver.channelForIdentity({ channelId: 'ch-custom', channel: 'other' })?.id).toBe('ch-custom')
    expect(resolver.channelForIdentity({ channel: 'linkedin' })?.id).toBe('ch-linkedin')
    expect(resolver.channelForIdentity({ channel: 'other' })).toBeNull()
  })
})
