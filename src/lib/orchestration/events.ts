import type {
  RelayActorType,
  RelayEventType,
  RelayEvent,
} from '@/lib/domain/types'

export interface EmitRelayEventInput {
  orgId: string
  eventType: RelayEventType
  entityType: string
  entityId?: string | null
  actorType?: RelayActorType
  actorId?: string | null
  revenueIdentityId?: string | null
  source?: string
  sourceEventId?: string | null
  correlationId?: string | null
  causationId?: string | null
  relayRunId?: string | null
  payload?: Record<string, unknown>
  metadata?: Record<string, unknown>
  occurredAt?: string
}

/**
 * Canonical application-level event emission.
 *
 * All event creation in the Relay codebase should go through this function.
 * Events are append-only — they are never updated or deleted.
 */
export interface RelayEventEmitter {
  emit(input: EmitRelayEventInput): Promise<string | null>
}

/**
 * Maps a raw Supabase relay_events row to a RelayEvent domain object.
 */
export function mapRelayEvent(row: Record<string, unknown>): RelayEvent {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    eventType: row.event_type as RelayEventType,
    entityType: row.entity_type as string,
    entityId: (row.entity_id as string) ?? null,
    actorType: (row.actor_type as RelayActorType) ?? 'system',
    actorId: (row.actor_id as string) ?? null,
    revenueIdentityId: (row.revenue_identity_id as string) ?? null,
    source: (row.source as string) ?? 'app',
    sourceEventId: (row.source_event_id as string) ?? null,
    correlationId: (row.correlation_id as string) ?? null,
    causationId: (row.causation_id as string) ?? null,
    relayRunId: (row.relay_run_id as string) ?? null,
    payload: (row.payload as Record<string, unknown>) ?? {},
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    occurredAt: row.occurred_at as string,
    createdAt: row.created_at as string,
  }
}

/**
 * Maps a raw Supabase relay_runs row to a RelayRun domain object.
 */
export function mapRelayRun(row: Record<string, unknown>): import('@/lib/domain/types').RelayRun {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    runType: row.run_type as import('@/lib/domain/types').RelayRunType,
    primaryEntityType: (row.primary_entity_type as string) ?? 'lead',
    primaryEntityId: (row.primary_entity_id as string) ?? null,
    status: row.status as import('@/lib/domain/types').RelayRunStatus,
    currentStep: (row.current_step as string) ?? row.status as string,
    assignedRepId: (row.assigned_rep_id as string) ?? null,
    revenueIdentityId: (row.revenue_identity_id as string) ?? null,
    correlationId: (row.correlation_id as string) ?? row.id as string,
    startedAt: row.started_at as string,
    waitingUntil: (row.waiting_until as string) ?? null,
    completedAt: (row.completed_at as string) ?? null,
    failedAt: (row.failed_at as string) ?? null,
    failureCategory: (row.failure_category as string) ?? null,
    failureReason: (row.failure_reason as string) ?? null,
    context: (row.context as Record<string, unknown>) ?? {},
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}
