/**
 * Explicit rep-day transitions: check in, close, exception.
 *
 * These are the only writes that change a day's lifecycle. Derived columns
 * (state, pace, minutes) are refreshed elsewhere; check-in, close and exception
 * are user or admin decisions and are never inferred.
 *
 * Every transition is idempotent. A double-click cannot move a check-in time,
 * and closing twice returns the first close.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase/server'
import type { RepDayView } from './load'

export type CloseMode = 'complete' | 'incomplete'

export interface CloseInput {
  mode: CloseMode
  exceptionReason?: string | null
  exceptionNote?: string | null
}

export interface CloseResult {
  ok: boolean
  error?: string
  shortfall?: Record<string, unknown>
  closedAt?: string
}

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42P01') return true
  return /does not exist|schema cache/i.test(String(error.message ?? ''))
}

const MISSING_TABLE_MESSAGE =
  'The rep-day table is not present in this database. Apply migration 20261030120100_rep_day.sql.'

export async function checkInRepDay(input: {
  organizationId: string
  repId: string
  businessDate: string
  now: Date
  client?: SupabaseClient
}): Promise<{ ok: boolean; checkInAt: string | null; error?: string }> {
  const supabase = input.client ?? (await createServerSupabase())
  const key = {
    organization_id: input.organizationId,
    rep_id: input.repId,
    business_date: input.businessDate,
  }

  const { data: existing, error: readError } = await supabase
    .from('rep_day')
    .select('id, check_in_at')
    .match(key)
    .maybeSingle()

  if (readError) {
    if (isMissingRelation(readError)) return { ok: false, checkInAt: null, error: MISSING_TABLE_MESSAGE }
    return { ok: false, checkInAt: null, error: readError.message }
  }

  // Idempotent: the first check-in is the check-in.
  if (existing?.check_in_at) {
    return { ok: true, checkInAt: existing.check_in_at as string }
  }

  const checkInAt = input.now.toISOString()
  if (existing) {
    const { error } = await supabase
      .from('rep_day')
      .update({ check_in_at: checkInAt, state: 'ACTIVE', updated_at: checkInAt })
      .eq('id', existing.id as string)
    if (error) return { ok: false, checkInAt: null, error: error.message }
    return { ok: true, checkInAt }
  }

  const { error } = await supabase.from('rep_day').insert({
    ...key,
    check_in_at: checkInAt,
    state: 'ACTIVE',
  })
  if (error) {
    // A concurrent insert won the race; the first check-in still stands.
    if (error.code === '23505') {
      const { data } = await supabase.from('rep_day').select('check_in_at').match(key).maybeSingle()
      return { ok: true, checkInAt: (data?.check_in_at as string) ?? checkInAt }
    }
    if (isMissingRelation(error)) return { ok: false, checkInAt: null, error: MISSING_TABLE_MESSAGE }
    return { ok: false, checkInAt: null, error: error.message }
  }
  return { ok: true, checkInAt }
}

/** The immutable record of what was not done. */
export function buildShortfall(view: RepDayView, mode: CloseMode): Record<string, unknown> {
  const outstanding = view.commitments
    .filter((row) => row.unit === 'count' && row.remaining > 0)
    .map((row) => ({ key: row.key, label: row.label, remaining: row.remaining }))

  return {
    closedIncomplete: mode === 'incomplete',
    requiredRemaining: view.requiredRemaining,
    repliesWaiting: view.mandatoryRemaining,
    commitments: outstanding,
  }
}

/** What the next operating day inherits. */
export function buildCarryover(view: RepDayView): Record<string, unknown> {
  return {
    from: view.businessDate,
    requiredRemaining: view.requiredRemaining,
    repliesWaiting: view.mandatoryRemaining,
    commitments: view.commitments
      .filter((row) => row.unit === 'count' && row.remaining > 0)
      .map((row) => ({ key: row.key, label: row.label, remaining: row.remaining })),
  }
}

export async function closeRepDay(input: {
  view: RepDayView
  mode: CloseMode
  now: Date
  exceptionReason?: string | null
  exceptionNote?: string | null
  client?: SupabaseClient
}): Promise<CloseResult> {
  const { view, mode, now } = input
  const supabase = input.client ?? (await createServerSupabase())

  if (view.closedAt) {
    return { ok: true, closedAt: view.closedAt, shortfall: view.shortfall }
  }

  const exceptionApproved = view.exception.state === 'APPROVED'
  if (mode === 'complete' && view.requiredRemaining > 0 && !exceptionApproved) {
    return {
      ok: false,
      error: `${view.requiredRemaining} required ${view.requiredRemaining === 1 ? 'action is' : 'actions are'} still incomplete. Complete them, request an exception, or close incomplete.`,
    }
  }

  const shortfall = mode === 'incomplete' ? buildShortfall(view, mode) : buildShortfall(view, 'complete')
  const carryover = buildCarryover(view)
  const closedAt = now.toISOString()

  const payload: Record<string, unknown> = {
    closed_at: closedAt,
    state: 'CLOSED',
    shortfall,
    carryover,
    updated_at: closedAt,
  }

  if (input.exceptionReason) {
    payload.exception_reason = input.exceptionReason
    payload.exception_state = exceptionApproved ? 'APPROVED' : 'REQUESTED'
  }
  if (input.exceptionNote !== undefined) payload.exception_note = input.exceptionNote

  const { error } = await supabase
    .from('rep_day')
    .update(payload)
    .eq('organization_id', view.organizationId)
    .eq('rep_id', view.repId)
    .eq('business_date', view.businessDate)

  if (error) {
    if (isMissingRelation(error)) return { ok: false, error: MISSING_TABLE_MESSAGE }
    return { ok: false, error: error.message }
  }

  return { ok: true, closedAt, shortfall }
}

export async function requestRepDayException(input: {
  organizationId: string
  repId: string
  businessDate: string
  reason: string
  note: string | null
  client?: SupabaseClient
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = input.client ?? (await createServerSupabase())
  const { error } = await supabase
    .from('rep_day')
    .update({
      exception_state: 'REQUESTED',
      exception_reason: input.reason,
      exception_note: input.note,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', input.organizationId)
    .eq('rep_id', input.repId)
    .eq('business_date', input.businessDate)

  if (error) {
    if (isMissingRelation(error)) return { ok: false, error: MISSING_TABLE_MESSAGE }
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function reviewRepDayException(input: {
  organizationId: string
  repId: string
  businessDate: string
  approved: boolean
  reviewerId: string
  reason?: string | null
  client?: SupabaseClient
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = input.client ?? (await createServerSupabase())
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('rep_day')
    .update({
      exception_state: input.approved ? 'APPROVED' : 'REJECTED',
      exception_reason: input.reason ?? null,
      reviewed_by: input.reviewerId,
      reviewed_at: now,
      updated_at: now,
    })
    .eq('organization_id', input.organizationId)
    .eq('rep_id', input.repId)
    .eq('business_date', input.businessDate)

  if (error) {
    if (isMissingRelation(error)) return { ok: false, error: MISSING_TABLE_MESSAGE }
    return { ok: false, error: error.message }
  }
  return { ok: true }
}
