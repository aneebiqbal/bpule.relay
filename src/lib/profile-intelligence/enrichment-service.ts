/**
 * Profile Enrichment + Safe Merge — I/O layer.
 *
 * PROFILE IDENTITY IS PERMANENT. IMPORT ENRICHES THE PROFILE.
 * IMPORT NEVER DESTROYS RELATIONSHIPS.
 *
 * Every mutation of profile data goes through one of two Postgres functions
 * (`apply_profile_enrichment`, `merge_profiles`) so it is a single
 * transaction: on any failure nothing is written. This module never issues a
 * DELETE and never writes profiles.id or any *_profile_id relationship column.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildPlan,
  buildProposal,
  computeReadiness,
  fingerprint,
  norm,
  personMatchesProfile,
  sha256,
  withChronology,
  type Decision,
  type EnrichmentProposal,
  type ExistingProfileState,
  type SourceExtraction,
} from './enrichment'
import type { SourceExtractor } from './enrichment-extract'
import { sanitizeFilename } from './parse-document'
import { resolveIdentity } from './identity-resolution'

export const ENRICH_MAX_FILES = 20
export const ENRICH_MAX_BYTES = 20 * 1024 * 1024

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
}
const ALLOWED_MIME = new Set([...Object.values(MIME_BY_EXT), 'text/x-markdown'])

export class EnrichmentError extends Error {
  constructor(message: string, public status: number, public details?: unknown) {
    super(message)
  }
}

export function resolveMime(filename: string, declared: string | null | undefined): string | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const d = (declared ?? '').toLowerCase()
  if (d && d !== 'application/octet-stream' && ALLOWED_MIME.has(d)) return d === 'text/x-markdown' ? 'text/markdown' : d
  return MIME_BY_EXT[ext] ?? null
}

// ── State ────────────────────────────────────────────────────────────────────

export async function loadProfileState(client: SupabaseClient, orgId: string, profileId: string): Promise<ExistingProfileState | null> {
  const { data: profile } = await client.from('profiles').select('*').eq('id', profileId).eq('organization_id', orgId).maybeSingle()
  if (!profile) return null
  const [projects, proofs, reviews, claims, experience] = await Promise.all([
    client.from('portfolio_projects').select('id, project_title, my_role, description, technologies, client_company, start_date, end_date, outcome, content_fingerprint').eq('profile_id', profileId),
    client.from('proof_cards').select('id, safe_claim, content_fingerprint').eq('profile_id', profileId),
    client.from('profile_reviews').select('id, review_text, content_fingerprint').eq('profile_id', profileId),
    client.from('profile_claims').select('claim_key, claim_value, authority, user_corrected, user_rejected, claim_status, merge_action').eq('profile_id', profileId),
    client.from('profile_experience').select('id, role, company, start_date, end_date, is_current, content_fingerprint').eq('profile_id', profileId),
  ])
  for (const r of [projects, proofs, reviews, claims, experience]) {
    if (r.error) throw new EnrichmentError(`Failed to load profile state: ${r.error.message}`, 500)
  }
  return {
    profile,
    projects: projects.data ?? [],
    proofs: proofs.data ?? [],
    reviews: reviews.data ?? [],
    claims: claims.data ?? [],
    experience: experience.data ?? [],
  }
}

// ── 1. Upload → run ─────────────────────────────────────────────────────────

export interface UploadFile {
  name: string
  type: string
  bytes: Uint8Array
}

export async function createEnrichmentRun(
  client: SupabaseClient,
  args: { orgId: string; profileId: string; actorRepId: string; files: UploadFile[] },
) {
  const { orgId, profileId, actorRepId, files } = args
  if (files.length === 0) throw new EnrichmentError('No files uploaded.', 400)
  if (files.length > ENRICH_MAX_FILES) throw new EnrichmentError(`Maximum ${ENRICH_MAX_FILES} files per import.`, 400)

  const { data: profile } = await client.from('profiles').select('id, archived_at').eq('id', profileId).eq('organization_id', orgId).maybeSingle()
  if (!profile) throw new EnrichmentError('Profile not found.', 404)
  if (profile.archived_at) throw new EnrichmentError('Profile is archived.', 409)

  const { data: batch, error: batchErr } = await client.from('profile_import_batches').insert({
    organization_id: orgId, uploaded_by: actorRepId, status: 'uploaded', total_files: files.length,
    metadata: { mode: 'enrich', profile_id: profileId, file_names: files.map((f) => f.name) },
  }).select('id').single()
  if (batchErr || !batch) throw new EnrichmentError(`Failed to create import batch: ${batchErr?.message}`, 500)

  const { data: run, error: runErr } = await client.from('profile_enrichment_runs').insert({
    organization_id: orgId, profile_id: profileId, import_batch_id: batch.id, actor_rep_id: actorRepId, status: 'uploaded',
  }).select('*').single()
  if (runErr || !run) throw new EnrichmentError(`Failed to create enrichment run: ${runErr?.message}`, 500)

  const sourceIds: string[] = []
  const alreadyImported: Array<{ filename: string; source_id: string }> = []
  const rejected: Array<{ filename: string; reason: string }> = []
  const seen = new Set<string>()

  for (const file of files) {
    const mime = resolveMime(file.name, file.type)
    if (!mime) { rejected.push({ filename: file.name, reason: `Unsupported file type (${file.type || 'unknown'}).` }); continue }
    if (file.bytes.byteLength > ENRICH_MAX_BYTES) { rejected.push({ filename: file.name, reason: 'File exceeds 20 MB.' }); continue }
    if (file.bytes.byteLength === 0) { rejected.push({ filename: file.name, reason: 'File is empty.' }); continue }

    const hash = sha256(file.bytes)
    if (seen.has(hash)) { rejected.push({ filename: file.name, reason: 'Same file selected twice in this import.' }); continue }
    seen.add(hash)

    // Idempotency: the same bytes already imported into THIS profile.
    const { data: linked } = await client.from('profile_sources').select('id').eq('organization_id', orgId)
      .eq('profile_id', profileId).eq('file_hash', hash).limit(1).maybeSingle()
    if (linked) { alreadyImported.push({ filename: file.name, source_id: linked.id }); continue }

    // Retry: same bytes uploaded for this profile in an earlier run that was
    // never applied — reuse that source row (and its cached extraction).
    const { data: priorRuns } = await client.from('profile_enrichment_runs').select('id').eq('profile_id', profileId).neq('id', run.id)
    const priorIds = (priorRuns ?? []).map((r) => r.id)
    if (priorIds.length > 0) {
      const { data: pending } = await client.from('profile_sources').select('id').eq('organization_id', orgId)
        .is('profile_id', null).eq('file_hash', hash).in('enrichment_run_id', priorIds).limit(1).maybeSingle()
      if (pending) {
        await client.from('profile_sources').update({ enrichment_run_id: run.id, import_batch_id: batch.id, updated_at: new Date().toISOString() }).eq('id', pending.id)
        sourceIds.push(pending.id)
        continue
      }
    }

    const storagePath = `${orgId}/${profileId}/${crypto.randomUUID()}_${sanitizeFilename(file.name)}`
    const { error: upErr } = await client.storage.from('profile-sources').upload(storagePath, file.bytes, { contentType: mime, upsert: false })
    if (upErr) { rejected.push({ filename: file.name, reason: `Storage upload failed: ${upErr.message}` }); continue }

    const { data: src, error: srcErr } = await client.from('profile_sources').insert({
      organization_id: orgId, profile_id: null, import_batch_id: batch.id, enrichment_run_id: run.id,
      storage_path: storagePath, original_filename: file.name.slice(0, 200), mime_type: mime,
      file_size_bytes: file.bytes.byteLength, file_hash: hash, content_fingerprint: hash,
      parsing_status: 'pending', extraction_status: 'pending', uploaded_by: actorRepId,
    }).select('id').single()
    if (srcErr || !src) { rejected.push({ filename: file.name, reason: `Failed to record source: ${srcErr?.message}` }); continue }
    sourceIds.push(src.id)
  }

  const status = sourceIds.length > 0 ? 'extracting' : alreadyImported.length > 0 ? 'extracting' : 'failed'
  const { data: updated } = await client.from('profile_enrichment_runs').update({
    source_ids: sourceIds, status, updated_at: new Date().toISOString(),
    audit: { upload: { already_imported: alreadyImported, rejected } },
    error_message: status === 'failed' ? 'No usable files.' : null,
  }).eq('id', run.id).select('*').single()
  await client.from('profile_import_batches').update({
    status: status === 'failed' ? 'failed' : 'extracting', processed_files: sourceIds.length, failed_files: rejected.length,
    updated_at: new Date().toISOString(),
  }).eq('id', batch.id)

  return { run: updated ?? run, sourceIds, alreadyImported, rejected }
}

// ── 2. Extract (one source per call) → proposal ────────────────────────────

export async function processNextEnrichmentSource(
  client: SupabaseClient,
  args: { orgId: string; runId: string; extractor: SourceExtractor },
) {
  const run = await getRunOrThrow(client, args.orgId, args.runId)
  if (!['uploaded', 'extracting'].includes(run.status)) return { done: true, run }

  const { data: sources } = await client.from('profile_sources')
    .select('id, storage_path, original_filename, mime_type, file_hash, extraction_status, extraction_result')
    .in('id', run.source_ids.length ? run.source_ids : ['00000000-0000-0000-0000-000000000000'])
  const next = (sources ?? []).find((s) => !s.extraction_result && ['pending', 'extracting'].includes(s.extraction_status))

  if (next) {
    const { data: profile } = await client.from('profiles').select('full_name, display_name, label').eq('id', run.profile_id).single()
    await client.from('profile_sources').update({ parsing_status: 'parsing', extraction_status: 'extracting', updated_at: new Date().toISOString() }).eq('id', next.id)
    try {
      const { data: blob, error } = await client.storage.from('profile-sources').download(next.storage_path)
      if (error || !blob) throw new Error(`File not found in storage${error ? `: ${error.message}` : ''}.`)
      const { extraction, parsedContent, pageCount } = await args.extractor({
        buffer: await blob.arrayBuffer(), mimeType: next.mime_type, filename: next.original_filename,
        sourceId: next.id, fingerprint: next.file_hash, organizationId: args.orgId,
        profileName: profile?.full_name ?? profile?.display_name ?? profile?.label ?? null,
      })
      await client.from('profile_sources').update({
        parsing_status: 'parsed', extraction_status: 'extracted', parsed_content: parsedContent, page_count: pageCount,
        extraction_result: JSON.parse(JSON.stringify(extraction)),
        detected_people: extraction.people.map((p) => ({ name: p.name })),
        parsed_at: new Date().toISOString(), extracted_at: new Date().toISOString(), updated_at: new Date().toISOString(), error_message: null,
      }).eq('id', next.id)
    } catch (err) {
      await client.from('profile_sources').update({
        parsing_status: 'failed', extraction_status: 'failed', error_message: err instanceof Error ? err.message : 'Extraction failed', updated_at: new Date().toISOString(),
      }).eq('id', next.id)
    }
    const remaining = (sources ?? []).filter((s) => s.id !== next.id && !s.extraction_result && ['pending', 'extracting'].includes(s.extraction_status)).length
    return { done: false, remaining, run: await getRunOrThrow(client, args.orgId, args.runId) }
  }

  return { done: true, run: await proposeRun(client, args.orgId, args.runId) }
}

/** Builds (or rebuilds against fresh state) the dry-run diff. Never mutates the profile. */
export async function proposeRun(client: SupabaseClient, orgId: string, runId: string) {
  const run = await getRunOrThrow(client, orgId, runId)
  const state = await loadProfileState(client, orgId, run.profile_id)
  if (!state) throw new EnrichmentError('Profile not found.', 404)

  const { data: sources } = await client.from('profile_sources').select('id, extraction_status, extraction_result, original_filename, error_message')
    .in('id', run.source_ids.length ? run.source_ids : ['00000000-0000-0000-0000-000000000000'])
  const extractions = (sources ?? []).filter((s) => s.extraction_result).map((s) => s.extraction_result as SourceExtraction)
  const failed = (sources ?? []).filter((s) => s.extraction_status === 'failed').map((s) => ({ filename: s.original_filename, error: s.error_message }))
  const alreadyImported = (run.audit?.upload?.already_imported ?? []) as unknown[]

  if (extractions.length === 0 && alreadyImported.length === 0) {
    const { data } = await client.from('profile_enrichment_runs').update({
      status: 'failed', error_message: failed.length ? `All sources failed: ${failed.map((f) => `${f.filename}: ${f.error}`).join('; ')}` : 'Nothing extracted.',
      updated_at: new Date().toISOString(),
    }).eq('id', runId).select('*').single()
    await client.from('profile_import_batches').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', run.import_batch_id)
    return data
  }

  const proposal = buildProposal(runId, state, extractions)
  const { data } = await client.from('profile_enrichment_runs').update({
    status: 'proposed', proposal: { ...proposal, failedSources: failed, alreadyImported },
    proposed_at: new Date().toISOString(), updated_at: new Date().toISOString(), error_message: null,
  }).eq('id', runId).select('*').single()
  await client.from('profile_import_batches').update({ status: 'review_required', updated_at: new Date().toISOString() }).eq('id', run.import_batch_id)
  return data
}

