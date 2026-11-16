import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { recordHumanEdits } from '@/lib/profile-intelligence/enrichment-service'

export const dynamic = 'force-dynamic'

/**
 * Canonical knowledge edits.
 *
 * Writes the EXISTING knowledge tables — never a parallel model — and appends
 * an audit row per change. Profile field edits go through the same
 * `recordHumanEdits` path the profile-intelligence surface uses, so a manual
 * edit becomes human-verified and later imports cannot silently override it.
 *
 * Body: { operations: Operation[], reason?: string }
 * Operation: { entity, action, id?, data? }
 */

type Entity = 'profile' | 'experience' | 'project' | 'claim' | 'proof'

interface Operation {
  entity?: unknown
  action?: unknown
  id?: unknown
  data?: unknown
}

const EDITABLE_PROFILE_FIELDS = [
  'full_name', 'display_name', 'headline', 'current_role', 'company',
  'location', 'bio', 'professional_summary', 'seniority', 'years_experience',
  'positioning', 'readiness',
]
const PROFILE_ARRAY_FIELDS = [
  'primary_skills', 'secondary_skills', 'technologies', 'industries',
  'service_capabilities', 'specialties', 'differentiators', 'languages',
]

function string(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function stringList(value: unknown): string[] | null {
  return Array.isArray(value) ? value.filter((row): row is string => typeof row === 'string') : null
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ profileId: string }> }) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!ctx.isAdmin && !can(ctx, 'MANAGE_REVENUE_IDENTITIES')) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { profileId: id } = await params
  const body = (await req.json().catch(() => null)) as { operations?: unknown; reason?: unknown } | null
  const operations = Array.isArray(body?.operations) ? (body!.operations as Operation[]) : []
  if (operations.length === 0) {
    return NextResponse.json({ error: 'operations is required.' }, { status: 400 })
  }
  if (operations.length > 100) {
    return NextResponse.json({ error: 'At most 100 operations per request.' }, { status: 400 })
  }
  const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 500) : null

  const client = await createServerSupabase()
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('id, organization_id')
    .eq('id', id)
    .eq('organization_id', ctx.orgId)
    .maybeSingle()
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })
  if (!profile) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })

  const now = new Date().toISOString()
  const audit: Array<Record<string, unknown>> = []
  const apply = async (operation: Operation, index: number): Promise<void> => {
    const entity = operation.entity as Entity
    const action = operation.action
    const data = (operation.data ?? {}) as Record<string, unknown>
    if (!['profile', 'experience', 'project', 'claim', 'proof'].includes(entity)) {
      throw new Error(`Operation ${index}: unknown entity ${String(entity)}`)
    }
    if (!['create', 'update', 'delete'].includes(String(action))) {
      throw new Error(`Operation ${index}: unknown action ${String(action)}`)
    }
    const targetId = typeof operation.id === 'string' ? operation.id : null

    if (entity === 'profile') {
      if (action === 'delete') throw new Error('Operation: profile cannot be deleted here; archive the profile instead.')
      const { data: before } = await client.from('profiles').select('*').eq('id', id).maybeSingle()
      const updates: Record<string, unknown> = { updated_at: now }
      for (const field of EDITABLE_PROFILE_FIELDS) {
        if (data[field] !== undefined) {
          const value = data[field]
          if (value !== null && typeof value !== 'string') throw new Error(`Operation: ${field} must be a string`)
          updates[field] = value
        }
      }
      for (const field of PROFILE_ARRAY_FIELDS) {
        if (data[field] !== undefined) {
          const value = stringList(data[field])
          if (!value) throw new Error(`Operation: ${field} must be an array of strings`)
          updates[field] = value
        }
      }
      const { error: updateError } = await client.from('profiles').update(updates).eq('id', id).eq('organization_id', ctx.orgId)
      if (updateError) throw new Error(updateError.message)
      await recordHumanEdits(client as never, { orgId: ctx.orgId, profileId: id, repId: ctx.repId, before: before ?? {}, after: updates })
      audit.push({
        organization_id: ctx.orgId, profile_id: id, actor_id: ctx.repId, entity: 'profile', action: 'update',
        field: Object.keys(updates).filter((key) => key !== 'updated_at').join(','),
        previous_value: before ?? null, new_value: updates, reason,
      })
      return
    }

    const tables: Record<string, { table: string; columns: string[]; timestamp: boolean }> = {
      experience: {
        table: 'profile_experience',
        columns: ['role', 'company', 'start_date', 'end_date', 'is_current', 'authority'],
        timestamp: true,
      },
      project: {
        table: 'portfolio_projects',
        columns: ['project_title', 'my_role', 'description', 'skills', 'technologies', 'client_company', 'start_date', 'end_date', 'outcome'],
        timestamp: true,
      },
      claim: {
        table: 'profile_claims',
        columns: ['claim_key', 'claim_value', 'evidence_type', 'is_inferred', 'user_corrected', 'user_rejected'],
        timestamp: true,
      },
      proof: {
        table: 'proof_cards',
        columns: ['capability', 'strength', 'safe_claim', 'source_type', 'tags', 'verified', 'forbidden_claims'],
        timestamp: false,
      },
    }
    const config = tables[entity]
    const row: Record<string, unknown> = {}
    for (const column of config.columns) {
      if (data[column] === undefined) continue
      const value = data[column]
      if (Array.isArray(value)) {
        const list = stringList(value)
        if (!list) throw new Error(`Operation: ${column} must be an array of strings`)
        row[column] = list
      } else if (typeof value === 'boolean') {
        row[column] = value
      } else if (column === 'strength') {
        const parsed = integer(value)
        if (parsed === null) throw new Error(`Operation: ${column} must be a number`)
        row[column] = parsed
      } else {
        const parsed = string(value)
        if (parsed === null) throw new Error(`Operation: ${column} must be a string`)
        row[column] = parsed
      }
    }

    let previous: Record<string, unknown> | null = null
    if (action === 'delete') {
      if (!targetId) throw new Error('Operation: delete requires an id')
      const { data: beforeRow } = await client.from(config.table).select('*').eq('id', targetId).eq('profile_id', id).maybeSingle()
      const { error: deleteError } = await client.from(config.table).delete().eq('id', targetId).eq('profile_id', id)
      if (deleteError) throw new Error(deleteError.message)
      previous = (beforeRow as Record<string, unknown>) ?? null
    } else if (action === 'update') {
      if (!targetId) throw new Error('Operation: update requires an id')
      const { data: beforeRow } = await client.from(config.table).select('*').eq('id', targetId).eq('profile_id', id).maybeSingle()
      const patch: Record<string, unknown> = { ...row }
      if (config.timestamp) patch.updated_at = now
      const { error: updateError } = await client.from(config.table).update(patch).eq('id', targetId).eq('profile_id', id)
      if (updateError) throw new Error(updateError.message)
      previous = (beforeRow as Record<string, unknown>) ?? null
    } else {
      const { error: insertError } = await client.from(config.table).insert({ ...row, profile_id: id, organization_id: ctx.orgId, created_at: now })
      if (insertError) throw new Error(insertError.message)
    }

    audit.push({
      organization_id: ctx.orgId, profile_id: id, actor_id: ctx.repId, entity, action,
      target_id: targetId, previous_value: previous, new_value: row, reason,
    })
  }

  try {
    for (const [index, operation] of operations.entries()) {
      await apply(operation, index)
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Knowledge update failed.' }, { status: 400 })
  }

  if (audit.length > 0) {
    // Reuse the existing audit authority. The rich detail (entity, field,
    // before/after, reason) travels in the jsonb columns; target_id scopes the
    // row to the person so the History timeline can query by profile.
    const rows = audit.map((row) => ({
      organization_id: ctx.orgId,
      actor_id: ctx.repId,
      action: 'knowledge',
      target_table: 'profile_knowledge',
      target_id: id,
      previous_value: {
        entity: row.entity,
        field: row.field ?? null,
        action: row.action,
        value: row.previous_value ?? null,
        reason: row.reason ?? null,
      },
      new_value: {
        entity: row.entity,
        field: row.field ?? null,
        action: row.action,
        value: row.new_value ?? null,
        reason: row.reason ?? null,
      },
    }))
    const { error: auditError } = await client.from('accountability_audit_log').insert(rows)
    if (auditError) console.warn('[knowledge] audit write failed', auditError.message)
  }

  return NextResponse.json({ ok: true, applied: audit.length })
}
