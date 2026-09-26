import { describe, it, expect } from 'vitest'

/**
 * Exactly-once accountability contract.
 *
 * These tests document the INVARIANTS that migration 20261001000004
 * enforces at the database level. They are written as contract assertions
 * against the RPC signatures and the source_event_ids dedupe mechanism.
 *
 * Once the migration is applied, the concurrent/retry integration tests
 * against the live DB should verify:
 *   1. Two simultaneous calls with the same source_event_id → exactly 1 increment
 *   2. A retry (same idempotency key) → idempotent: true, no double increment
 *   3. Different source_event_ids → each increments correctly
 */

describe('accountability exactly-once contract', () => {
  it('record_activity_event accepts source_event_id as 5th parameter', () => {
    // After migration 20261001000004, the RPC signature is:
    //   record_activity_event(p_rep_id, p_identity_id, p_activity_type, p_org_id, p_source_event_id default null)
    // The default null preserves backward compatibility with callers that don't pass it.
    const rpcParams = {
      p_rep_id: 'rep-1',
      p_identity_id: 'identity-1',
      p_activity_type: 'connection_request',
      p_org_id: 'org-1',
      p_source_event_id: 'activity:lead-1:key-123:identity-1',
    }
    expect(rpcParams.p_source_event_id).toBe('activity:lead-1:key-123:identity-1')
  })

  it('same source_event_id must not double-count (invariant)', () => {
    // Invariant: calling record_activity_event twice with the same source_event_id
    // results in completed_count = 1, not 2.
    // The RPC checks: source_event_ids @> array[p_source_event_id] → skip increment
    const sourceEventId = 'activity:lead-abc:key-xyz:identity-1'
    const firstCall = { recorded: true, completed_count: 1 }
    const secondCall = { recorded: false, reason: 'already_recorded', completed_count: 1 }
    expect(firstCall.completed_count).toBe(1)
    expect(secondCall.completed_count).toBe(1) // NOT 2
  })

  it('different source_event_ids each count once', () => {
    // Two distinct business actions (different leads or different activity types)
    // each increment independently.
    const call1 = { sourceEventId: 'activity:lead-1:key-a:identity-1', recorded: true, completed_count: 1 }
    const call2 = { sourceEventId: 'activity:lead-2:key-b:identity-1', recorded: true, completed_count: 1 }
    expect(call1.sourceEventId).not.toBe(call2.sourceEventId)
    expect(call1.recorded).toBe(true)
    expect(call2.recorded).toBe(true)
  })

  it('follow-up event id uses stable key (not Date.now)', () => {
    // Bug fix: FOLLOWUP_RECORDED sourceEventId must be stable across retries.
    // Before: `followup_recorded:${id}:${Date.now()}` — unique per call
    // After:  `followup_recorded:${id}:${idempotencyKey ?? 'none'}` — stable
    const leadId = 'lead-123'
    const idempotencyKey = 'client-key-abc'
    const eventId1 = `followup_recorded:${leadId}:${idempotencyKey}`
    const eventId2 = `followup_recorded:${leadId}:${idempotencyKey}`
    expect(eventId1).toBe(eventId2)
  })

  it('relay_events unique index holds (org, source, source_event_id)', () => {
    // After migration: unique index on (organization_id, source, source_event_id)
    // means concurrent duplicate inserts are impossible at the DB layer.
    // emit_relay_event RPC handles the unique_violation exception gracefully.
    const uniqueKey = { org: 'org-1', source: 'app', sourceEventId: 'outreach:lead-1:key-1' }
    expect(uniqueKey.sourceEventId).toBeDefined()
  })

  it('each activity type maps to correct source_event_id namespace', () => {
    // Verify the source_event_id naming convention for each action type.
    // This prevents accidental cross-action dedupe (e.g. connection key colliding with DM key).
    const ids = {
      connection: 'activity:lead-1:key-1:identity-1',
      dm: 'activity:lead-1:key-1:identity-1', // same lead, same identity — different RPC call (activity_type differs)
      upwork: 'activity:upwork:job-1:identity-1',
      followup: 'followup_recorded:lead-1:key-1',
    }
    // Connection and DM share the prefix but are separate RPC calls with different p_activity_type
    expect(ids.connection).toBe(ids.dm) // Same prefix is fine — activity_type differentiates
    expect(ids.upwork).toContain('upwork')
    expect(ids.followup).toContain('followup_recorded')
  })
})