// ── 3. Apply (single transaction) ───────────────────────────────────────────

export type AiContextSynthesizer = (profile: Record<string, any>, state: ExistingProfileState, orgId: string) => Promise<Record<string, unknown> | null>

export async function applyEnrichmentRun(
  client: SupabaseClient,
  args: { orgId: string; runId: string; actorRepId: string; decisions: Record<string, Decision>; synthesize?: AiContextSynthesizer },
) {
  const run = await getRunOrThrow(client, args.orgId, args.runId)
  if (run.status === 'applied') throw new EnrichmentError('This import was already applied.', 409)
  if (run.status !== 'proposed' || !run.proposal) throw new EnrichmentError(`Import is ${run.status}; nothing to apply yet.`, 409)

  const state = await loadProfileState(client, args.orgId, run.profile_id)
  if (!state) throw new EnrichmentError('Profile not found.', 404)
  const idBefore = state.profile.id as string

  const proposal = run.proposal as EnrichmentProposal
  const plan = withChronology(
    buildPlan(proposal, args.decisions ?? {}, { actorRepId: args.actorRepId, importBatchId: run.import_batch_id, sourceIds: run.source_ids }),
    state,
  )
  const auditWithUpload = { ...plan.audit, upload: run.audit?.upload ?? null }

  const { data: result, error } = await client.rpc('apply_profile_enrichment', {
    p_run_id: run.id, p_organization_id: args.orgId, p_actor_rep_id: args.actorRepId,
    p_plan: { ...plan, audit: auditWithUpload },
  })

  if (error) {
    // Transaction rolled back — the profile is untouched. Record why, keep the
    // run retryable.
    const stale = /stale proposal/i.test(error.message)
    await client.from('profile_enrichment_runs').update({ error_message: error.message, updated_at: new Date().toISOString() }).eq('id', run.id)
    if (stale) {
      const refreshed = await proposeRun(client, args.orgId, run.id)
      throw new EnrichmentError('The profile changed since this diff was generated. Review the refreshed diff.', 409, { run: refreshed })
    }
    throw new EnrichmentError(`Import failed and was rolled back: ${error.message}`, 500)
  }

  // ── Derived intelligence (outside the fact transaction; never touches facts).
  const after = await loadProfileState(client, args.orgId, run.profile_id)
  if (!after || after.profile.id !== idBefore) throw new EnrichmentError('INVARIANT VIOLATION: profile id changed.', 500)
  const derived: Record<string, unknown> = {}
  const recomputed: string[] = ['source_count', 'proof_count']
  const readiness = computeReadiness(after.profile, after.profile.source_count ?? 0)
  if (readiness !== after.profile.readiness) derived.readiness = readiness
  recomputed.push('readiness')
  if (plan.audit.derived_to_recompute.includes('ai_context') && args.synthesize) {
    try {
      const ctx = await args.synthesize(after.profile, after, args.orgId)
      if (ctx) { derived.ai_context = ctx; recomputed.push('ai_context') }
    } catch (err) {
      console.warn('[profile-enrichment] ai_context synthesis failed (profile facts already saved):', err instanceof Error ? err.message : err)
    }
  }
  if (Object.keys(derived).length > 0) {
    await client.from('profiles').update({ ...derived, updated_at: new Date().toISOString() }).eq('id', idBefore).eq('organization_id', args.orgId)
  }
  const { data: appliedRun } = await client.from('profile_enrichment_runs').select('audit').eq('id', run.id).single()
  await client.from('profile_enrichment_runs').update({
    audit: { ...(appliedRun?.audit ?? {}), derived_recomputed: recomputed }, error_message: null,
  }).eq('id', run.id)
  await client.from('profile_import_batches').update({ status: 'ready', merged_profiles: 1, updated_at: new Date().toISOString() }).eq('id', run.import_batch_id)

  return { profileId: idBefore, result, derivedRecomputed: recomputed, audit: plan.audit }
}

