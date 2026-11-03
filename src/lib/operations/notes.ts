import type { DbClient } from '@/lib/db/types'
/**
 * Internal notes (Phase 8.8). Internal only, organization scoped, authored,
 * timestamped, auditable. Never stored in or rendered with client messages.
 *
 * Permission model:
 * - read / write: anyone whose operational scope covers the subject
 * - edit: the author only
 * - delete (soft): the author or an org admin
 * Every create / edit / delete writes an internal_note_events row.
 */
import type { AuthContext } from '@/lib/auth/organization'
import { isMissingRelation } from '@/lib/operations/db-errors'
import { repInScope, type OperationalScope } from '@/lib/operations/scope'

export type NoteSubjectType = 'LEAD' | 'ACCOUNT' | 'REP' | 'TASK'

export const NOTE_SUBJECT_TYPES: NoteSubjectType[] = ['LEAD', 'ACCOUNT', 'REP', 'TASK']
export const NOTE_MAX_LENGTH = 4000

export interface InternalNote {
  id: string
  subjectType: NoteSubjectType
  subjectId: string
  authorRepId: string
  authorName: string | null
  body: string
  createdAt: string
  editedAt: string | null
  canEdit: boolean
  canDelete: boolean
}

export class NoteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export function isNoteSubjectType(value: unknown): value is NoteSubjectType {
  return typeof value === 'string' && (NOTE_SUBJECT_TYPES as string[]).includes(value)
}

/** Trim and validate. Throws NoteError(400) on empty / oversize bodies. */
export function normalizeNoteBody(raw: unknown): string {
  const body = typeof raw === 'string' ? raw.replace(/\r\n/g, '\n').trim() : ''
  if (!body) throw new NoteError('Note is empty.', 400)
  if (body.length > NOTE_MAX_LENGTH) throw new NoteError(`Notes are limited to ${NOTE_MAX_LENGTH} characters.`, 400)
  return body
}

export function notePermissions(
  note: { authorRepId: string },
  auth: Pick<AuthContext, 'repId' | 'isAdmin' | 'isOwner'>,
): { canEdit: boolean; canDelete: boolean } {
  const isAuthor = note.authorRepId === auth.repId
  return { canEdit: isAuthor, canDelete: isAuthor || auth.isAdmin || auth.isOwner }
}

/** Server check: may this actor read / write notes on the subject? */
export async function assertNoteSubjectAccess(
  client: DbClient,
  auth: AuthContext,
  scope: OperationalScope,
  subjectType: NoteSubjectType,
  subjectId: string,
): Promise<void> {
  if (!subjectId || subjectId.length > 200) throw new NoteError('Unknown subject.', 400)
  let allowed = false
  if (subjectType === 'REP') {
    allowed = repInScope(scope, subjectId)
  } else if (subjectType === 'LEAD') {
    const { data } = await client
      .from('leads')
      .select('owner_rep_id')
      .eq('organization_id', auth.orgId)
      .eq('id', subjectId)
      .maybeSingle()
    allowed = Boolean(data) && (scope.repIds === null || repInScope(scope, (data as { owner_rep_id: string | null }).owner_rep_id ?? ''))
  } else if (subjectType === 'ACCOUNT') {
    let q = client
      .from('leads')
      .select('id')
      .eq('organization_id', auth.orgId)
      .eq('company_key', subjectId)
      .limit(1)
    if (scope.repIds) q = q.in('owner_rep_id', scope.repIds)
    const { data } = await q
    allowed = (data ?? []).length > 0
  } else if (subjectType === 'TASK') {
    const { data } = await client
      .from('assigned_tasks')
      .select('assignee_rep_id, created_by_rep_id')
      .eq('organization_id', auth.orgId)
      .eq('id', subjectId)
      .maybeSingle()
    const row = data as { assignee_rep_id: string; created_by_rep_id: string } | null
    allowed = Boolean(row) && (repInScope(scope, row!.assignee_rep_id) || row!.created_by_rep_id === auth.repId)
  }
  if (!allowed) throw new NoteError('Not allowed.', 403)
}

interface NoteDbRow {
  id: string
  subject_type: NoteSubjectType
  subject_id: string
  author_rep_id: string
  body: string
  created_at: string
  edited_at: string | null
}

const NOTE_COLUMNS = 'id, subject_type, subject_id, author_rep_id, body, created_at, edited_at'

async function toNotes(client: DbClient, auth: AuthContext, rows: NoteDbRow[]): Promise<InternalNote[]> {
  const authorIds = [...new Set(rows.map((r) => r.author_rep_id))]
  const { data: reps } = authorIds.length
    ? await client.from('reps').select('id, name').eq('organization_id', auth.orgId).in('id', authorIds)
    : { data: [] as Array<{ id: string; name: string }> }
  const names = new Map(((reps ?? []) as Array<{ id: string; name: string }>).map((r) => [r.id, r.name]))
  return rows.map((r) => ({
    id: r.id,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    authorRepId: r.author_rep_id,
    authorName: names.get(r.author_rep_id) ?? null,
    body: r.body,
    createdAt: r.created_at,
    editedAt: r.edited_at,
    ...notePermissions({ authorRepId: r.author_rep_id }, auth),
  }))
}

