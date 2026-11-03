import { describe, expect, it } from 'vitest'
import {
  LEAD_COLUMNS,
  LEAD_LIST_COLUMNS,
  RELAY_QUEUE_CONVERSATION_COLUMNS,
  RELAY_QUEUE_MESSAGE_COLUMNS,
  UPWORK_JOB_LIST_COLUMNS,
} from '@/lib/store/supabase-store'
import { truncatePreview } from '@/lib/operations/chat-queue'

/**
 * Egress regression contracts. The list/board/queue projections must never
 * carry the heavy detail blobs; the detail projection must keep them. These
 * assert the projection contracts themselves, not a SQL snapshot, so a rename
 * or a reorder does not fail the suite.
 */

const LIST = LEAD_LIST_COLUMNS.split(',').map((s) => s.trim())
const DETAIL = LEAD_COLUMNS.split(',').map((s) => s.trim())

describe('RELAY egress — lead projections', () => {
  it('LEADS_LIST_EXCLUDES_HEAVY_COLUMNS', () => {
    for (const col of [
      'score_breakdown',
      'extraction_profile',
      'raw_source_data',
      'evidence_ledger',
      'raw_input',
      'canonical_intelligence',
      'inbound_raw',
      'search_vector',
      'title_raw',
      'location_raw',
    ]) {
      expect(LIST, col).not.toContain(col)
    }
  })

  it('LEAD_DETAIL_OWNS_SCORE_BREAKDOWN', () => {
    for (const col of [
      'score_breakdown',
      'raw_input',
      'canonical_intelligence',
      'evidence_ledger',
      'extraction_profile',
    ]) {
      expect(DETAIL, col).toContain(col)
    }
  })

  it('LEADS_LIST_KEEPS_RENDERED_AND_DERIVED_FIELDS', () => {
    for (const col of [
      'id',
      'company',
      'contact_name',
      'contact_title',
      'signal_evidence',
      'inbound_message',
      'verbatim_quote',
      'play_id',
      'canonical_score',
      'buyer_intent:canonical_intelligence->buyerIntent',
      'connection_accepted_at',
      'locked_until',
      'archived',
      'created_at',
    ]) {
      expect(LIST, col).toContain(col)
    }
  })
})

describe('RELAY egress — queue projections', () => {
  it('RELAY_QUEUE_CONVERSATION_EXCLUDES_MEMORY_BLOBS', () => {
    const cols = RELAY_QUEUE_CONVERSATION_COLUMNS.split(',').map((s) => s.trim())
    expect(cols).toEqual(['lead_id', 'stage', 'sender_profile_id'])
    for (const col of ['memory', 'commercial_state', 'composer_draft']) {
      expect(cols, col).not.toContain(col)
    }
  })

  it('RELAY_QUEUE_MESSAGES_EXCLUDE_FULL_THREAD_COLUMNS', () => {
    const cols = RELAY_QUEUE_MESSAGE_COLUMNS.split(',').map((s) => s.trim())
    for (const col of [
      'original_draft',
      'idempotency_key',
      'model_used',
      'send_disposition',
      'reject_reasons',
      'strategy',
      'angle',
      'cta_type',
      'thread_status',
    ]) {
      expect(cols, col).not.toContain(col)
    }
  })

  it('CHAT_QUEUE_EXCLUDES_FULL_MESSAGES', () => {
    expect(truncatePreview('x'.repeat(500))).toHaveLength(140)
  })

  it('UPWORK_LIST_EXCLUDES_DETAIL_BLOBS', () => {
    const cols = UPWORK_JOB_LIST_COLUMNS.split(',').map((s) => s.trim())
    for (const col of ['raw_input', 'job_facts', 'search_vector', 'score_breakdown', 'screening_questions', 'application_requirements']) {
      expect(cols, col).not.toContain(col)
    }
    for (const col of ['id', 'title', 'description', 'required_skills', 'urgency_signal', 'status', 'connects_cost', 'client_name']) {
      expect(cols, col).toContain(col)
    }
  })
})
