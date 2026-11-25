/**
 * The ONE canonical execution catalog.
 *
 * Two stable identities live here:
 *   - an immutable activity KEY that materializes into
 *     `daily_target_plans.activity_type`, so the existing planning,
 *     allocation, accountability and reporting systems work unchanged;
 *   - an alias table for legacy/registry keys that used to be hardcoded.
 *
 * The resolver is server-side and shared by every surface. Unknown keys are
 * reported as unknown — they are never folded into "other" and never credited.
 */

import type { DbClient } from '@/lib/db/types'

export const COUNTING_MODES = [
  'unique_verified_event',
  'distinct_prospect',
  'distinct_conversation',
  'completed_task',
  'approved_manual_external',
] as const
export type CountingMode = (typeof COUNTING_MODES)[number]

export const EVIDENCE_POLICIES = [
  'provider_event_id',
  'source_event_id',
  'internal_record',
  'human_confirmation',
  'approved_reference',
  'reviewer_approval',
] as const
export type EvidencePolicy = (typeof EVIDENCE_POLICIES)[number]

export const OPERATION_MODES = [
  'manual_evidence',
  'relay_native',
  'connected_provider',
  'import_webhook',
] as const
export type OperationMode = (typeof OPERATION_MODES)[number]

export const CHANNEL_TEMPLATES = ['linkedin', 'upwork', 'email', 'direct_replies', 'custom'] as const
export type ChannelTemplate = (typeof CHANNEL_TEMPLATES)[number]

export interface ExecutionChannel {
  id: string
  organizationId: string | null
  slug: string
  name: string
  description: string | null
  template: ChannelTemplate
  operationMode: OperationMode
  enabled: boolean
  identityRequirements: Record<string, unknown>
  revision: number
}

export interface ExecutionActivityDefinition {
  id: string
  channelId: string
  organizationId: string | null
  key: string
  label: string
  description: string | null
  countingMode: CountingMode
  evidencePolicy: EvidencePolicy
  targetable: boolean
  enabled: boolean
  effortMinutes: number
  recordingModes: string[]
  duplicatePolicy: string
  outcomeClass: string | null
  version: number
  effectiveFrom: string
  effectiveUntil: string | null
}

export interface ExecutionActivityAlias {
  channelId: string
  activityDefinitionId: string
  aliasKey: string
}

export interface ActivityCatalog {
  channels: ExecutionChannel[]
  definitions: ExecutionActivityDefinition[]
  aliases: ExecutionActivityAlias[]
}

export type ResolutionStatus = 'resolved' | 'unknown' | 'disabled' | 'unmapped_legacy'

export interface ActivityResolution {
  status: ResolutionStatus
  /** Canonical key, present even for unmapped legacy aliases. */
  key: string
  label: string
  definition: ExecutionActivityDefinition | null
  channel: ExecutionChannel | null
}

/** Legacy enum value → built-in system channel slug (null when unmapped). */
export function legacyChannelSlug(value: string | null | undefined): string | null {
  return LEGACY_CHANNEL_BY_ENUM[String(value ?? '').toLowerCase()] ?? null
}

/** Current label per canonical key, preferring the open-ended version. */
export function catalogKeyLabels(catalog: ActivityCatalog): Record<string, { label: string; effortMinutes: number; targetable: boolean }> {
  const byKey = new Map<string, ExecutionActivityDefinition[]>()
  for (const definition of catalog.definitions) {
    const list = byKey.get(definition.key) ?? []
    list.push(definition)
    byKey.set(definition.key, list)
  }
  const out: Record<string, { label: string; effortMinutes: number; targetable: boolean }> = {}
  for (const [key, versions] of byKey) {
    const current = versions
      .slice()
      .sort((a, b) => Number(b.effectiveUntil === null ? 1 : 0) - Number(a.effectiveUntil === null ? 1 : 0) || b.version - a.version)[0]
    out[key] = { label: current.label, effortMinutes: current.effortMinutes, targetable: current.targetable }
  }
  return out
}

/** Legacy enum value → built-in system channel slug. */
const LEGACY_CHANNEL_BY_ENUM: Record<string, string> = {
  linkedin: 'linkedin',
  upwork: 'upwork',
  email: 'email',
  other: 'general',
}

function rowToChannel(row: Record<string, unknown>): ExecutionChannel {
  return {
    id: String(row.id),
    organizationId: (row.organization_id as string | null) ?? null,
    slug: String(row.slug),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    template: row.template as ChannelTemplate,
    operationMode: row.operation_mode as OperationMode,
    enabled: Boolean(row.enabled),
    identityRequirements: (row.identity_requirements as Record<string, unknown>) ?? {},
    revision: Number(row.revision ?? 1),
  }
}