/** Returns null when the notes table is not migrated yet. */
export async function listNotes(
  client: DbClient,
  auth: AuthContext,
  subjectType: NoteSubjectType,
  subjectId: string,
): Promise<InternalNote[] | null> {
  const { data, error } = await client
    .from('internal_notes')
    .select(NOTE_COLUMNS)
    .eq('organization_id', auth.orgId)
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) {
    if (isMissingRelation(error)) return null
    throw error
  }
  return toNotes(client, auth, (data ?? []) as NoteDbRow[])
}

async function audit(
  client: DbClient,
  auth: AuthContext,
  noteId: string,
  eventType: 'NOTE_CREATED' | 'NOTE_EDITED' | 'NOTE_DELETED',
  previousBody: string | null,
): Promise<void> {
  const { error } = await client.from('internal_note_events').insert({
    organization_id: auth.orgId,
    note_id: noteId,
    event_type: eventType,
    actor_rep_id: auth.repId,
    previous_body: previousBody,
  })
  if (error && !isMissingRelation(error)) console.error('internal_note_events insert failed:', error.message)
}

export async function createNote(
  client: DbClient,
  auth: AuthContext,
  input: { subjectType: NoteSubjectType; subjectId: string; body: string },
): Promise<InternalNote> {
  const { data, error } = await client
    .from('internal_notes')
    .insert({
      organization_id: auth.orgId,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      author_rep_id: auth.repId,
      body: input.body,
    })
    .select(NOTE_COLUMNS)
    .single()
  if (error || !data) {
    if (isMissingRelation(error)) throw new NoteError('Notes are not available yet.', 503)
    throw new NoteError(error?.message ?? 'Could not save note.', 500)
  }
  await audit(client, auth, (data as NoteDbRow).id, 'NOTE_CREATED', null)
  return (await toNotes(client, auth, [data as NoteDbRow]))[0]
}

async function loadNoteRow(client: DbClient, auth: AuthContext, id: string): Promise<NoteDbRow> {
  const { data, error } = await client
    .from('internal_notes')
    .select(NOTE_COLUMNS)
    .eq('organization_id', auth.orgId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) {
    if (isMissingRelation(error)) throw new NoteError('Notes are not available yet.', 503)
    throw new NoteError(error.message, 500)
  }
  if (!data) throw new NoteError('Note not found.', 404)
  return data as NoteDbRow
}

export async function editNote(
  client: DbClient,
  auth: AuthContext,
  id: string,
  body: string,
): Promise<{ note: InternalNote; subjectType: NoteSubjectType; subjectId: string }> {
  const row = await loadNoteRow(client, auth, id)
  if (!notePermissions({ authorRepId: row.author_rep_id }, auth).canEdit) {
    throw new NoteError('Only the author can edit this note.', 403)
  }
  const now = new Date().toISOString()
  const { data, error } = await client
    .from('internal_notes')
    .update({ body, edited_at: now, updated_at: now })
    .eq('organization_id', auth.orgId)
    .eq('id', id)
    .eq('author_rep_id', auth.repId)
    .select(NOTE_COLUMNS)
    .single()
  if (error || !data) throw new NoteError(error?.message ?? 'Could not edit note.', 500)
  await audit(client, auth, id, 'NOTE_EDITED', row.body)
  return { note: (await toNotes(client, auth, [data as NoteDbRow]))[0], subjectType: row.subject_type, subjectId: row.subject_id }
}

export async function deleteNote(client: DbClient, auth: AuthContext, id: string): Promise<void> {
  const row = await loadNoteRow(client, auth, id)
  if (!notePermissions({ authorRepId: row.author_rep_id }, auth).canDelete) {
    throw new NoteError('Not allowed to delete this note.', 403)
  }
  const now = new Date().toISOString()
  const { error } = await client
    .from('internal_notes')
    .update({ deleted_at: now, deleted_by_rep_id: auth.repId, updated_at: now })
    .eq('organization_id', auth.orgId)
    .eq('id', id)
  if (error) throw new NoteError(error.message, 500)
  await audit(client, auth, id, 'NOTE_DELETED', row.body)
}

export async function loadNoteSubject(
  client: DbClient,
  auth: AuthContext,
  id: string,
): Promise<{ subjectType: NoteSubjectType; subjectId: string }> {
  const row = await loadNoteRow(client, auth, id)
  return { subjectType: row.subject_type, subjectId: row.subject_id }
}