export async function discardEnrichmentRun(client: SupabaseClient, orgId: string, runId: string) {
  const run = await getRunOrThrow(client, orgId, runId)
  if (run.status === 'applied') throw new EnrichmentError('Applied imports cannot be discarded.', 409)
  const { data } = await client.from('profile_enrichment_runs').update({ status: 'discarded', updated_at: new Date().toISOString() }).eq('id', runId).select('*').single()
  if (run.import_batch_id) await client.from('profile_import_batches').update({ status: 'failed', error_message: 'Discarded by user', updated_at: new Date().toISOString() }).eq('id', run.import_batch_id)
  return data
}

export async function getRunOrThrow(client: SupabaseClient, orgId: string, runId: string) {
  const { data } = await client.from('profile_enrichment_runs').select('*').eq('id', runId).eq('organization_id', orgId).maybeSingle()
  if (!data) throw new EnrichmentError('Import not found.', 404)
  return data
}

// ── Human edits are the highest authority ──────────────────────────────────

const HUMAN_FIELDS = ['full_name', 'display_name', 'headline', 'current_role', 'company', 'location', 'bio', 'professional_summary', 'seniority', 'years_experience', 'positioning']

/**
 * Records manual profile edits as human_verified claims so later imports can
 * never override them. Only additive writes to profile_claims.
 */