function rowToDefinition(row: Record<string, unknown>): ExecutionActivityDefinition {
  return {
    id: String(row.id),
    channelId: String(row.channel_id),
    organizationId: (row.organization_id as string | null) ?? null,
    key: String(row.key),
    label: String(row.label),
    description: (row.description as string | null) ?? null,
    countingMode: row.counting_mode as CountingMode,
    evidencePolicy: row.evidence_policy as EvidencePolicy,
    targetable: Boolean(row.targetable),
    enabled: Boolean(row.enabled),
    effortMinutes: Math.max(0, Number(row.effort_minutes ?? 0)),
    recordingModes: Array.isArray(row.recording_modes) ? row.recording_modes.map(String) : [],
    duplicatePolicy: String(row.duplicate_policy ?? 'idempotent_source_event'),
    outcomeClass: (row.outcome_class as string | null) ?? null,
    version: Number(row.version ?? 1),
    effectiveFrom: String(row.effective_from),
    effectiveUntil: (row.effective_until as string | null) ?? null,
  }
}

/** Load the whole catalog in three small queries; it is tiny and org-filtered. */
export async function loadActivityCatalog(db: DbClient): Promise<ActivityCatalog> {
  const [channelsRes, definitionsRes, aliasesRes] = await Promise.all([
    db.from('execution_channels').select('*').limit(200),
    db.from('execution_activity_definitions').select('*').limit(500),
    db.from('execution_activity_aliases').select('*').limit(500),
  ])
  return {
    channels: ((channelsRes.data ?? []) as Array<Record<string, unknown>>).map(rowToChannel),
    definitions: ((definitionsRes.data ?? []) as Array<Record<string, unknown>>).map(rowToDefinition),
    aliases: ((aliasesRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      channelId: String(row.channel_id),
      activityDefinitionId: String(row.activity_definition_id),
      aliasKey: String(row.alias_key),
    })),
  }
}

export interface CatalogLookupOptions {
  /** Only definitions effective on this business date. */
  date?: string
}

/**
 * Pure resolver over a loaded catalog. Kept free of I/O so every rule is
 * unit-testable and the same instance can serve a whole request.
 */
export class CanonicalActivityResolver {
  constructor(private readonly catalog: ActivityCatalog) {}

  getCatalog(): ActivityCatalog {
    return this.catalog
  }

  channelById(channelId: string | null | undefined): ExecutionChannel | null {
    if (!channelId) return null
    return this.catalog.channels.find((channel) => channel.id === channelId) ?? null
  }

  /**
   * Resolve the channel an identity actually belongs to. An explicit custom
   * channel_id wins; otherwise the legacy enum maps to a built-in template.
   */
  channelForIdentity(identity: { channel?: string | null; channelId?: string | null }): ExecutionChannel | null {
    if (identity.channelId) {
      const explicit = this.channelById(identity.channelId)
      if (explicit) return explicit
    }
    const slug = LEGACY_CHANNEL_BY_ENUM[String(identity.channel ?? '').toLowerCase()]
    if (!slug) return null
    return this.catalog.channels.find((channel) => channel.slug === slug && channel.organizationId === null) ?? null
  }

  listChannelActivities(channelId: string, options: CatalogLookupOptions = {}): ExecutionActivityDefinition[] {
    return this.catalog.definitions.filter(
      (definition) => definition.channelId === channelId && this.isEffective(definition, options.date),
    )
  }

  isEnabled(definition: ExecutionActivityDefinition, channel: ExecutionChannel | null): boolean {
    return definition.enabled && (channel?.enabled ?? true)
  }

  /** Effective window only; enabled state is reported separately as "disabled". */
  private inEffectiveWindow(definition: ExecutionActivityDefinition, date?: string): boolean {
    const day = date ?? new Date().toISOString().slice(0, 10)
    if (definition.effectiveFrom && definition.effectiveFrom > day) return false
    if (definition.effectiveUntil && definition.effectiveUntil < day) return false
    return true
  }

  private isEffective(definition: ExecutionActivityDefinition, date?: string): boolean {
    return definition.enabled && this.inEffectiveWindow(definition, date)
  }