export async function recordHumanEdits(
  client: SupabaseClient,
  args: { orgId: string; profileId: string; repId: string; before: Record<string, any>; after: Record<string, any> },
) {
  for (const field of HUMAN_FIELDS) {
    if (!(field in args.after)) continue
    const nv = args.after[field]
    if (norm(nv) === norm(args.before[field]) || nv === null || nv === undefined || nv === '') continue
    const fp = fingerprint('claim', field, nv)
    await client.from('profile_claims').update({ claim_status: 'historical', updated_at: new Date().toISOString() })
      .eq('profile_id', args.profileId).eq('claim_key', field).eq('claim_status', 'active').neq('claim_fingerprint', fp)
    const { data: existing } = await client.from('profile_claims').select('id').eq('profile_id', args.profileId).eq('claim_fingerprint', fp).maybeSingle()
    if (existing) {
      await client.from('profile_claims').update({ user_corrected: true, authority: 'human_verified', claim_status: 'active', approved_by: args.repId, updated_at: new Date().toISOString() }).eq('id', existing.id)
    } else {
      await client.from('profile_claims').insert({
        organization_id: args.orgId, profile_id: args.profileId, claim_key: field, claim_value: String(nv),
        evidence_type: 'fact', user_corrected: true, authority: 'human_verified', merge_action: 'human_edit',
        claim_status: 'active', previous_value: args.before[field] == null ? null : String(args.before[field]),
        claim_fingerprint: fp, approved_by: args.repId, extraction_version: 'human',
      })
    }
  }
}