  /** Exact canonical key. Never treats a legacy alias as canonical. */
  resolveActivityDefinition(key: string, channelId?: string | null, options: CatalogLookupOptions = {}): ActivityResolution {
    const matches = this.catalog.definitions.filter(
      (definition) =>
        definition.key === key &&
        (!channelId || definition.channelId === channelId) &&
        this.inEffectiveWindow(definition, options.date),
    )
    const definition = matches[0] ?? null
    if (!definition) {
      return { status: 'unknown', key, label: key, definition: null, channel: null }
    }
    const channel = this.channelById(definition.channelId)
    if (!this.isEnabled(definition, channel)) {
      return { status: 'disabled', key, label: definition.label, definition, channel }
    }
    return { status: 'resolved', key, label: definition.label, definition, channel }
  }

  /** Legacy/registry alias → canonical definition, scoped to one channel. */
  resolveLegacyActivityKey(aliasKey: string, channelId?: string | null, options: CatalogLookupOptions = {}): ActivityResolution {
    const alias = this.catalog.aliases.find(
      (row) => row.aliasKey === aliasKey && (!channelId || row.channelId === channelId),
    )
    if (!alias) {
      return { status: 'unmapped_legacy', key: aliasKey, label: aliasKey, definition: null, channel: null }
    }
    const definition = this.catalog.definitions.find((row) => row.id === alias.activityDefinitionId) ?? null
    if (!definition) {
      return { status: 'unknown', key: aliasKey, label: aliasKey, definition: null, channel: null }
    }
    const resolved = this.resolveActivityDefinition(definition.key, definition.channelId, options)
    return { ...resolved, key: definition.key }
  }

  /**
   * Accept either a canonical key or a legacy alias. Callers that already know
   * the key should prefer resolveActivityDefinition so typos fail as unknown.
   */
  resolve(key: string, channelId?: string | null, options: CatalogLookupOptions = {}): ActivityResolution {
    const direct = this.resolveActivityDefinition(key, channelId, options)
    if (direct.status !== 'unknown') return direct
    return this.resolveLegacyActivityKey(key, channelId, options)
  }

  resolveActivityCountingPolicy(key: string, channelId?: string | null) {
    const resolution = this.resolveActivityDefinition(key, channelId)
    const definition = resolution.definition
    if (!definition) return null
    return {
      countingMode: definition.countingMode,
      evidencePolicy: definition.evidencePolicy,
      duplicatePolicy: definition.duplicatePolicy,
      outcomeClass: definition.outcomeClass,
    }
  }

  /** Estimated effort in minutes. Defaults to 0 — never a guess that inflates. */
  resolveActivityEffort(key: string, channelId?: string | null): number {
    return this.resolveActivityDefinition(key, channelId).definition?.effortMinutes ?? 0
  }

  getActivityDisplayMetadata(keys: readonly string[], channelId?: string | null): Record<string, { label: string; channelSlug: string | null; effortMinutes: number }> {
    const out: Record<string, { label: string; channelSlug: string | null; effortMinutes: number }> = {}
    for (const key of keys) {
      const resolution = this.resolveActivityDefinition(key, channelId)
      if (resolution.definition) {
        out[key] = {
          label: resolution.definition.label,
          channelSlug: resolution.channel?.slug ?? null,
          effortMinutes: resolution.definition.effortMinutes,
        }
      } else {
        // Unknown keys keep their raw text and zero effort — no invented label.
        out[key] = { label: key, channelSlug: null, effortMinutes: 0 }
      }
    }
    return out
  }

  /**
   * Authorization boundary check for recording credit. A missing/disabled
   * definition is a hard denial: no silent "other".
   */
  validateActivityEvent(input: { key: string; channelId?: string | null; sourceEventId?: string | null; evidence?: unknown }):
    | { ok: true; resolution: ActivityResolution }
    | { ok: false; reason: string; resolution: ActivityResolution } {
    const resolution = this.resolveActivityDefinition(input.key, input.channelId)
    if (resolution.status === 'unknown') {
      return { ok: false, reason: `Unknown activity "${input.key}".`, resolution }
    }
    if (resolution.status === 'disabled') {
      return { ok: false, reason: `Activity "${input.key}" is disabled.`, resolution }
    }
    const policy = this.resolveActivityCountingPolicy(input.key, input.channelId)
    if (!policy) {
      return { ok: false, reason: `No counting policy for "${input.key}".`, resolution }
    }
    if (policy.evidencePolicy === 'provider_event_id' && !input.sourceEventId) {
      return { ok: false, reason: `"${input.key}" requires a provider event reference.`, resolution }
    }
    return { ok: true, resolution }
  }
}

/** Convenience for callers that already hold a catalog request scope. */
export function createActivityResolver(catalog: ActivityCatalog): CanonicalActivityResolver {
  return new CanonicalActivityResolver(catalog)
}