// ── Safe profile merge B → A (explicit only) ───────────────────────────────

export async function identityCheck(client: SupabaseClient, orgId: string, sourceId: string, targetId: string) {
  const { data: rows } = await client.from('profiles').select('*').in('id', [sourceId, targetId]).eq('organization_id', orgId)
  const src = rows?.find((r) => r.id === sourceId)
  const tgt = rows?.find((r) => r.id === targetId)
  if (!src || !tgt) throw new EnrichmentError('Both profiles must exist in this organization.', 404)
  const name = src.full_name ?? src.display_name ?? src.label ?? ''
  const res = resolveIdentity(
    { normalizedName: name, email: null, linkedinUrl: src.profile_url ?? null, company: src.company ?? null, role: src.current_role ?? null, aliases: [src.display_name, src.label].filter(Boolean), sourceEvidence: [] },
    [{ id: tgt.id, fullName: tgt.full_name ?? null, displayName: tgt.display_name ?? null, label: tgt.label ?? null, headline: tgt.headline ?? null, currentRole: tgt.current_role ?? null, company: tgt.company ?? null, profileUrl: tgt.profile_url ?? null }],
  )
  const signals: string[] = [...res.reasons]
  if (src.rep_id && src.rep_id === tgt.rep_id) signals.push('Same owning rep')
  if (src.profile_url && src.profile_url === tgt.profile_url) signals.push('Same profile URL')
  const sharedSkills = (src.primary_skills ?? []).filter((s: string) => (tgt.primary_skills ?? []).map(norm).includes(norm(s)))
  if (sharedSkills.length) signals.push(`Shared skills: ${sharedSkills.slice(0, 5).join(', ')}`)
  const match = personMatchesProfile(name, { company: src.company, currentRole: src.current_role }, tgt, 1)
  return {
    score: Math.round(res.confidence * 100),
    resolution: res.resolution,
    likelySamePerson: res.resolution === 'match_existing',
    signals,
    warning: match.warning ?? (res.resolution === 'match_existing' ? null : 'Names do not strongly match — confirm these are the same person.'),
    source: { id: src.id, name, archived: !!src.archived_at },
    target: { id: tgt.id, name: tgt.full_name ?? tgt.display_name ?? tgt.label ?? '', archived: !!tgt.archived_at },
  }
}

export function mergePreviewToken(report: { counts_before?: unknown }): string {
  return sha256(JSON.stringify(report.counts_before ?? {})).slice(0, 24)
}

export async function previewProfileMerge(client: SupabaseClient, args: { orgId: string; sourceId: string; targetId: string }) {
  const identity = await identityCheck(client, args.orgId, args.sourceId, args.targetId)
  const { data: report, error } = await client.rpc('preview_profile_merge', {
    p_organization_id: args.orgId, p_source_profile_id: args.sourceId, p_target_profile_id: args.targetId,
  })
  if (error) throw new EnrichmentError(`Merge preview failed: ${error.message}`, 400)
  return { identity, report, previewToken: mergePreviewToken(report) }
}

export async function executeProfileMerge(
  client: SupabaseClient,
  args: { orgId: string; sourceId: string; targetId: string; actorRepId: string; previewToken: string; acknowledgeIdentityRisk?: boolean },
) {
  const preview = await previewProfileMerge(client, args)
  if (preview.previewToken !== args.previewToken) {
    throw new EnrichmentError('Data changed since the dry-run. Review the new preview before merging.', 409, preview)
  }
  if (!preview.identity.likelySamePerson && !args.acknowledgeIdentityRisk) {
    throw new EnrichmentError('Identities do not clearly match. Explicit acknowledgement required.', 409, preview)
  }
  const { data, error } = await client.rpc('merge_profiles', {
    p_organization_id: args.orgId, p_source_profile_id: args.sourceId, p_target_profile_id: args.targetId,
    p_actor_rep_id: args.actorRepId, p_dry_run: false, p_identity_check: preview.identity,
  })
  if (error) throw new EnrichmentError(`Merge failed and was rolled back: ${error.message}`, 500)
  return data
}
